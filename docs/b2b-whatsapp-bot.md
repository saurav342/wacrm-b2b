# B2B WhatsApp document-intake bot

The `B2B · RC Document Intake` starter template implements:

1. Field agent sends `hi`, `hello`, `start`, `quote`, `menu`, or `namaste` (exact, case-insensitive match).
2. Bot offers **New Quote** and **Help** buttons.
3. **New Quote** asks for one clear RC photo (JPEG/PNG) or PDF.
4. An accepted upload receives a document-receipt confirmation, then the conversation becomes **pending** for the team.
5. **Help** sends a team-connection message and hands off immediately.

The template's copy is Hinglish and can be edited in the flow builder. Uploads remain in the conversation; `flow_runs.vars.rc_document` stores the WhatsApp message/media IDs, MIME type, URL and optional filename. It does not duplicate document bytes. Existing account-scoped webhook, media, flow and inbox access controls continue to apply.

## Configure and activate

1. Follow the project README to configure `.env.local` with the Supabase settings, encryption key and Meta App Secret. Apply the project's existing Supabase migrations; this feature needs no new migration.
2. Run `npm run dev`, sign in, and connect the account's WhatsApp Business number in Settings.
3. Configure the public HTTPS Meta callback to `/api/whatsapp/webhook` with the account's verification token and subscribe to messages. Follow the existing WhatsApp setup documentation for credentials and webhook verification.
4. Open **Flows**, create a flow from **B2B · RC Document Intake**, and review the prompts. Set an assignee on the handoff nodes if desired; otherwise the conversation enters the team's pending inbox.
5. Activate the flow. Avoid another active flow with overlapping greeting keywords; existing dispatch selects the first matching flow.
6. Send `hi` to the connected number from an agent's WhatsApp, tap **New Quote**, upload RC, and verify receipt plus pending status in the inbox. Start a new conversation/test contact to check the **Help** path.

## Capture behavior

The existing **Collect input** node now has a **Reply type** selector. The default remains text; RC mode accepts image/jpeg, image/png or application/pdf with a retrievable media reference. Non-PDF documents, text, and media whose retrieval failed do not receive a success confirmation. Existing fallback policy reprompts twice and then hands off by default. Image/PDF captions no longer satisfy text-only collection prompts.

This validates transport/type only, not whether the file depicts a real, complete or legible RC. The team must review it. One upload is captured per run; additional pages can be handled in the conversation after handoff. Existing inbound-message deduplication prevents a replayed WhatsApp message from repeating the flow.

## Integration boundary

This version confirms document intake only. It does not extract vehicle details, call Salesforce, publish to the quotation queue, call InsureQuote Pro, or send generated quotations. Those require separate integrations. No live account is activated by adding the template to the codebase.
