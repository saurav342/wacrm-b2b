import type { FlowTemplate } from './templates';

/** Clone as a draft; the account owner can edit copy/assignment before activation. */
export const B2B_DOCUMENT_INTAKE: FlowTemplate = {
  slug: 'b2b_document_intake',
  name: 'B2B · RC Document Intake',
  description:
    'Welcome field agents, collect an RC photo or PDF, confirm receipt and hand off to your team.',
  icon: 'MessageSquare',
  trigger_type: 'keyword',
  trigger_config: {
    keywords: ['hi', 'hello', 'start', 'quote', 'menu', 'namaste'],
    match_type: 'exact',
  },
  entry_node_id: 'start',
  nodes: [
    {
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: 'menu' },
    },
    {
      node_key: 'menu',
      node_type: 'send_buttons',
      config: {
        text: 'Namaste! B2B quotation desk mein aapka swagat hai. Naye vehicle quotation ke liye New Quote chunein, ya team se baat karne ke liye Help.',
        buttons: [
          {
            reply_id: 'b2b_new_quote',
            title: 'New Quote',
            next_node_key: 'collect_rc',
          },
          {
            reply_id: 'b2b_help',
            title: 'Help',
            next_node_key: 'help_message',
          },
        ],
      },
    },
    {
      node_key: 'collect_rc',
      node_type: 'collect_input',
      config: {
        input_type: 'rc_document',
        prompt_text:
          'Kripya vehicle RC ki clear photo (JPG/PNG) ya PDF upload karein. Registration number aur vehicle details readable honi chahiye. Ek file bhejein; baaki pages team isi chat mein le sakti hai.',
        var_key: 'rc_document',
        next_node_key: 'receipt',
      },
    },
    {
      node_key: 'receipt',
      node_type: 'send_message',
      config: {
        text: 'RC document mil gaya hai. Aapki request team review ke liye bhej rahe hain. Yeh sirf document receipt confirmation hai; quotation abhi taiyar nahi hua hai.',
        next_node_key: 'quote_handoff',
      },
    },
    {
      node_key: 'quote_handoff',
      node_type: 'handoff',
      config: {
        note: 'B2B new quote: RC received in this conversation. Review the attachment and prepare the quotation. The flow run stores its reference in rc_document.',
      },
    },
    {
      node_key: 'help_message',
      node_type: 'send_message',
      config: {
        text: 'Team se connect kar rahe hain. Apna sawaal isi chat mein bhej dein.',
        next_node_key: 'help_handoff',
      },
    },
    {
      node_key: 'help_handoff',
      node_type: 'handoff',
      config: {
        note: 'B2B field agent requested help from the WhatsApp menu.',
      },
    },
  ],
};
