/** Persist actionable provider diagnostics without credentials or requests. */
export function describeFlowSendError(error: unknown): Record<string, unknown> {
  const meta = error as {
    code?: unknown;
    subcode?: unknown;
    httpStatus?: unknown;
  } | null;
  const detail = error instanceof Error ? error.message : String(error);
  if (meta?.code === 190) {
    return {
      detail:
        meta.subcode === 463
          ? 'WhatsApp access token has expired. Reconnect WhatsApp in Settings with a valid access token, then send hi or hello again.'
          : 'WhatsApp access token is invalid. Reconnect WhatsApp in Settings with a valid access token, then send hi or hello again.',
      meta_code: 190,
      meta_subcode: typeof meta.subcode === 'number' ? meta.subcode : null,
      ...(typeof meta.httpStatus === 'number'
        ? { http_status: meta.httpStatus }
        : {}),
    };
  }
  return { detail };
}
