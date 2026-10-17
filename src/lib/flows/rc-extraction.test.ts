import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { extractRcDetails } from './rc-extraction';
import { getMediaUrl } from '@/lib/whatsapp/meta-api';
import { readRcImage } from './rc-ocr';
import type { ParsedInbound } from './types';
import { readRcWithGemini } from './rc-gemini';

vi.mock('./admin-client', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('./meta-send', () => ({
  loadAccountMetaCredentials: vi.fn(async () => ({
    accessToken: 'account-token',
  })),
}));
vi.mock('@/lib/whatsapp/meta-api', () => ({ getMediaUrl: vi.fn() }));
vi.mock('./rc-ocr', () => ({ readRcImage: vi.fn() }));
vi.mock('./rc-gemini', () => ({ readRcWithGemini: vi.fn() }));
const image: ParsedInbound = {
  kind: 'media',
  media_type: 'image',
  media_id: 'media-1',
  mime_type: 'image/jpeg',
  media_url: '/api/whatsapp/media/media-1',
  meta_message_id: 'wamid.1',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readRcWithGemini).mockResolvedValue({
    status: 'not_configured',
    regNumberParts: null,
  });
  vi.mocked(getMediaUrl).mockResolvedValue({
    url: 'https://meta.example/image',
    mimeType: 'image/jpeg',
    fileSize: 3,
  });
  vi.mocked(readRcImage).mockResolvedValue({
    confidence: 90,
    regNumberParts: ['AN', '01', 'J', '8844'],
    formatCorrected: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
  );
});
afterEach(() => vi.unstubAllGlobals());

it('downloads using account credentials and returns the requested shape', async () => {
  expect(await extractRcDetails('account-1', image)).toMatchObject({
    vehicleDetails: { regNumberParts: ['AN', '01', 'J', '8844'] },
    rc_ocr: { status: 'extracted', needs_review: true },
  });
  expect(getMediaUrl).toHaveBeenCalledWith({
    mediaId: 'media-1',
    accessToken: 'account-token',
  });
  expect(readRcImage).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  expect(readRcWithGemini).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
});
it('keeps PDFs for manual review without attempting OCR', async () => {
  expect(
    await extractRcDetails('account-1', {
      ...image,
      mime_type: 'application/pdf',
    })
  ).toMatchObject({
    vehicleDetails: null,
    rc_ocr: { status: 'unsupported_format' },
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects oversized media before downloading', async () => {
  vi.mocked(getMediaUrl).mockResolvedValue({
    url: 'https://meta.example/image',
    mimeType: 'image/jpeg',
    fileSize: 6_000_000,
  });
  expect(await extractRcDetails('account-1', image)).toMatchObject({
    rc_ocr: { status: 'too_large' },
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('does not populate vehicleDetails for unreadable images', async () => {
  vi.mocked(readRcImage).mockResolvedValue({
    confidence: 40,
    regNumberParts: null,
    formatCorrected: false,
  });
  expect(await extractRcDetails('account-1', image)).toMatchObject({
    vehicleDetails: null,
    rc_ocr: { status: 'unreadable' },
  });
});
it('preserves intake on OCR failure', async () => {
  vi.mocked(readRcImage).mockRejectedValue(new Error('OCR failure'));
  expect(await extractRcDetails('account-1', image)).toMatchObject({
    vehicleDetails: null,
    rc_ocr: { status: 'failed' },
  });
});

it('uses Gemini first and never starts Tesseract on success', async () => {
  vi.mocked(readRcWithGemini).mockResolvedValue({
    status: 'extracted',
    regNumberParts: ['GJ', '06', 'AZ', '8208'],
    model: 'gemini-2.5-flash-lite',
  });
  expect(await extractRcDetails('account-1', image)).toMatchObject({
    vehicleDetails: { regNumberParts: ['GJ', '06', 'AZ', '8208'] },
    rc_ocr: { source: 'gemini', status: 'extracted', needs_review: true },
  });
  expect(readRcWithGemini).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  expect(readRcImage).not.toHaveBeenCalled();
});

it.each(['failed', 'unreadable', 'not_configured'] as const)(
  'falls back to Tesseract when Gemini is %s',
  async (status) => {
    vi.mocked(readRcWithGemini).mockResolvedValue({
      status,
      regNumberParts: null,
    });
    expect(await extractRcDetails('account-1', image)).toMatchObject({
      vehicleDetails: { regNumberParts: ['AN', '01', 'J', '8844'] },
      rc_ocr: { source: 'tesseract', gemini_status: status },
    });
    expect(
      vi.mocked(readRcWithGemini).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(readRcImage).mock.invocationCallOrder[0]);
  }
);

it.each(['failed', 'unreadable', 'not_configured'] as const)(
  'keeps the local proposal when Gemini is %s',
  async (status) => {
    vi.mocked(readRcImage).mockResolvedValue({
      confidence: 70,
      regNumberParts: ['AN', '01', 'J', '8844'],
      formatCorrected: true,
    });
    vi.mocked(readRcWithGemini).mockResolvedValue({
      status,
      regNumberParts: null,
    });
    expect(await extractRcDetails('account-1', image)).toMatchObject({
      vehicleDetails: { regNumberParts: ['AN', '01', 'J', '8844'] },
      rc_ocr: {
        source: 'tesseract',
        status: 'proposed',
        format_corrected: true,
        gemini_status: status,
      },
    });
  }
);

it('preserves Gemini dates and classification when Tesseract supplies only the number', async () => {
  vi.mocked(readRcWithGemini).mockResolvedValue({
    status: 'unreadable',
    regNumberParts: null,
    vehicleDetails: {
      regNumberParts: null,
      manufacturingDate: '09-2024',
      registrationDate: '02-01-2025',
      purchaseDate: null,
      vehicleType: 'pcv',
      subType: null,
    },
  });
  expect(await extractRcDetails('account-1', image)).toMatchObject({
    vehicleDetails: {
      regNumberParts: ['AN', '01', 'J', '8844'],
      manufacturingDate: '09-2024',
      registrationDate: '02-01-2025',
      purchaseDate: null,
      vehicleType: 'pcv',
      subType: null,
    },
  });
});
