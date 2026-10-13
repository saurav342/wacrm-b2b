import type { CollectInputNodeConfig, ParsedInbound } from './types';

/** A reference to the inbound message, never a copy of the document bytes. */
export function captureInput(
  config: CollectInputNodeConfig,
  message: ParsedInbound
): string | Record<string, string> | null {
  if (config.input_type === 'rc_document') {
    if (message.kind !== 'media' || !message.media_id || !message.media_url)
      return null;
    const allowed =
      message.media_type === 'image'
        ? ['image/jpeg', 'image/png'].includes(message.mime_type)
        : message.mime_type === 'application/pdf';
    if (!allowed) return null;
    return {
      message_id: message.meta_message_id,
      media_id: message.media_id,
      media_type: message.media_type,
      mime_type: message.mime_type,
      media_url: message.media_url,
      ...(message.filename ? { filename: message.filename } : {}),
    };
  }
  if (config.input_type && config.input_type !== 'text') return null;
  return message.kind === 'text' ? message.text.trim() || null : null;
}
