import { getMediaUrl } from '@/lib/whatsapp/meta-api';
import { loadAccountMetaCredentials } from './meta-send';
import { supabaseAdmin } from './admin-client';
import type { ParsedInbound } from './types';
import { readRcWithGemini } from './rc-gemini';

const MAX_BYTES = 5 * 1024 * 1024;

export async function extractRcDetails(
  accountId: string,
  message: ParsedInbound
) {
  const review = (status: string) => ({
    vehicleDetails: null,
    rc_ocr: { status, needs_review: true },
  });
  if (
    message.kind !== 'media' ||
    !['image/jpeg', 'image/png'].includes(message.mime_type)
  ) {
    return review('unsupported_format');
  }
  try {
    const { accessToken } = await loadAccountMetaCredentials(
      supabaseAdmin(),
      accountId
    );
    // Resolve through Meta using this account's credentials. Never fetch an
    // arbitrary user-supplied URL or our session-authenticated media proxy.
    const media = await getMediaUrl({ mediaId: message.media_id, accessToken });
    if (!['image/jpeg', 'image/png'].includes(media.mimeType))
      return review('unsupported_format');
    if (media.fileSize !== null && media.fileSize > MAX_BYTES)
      return review('too_large');
    const response = await fetch(media.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok || !response.body) return review('failed');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) return review('too_large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const image = Buffer.concat(chunks);
    // Read the image with Gemini first. Only load/start a local worker if the
    // provider is unavailable, unconfigured, or cannot read the registration.
    const gemini = await readRcWithGemini(image);
    if (gemini.regNumberParts) {
      return {
        vehicleDetails: {
          ...gemini.vehicleDetails,
          regNumberParts: gemini.regNumberParts,
        },
        rc_ocr: {
          status: 'extracted',
          source: 'gemini',
          model: gemini.model,
          needs_review: true,
          format_corrected: false,
        },
      };
    }
    const result = await import('./rc-ocr')
      .then(({ readRcImage }) => readRcImage(image))
      .catch(() => null);
    const local = result
      ? {
          vehicleDetails: result.regNumberParts
            ? { regNumberParts: result.regNumberParts }
            : null,
          rc_ocr: {
            status: result.regNumberParts
              ? result.formatCorrected
                ? 'proposed'
                : 'extracted'
              : 'unreadable',
            confidence: result.confidence,
            format_corrected: result.formatCorrected,
            needs_review: true,
            source: 'tesseract',
          },
        }
      : review('failed');
    return {
      ...local,
      vehicleDetails: gemini.vehicleDetails
        ? {
            ...gemini.vehicleDetails,
            regNumberParts: local.vehicleDetails?.regNumberParts ?? null,
          }
        : local.vehicleDetails,
      rc_ocr: {
        ...local.rc_ocr,
        gemini_status: gemini.status,
        ...(gemini.reason ? { gemini_reason: gemini.reason } : {}),
        ...(gemini.http_status
          ? { gemini_http_status: gemini.http_status }
          : {}),
        ...(gemini.model ? { gemini_model: gemini.model } : {}),
      },
    };
  } catch {
    // No raw OCR text, credentials, document bytes, or URLs in logs.
    return review('failed');
  }
}
