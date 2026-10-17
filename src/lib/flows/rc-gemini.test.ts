import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { readRcWithGemini } from './rc-gemini';
import { normalizeDetails } from './rc-details';

let image: Buffer;
const reply = (value: unknown, finishReason = 'STOP') =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason,
          content: {
            parts: [{ text: JSON.stringify({ registrationNumber: value }) }],
          },
        },
      ],
    })
  );
beforeAll(async () => {
  image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
});
beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini-secret');
  vi.stubEnv('RC_GEMINI_MODEL', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply('AN01J 8844'))
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('skips Gemini entirely without a configured key', async () => {
  vi.stubEnv('GEMINI_API_KEY', '');
  expect(await readRcWithGemini(image)).toEqual({
    status: 'not_configured',
    regNumberParts: null,
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('sends a bounded inline image request and validates the registration', async () => {
  expect(await readRcWithGemini(image)).toEqual({
    status: 'extracted',
    regNumberParts: ['AN', '01', 'J', '8844'],
    model: 'gemini-3.5-flash-lite',
    vehicleDetails: normalizeDetails({
      regNumberParts: ['AN', '01', 'J', '8844'],
    }),
  });
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
  );
  expect(String(url)).not.toContain('test-gemini-secret');
  expect(init?.headers).toMatchObject({
    'x-goog-api-key': 'test-gemini-secret',
  });
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  const body = JSON.parse(init?.body as string);
  expect(body.generationConfig).toMatchObject({
    maxOutputTokens: 512,
    responseMimeType: 'application/json',
  });
  expect(body.contents[0].parts[1].inlineData.mimeType).toBe('image/jpeg');
  expect(body.contents[0].parts[1].inlineData.data).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  null,
  'ANO1J8844',
  'XX01J8844',
  'The registration is AN01J8844',
  'AN01J8844 GJ06AZ8208',
  1234,
])('requires review for invalid or ambiguous output %s', async (value) => {
  vi.mocked(fetch).mockResolvedValue(reply(value));
  expect(await readRcWithGemini(image)).toMatchObject({
    status: 'unreadable',
    regNumberParts: null,
  });
});
it.each(['MAX_TOKENS', 'SAFETY', 'SPII'])(
  'rejects incomplete/blocked responses: %s',
  async (reason) => {
    vi.mocked(fetch).mockResolvedValue(reply('AN01J8844', reason));
    expect(await readRcWithGemini(image)).toMatchObject({
      status: 'unreadable',
      regNumberParts: null,
    });
  }
);
it('fails safely on malformed JSON', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('not-json'));
  expect(await readRcWithGemini(image)).toMatchObject({
    status: 'failed',
    regNumberParts: null,
  });
});
it.each([401, 404, 429, 500])(
  'does not retry provider HTTP %s errors',
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('provider error', { status })
    );
    expect(await readRcWithGemini(image)).toMatchObject({
      status: 'failed',
      regNumberParts: null,
      http_status: status,
      reason:
        status === 404
          ? 'model_unavailable'
          : status === 429
            ? 'quota_or_rate_limit'
            : status === 401
              ? 'authentication_or_permission'
              : 'provider_error',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);
it('handles network timeouts without throwing', async () => {
  vi.mocked(fetch).mockRejectedValue(
    new DOMException('Timed out', 'TimeoutError')
  );
  expect(await readRcWithGemini(image)).toMatchObject({
    status: 'failed',
    regNumberParts: null,
  });
});
it('rejects corrupt images before sending them', async () => {
  expect(await readRcWithGemini(Buffer.from('invalid'))).toMatchObject({
    status: 'failed',
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('allows a configured Gemini model but prevents URL injection', async () => {
  vi.stubEnv('RC_GEMINI_MODEL', 'gemini-2.5-flash');
  expect(await readRcWithGemini(image)).toMatchObject({
    model: 'gemini-2.5-flash',
  });
  expect(vi.mocked(fetch).mock.calls[0][0]).toContain(
    '/gemini-2.5-flash:generateContent'
  );
  vi.mocked(fetch).mockClear();
  vi.stubEnv('RC_GEMINI_MODEL', '../../other?key=bad');
  expect(await readRcWithGemini(image)).toMatchObject({ status: 'failed' });
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves partial details when registration is unreadable', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    registrationNumber: null,
                    manufacturingDate: '09-2024',
                    registrationDate: '02-01-2025',
                    purchaseDate: null,
                    vehicleClass: 'Motor Cab',
                    wheelCount: null,
                    passengerCapacityExcludingDriver: null,
                  }),
                },
              ],
            },
          },
        ],
      })
    )
  );
  expect(await readRcWithGemini(image)).toMatchObject({
    status: 'unreadable',
    regNumberParts: null,
    vehicleDetails: {
      manufacturingDate: '09-2024',
      registrationDate: '02-01-2025',
      purchaseDate: null,
      vehicleType: 'pcv',
      subType: null,
    },
  });
});
