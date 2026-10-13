import { describe, it, expect } from 'vitest';
import { captureInput } from './capture-input';
import { B2B_DOCUMENT_INTAKE } from './b2b-intake-template';
import { validateFlowForActivation } from './validate';
import type { CollectInputNodeConfig, ParsedInbound } from './types';

const config: CollectInputNodeConfig = {
  input_type: 'rc_document',
  prompt_text: 'Upload RC',
  var_key: 'rc_document',
  next_node_key: 'receipt',
};
const image: ParsedInbound = {
  kind: 'media',
  media_type: 'image',
  media_id: '123',
  mime_type: 'image/jpeg',
  media_url: '/api/whatsapp/media/123',
  meta_message_id: 'wamid.123',
};

describe('RC document capture', () => {
  it('captures image references without storing bytes', () => {
    expect(captureInput(config, image)).toMatchObject({
      media_id: '123',
      message_id: 'wamid.123',
      mime_type: 'image/jpeg',
    });
  });
  it('accepts a PDF and preserves its filename', () => {
    expect(
      captureInput(config, {
        ...image,
        media_type: 'document',
        mime_type: 'application/pdf',
        filename: 'RC.pdf',
      })
    ).toMatchObject({ filename: 'RC.pdf' });
  });
  it.each(['image/gif', 'application/msword', 'application/octet-stream'])(
    'rejects unsupported MIME %s',
    (mime_type) => {
      expect(captureInput(config, { ...image, mime_type })).toBeNull();
    }
  );
  it('requires a verified retrievable media reference', () => {
    expect(captureInput(config, { ...image, media_url: null })).toBeNull();
    expect(captureInput(config, { ...image, media_id: '' })).toBeNull();
  });
  it('does not treat a text reply as an uploaded document', () => {
    expect(
      captureInput(config, {
        kind: 'text',
        text: 'RC.pdf',
        meta_message_id: '1',
      })
    ).toBeNull();
  });
  it('preserves default text capture and rejects media at text prompts', () => {
    const textConfig = { ...config, input_type: undefined };
    expect(
      captureInput(textConfig, {
        kind: 'text',
        text: '  Agent  ',
        meta_message_id: '1',
      })
    ).toBe('Agent');
    expect(captureInput(textConfig, image)).toBeNull();
  });
  it('ships a connected, activatable B2B template', () => {
    expect(
      validateFlowForActivation(
        {
          ...B2B_DOCUMENT_INTAKE,
          trigger_config: { ...B2B_DOCUMENT_INTAKE.trigger_config },
        },
        B2B_DOCUMENT_INTAKE.nodes.map((n) => ({
          ...n,
          config: { ...n.config },
        }))
      )
    ).toEqual([]);
  });
  it('rejects an unknown capture mode during activation', () => {
    const nodes = B2B_DOCUMENT_INTAKE.nodes.map((n) =>
      n.node_type === 'collect_input'
        ? { ...n, config: { ...n.config, input_type: 'invalid' } }
        : n
    );
    expect(
      validateFlowForActivation(
        {
          ...B2B_DOCUMENT_INTAKE,
          trigger_config: { ...B2B_DOCUMENT_INTAKE.trigger_config },
        },
        nodes.map((n) => ({ ...n, config: { ...n.config } }))
      )
    ).toContainEqual(
      expect.objectContaining({ field: 'input_type', severity: 'error' })
    );
  });
});
