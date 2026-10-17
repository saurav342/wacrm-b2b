# B2B WhatsApp document-intake bot

The `B2B · RC Document Intake` starter template implements:

1. Field agent sends `hi`, `hello`, `start`, `quote`, `menu`, or `namaste` (exact, case-insensitive match).
2. Bot offers **New Quote** and **Help** buttons.
3. **New Quote** asks for one clear RC photo (JPEG/PNG) or PDF.
4. JPEG/PNG uploads are read by Gemini when configured, with local Tesseract.js as backup. The bot displays the vehicle number with **Confirm & proceed** and **Correct details** buttons. Only after confirmation does the conversation become **pending** for the team.
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

This does not verify whether the file depicts a genuine or complete RC. The team must review it. One upload is captured per run; additional pages can be handled in the conversation after handoff. Existing inbound-message deduplication prevents a replayed WhatsApp message from repeating the flow.

## Local RC image OCR

RC-mode collection reads JPEG/PNG images before continuing to receipt and handoff. The webhook already acknowledges Meta before processing. Images are downloaded using the account's Meta credentials, not by requesting a browser-authenticated proxy URL. When Gemini is unavailable or unconfigured, local Tesseract runs on your server with bundled English language data and no OCR API key.

Open **Flows → your flow → Runs** and expand a run's captured variables. A successful reading adds:

```json
{
  "vehicleDetails": {
    "regNumberParts": ["AN", "01", "J", "8844"]
  },
  "rc_ocr": {
    "status": "extracted",
    "confidence": 80,
    "format_corrected": false,
    "needs_review": true
  }
}
```

The example confidence is illustrative. `needs_review` is always true: OCR does not verify a registration. `proposed` means an `O` was changed to `0` in a numeric position; these proposals especially require checking against the attachment. State and series letters are never corrected. Multiple distinct registrations, low overall OCR confidence, and unsupported registration patterns produce `vehicleDetails: null`. The confidence is a whole-document score, not a field accuracy guarantee.

Images are rotated according to EXIF, resized, converted to grayscale and normalized. A second page-segmentation pass is attempted if needed. OCR is limited to two concurrent jobs per server process, a 20-second processing deadline, 5 MiB of downloaded input and 20 million decoded pixels. Busy workers, timeouts and download/recognition errors produce `failed`; oversized input produces `too_large`. When OCR fails, the bot asks the customer to type the number or upload a clearer image, then requires confirmation. Full OCR text and image bytes are not stored in run variables or logs.

PDF intake remains supported for manual review (`unsupported_format`); neither OCR path currently processes PDFs. This parser currently supports standard state/RTO/series/four-digit registrations, including a one-letter series. BH and other special registrations need additional rules. Customer confirmation is required before continuing; quotation submission is not implemented.

Worker scripts, WASM cores and language assets are included in Next.js server tracing for deployment. Restart the dev server after installing dependencies/config changes. To repeat the optional real-photo regression check without committing a personal document:

```sh
RC_OCR_TEST_IMAGE=/absolute/path/to/the/sample-AN01J8844.jpg npm test -- src/lib/flows/rc-ocr.test.ts
```

## Gemini primary reader with local backup

Add a Google AI Studio API key to the deployment's server environment (locally, `.env.local`) and restart the server:

```dotenv
GEMINI_API_KEY=your-real-api-key
RC_GEMINI_MODEL=gemini-3.5-flash-lite
```

Do not use a `NEXT_PUBLIC_` prefix or commit the key. The model setting is optional. This is a deployment-wide OCR key, separate from per-account AI Assistant settings and their usage limits. API charges apply to the configured Google project. Without a key, intake continues with local Tesseract only.

Gemini is the first reader for every supported RC image. It reuses the already-downloaded image, rotates and resizes it to fit 1600×1600, strips metadata, and sends it inline to Google's Gemini API. It does not send conversation history, Meta tokens or the media URL. Configuring the key enables external processing of RC photos. A successful Gemini reading skips Tesseract entirely. Tesseract runs only when Gemini is unconfigured, unavailable, or cannot read the registration.

Each Gemini reading makes at most one request with a 15-second network timeout and a 512-token output limit. Structured JSON is checked again on the server: incomplete/blocked responses, invalid registration formats, model prose and ambiguous output are rejected. Gemini output never receives automatic O→0 correction. All results still require team review.

In **Flows → your flow → Runs → captured variables**, a successful Gemini reading keeps the same `vehicleDetails.regNumberParts` array and sets `rc_ocr.source` to `gemini`, plus the model name. Gemini results have no confidence score. If Gemini is unavailable or cannot read the number, the local backup result is used and `rc_ocr.gemini_status` records `not_configured`, `failed`, or `unreadable`. Provider HTTP failures also record `gemini_reason` and `gemini_http_status`. The bot waits for a typed number and confirmation if neither reader succeeds.

For a live check, configure the key and upload the sample RC image through WhatsApp. Verify `source: "gemini"`, `needs_review: true` and `regNumberParts: ["AN", "01", "J", "8844"]`. Mocked provider and backup tests can run without credentials:

```sh
npm test -- src/lib/flows/rc-gemini.test.ts src/lib/flows/rc-extraction.test.ts
```

## Greetings start a run but no menu arrives

Check **Flows → your flow → Runs**. If the greeting created a run that failed at `menu` with `send_buttons_failed`, the entry trigger worked. Expand the run for the send error. Meta error `190` / subcode `463` means the stored WhatsApp token has expired. Replace it with a valid access token in WhatsApp Settings, save/reconnect, then send `hi` or `hello` again. No greeting configuration change is needed for this failure. Exact keyword matches ignore surrounding whitespace and letter case unless case sensitivity was explicitly configured.

## Integration boundary

This version collects documents and extracts a registration-number candidate from images. It extracts the requested vehicle type/subtype and dates where supported by the RC, but does not call Salesforce, publish to the quotation queue, call InsureQuote Pro, or send generated quotations. Those require separate integrations. No live account is activated by adding the template to the codebase.

## Vehicle-number confirmation

Every existing `rc_document` collection node now waits for customer confirmation without needing to recreate the flow. A successful upload sends the candidate number in chat. **Correct details** offers labelled edits for number, type, subtype, manufacturing, purchase and registration dates. Every edit sends a fresh summary for confirmation. Only the current **Confirm & proceed** button advances the flow; old buttons cannot confirm a replacement number. PDFs and unreadable images request manual entry. `rc_confirmation` records the status, candidate, and confirming message ID; OCR metadata remains available separately for team review.

The default model is now `gemini-3.5-flash-lite`: a live check returned HTTP 404 for the previous `gemini-2.5-flash-lite` model because it is unavailable to new users. Update an explicit `RC_GEMINI_MODEL` override if it still names the old model, and restart/redeploy the server.

## Requested vehicle fields

Gemini now reads manufacturing month (`MM-YYYY`), explicitly labelled purchase date (`DD-MM-YYYY`), registration date (`DD-MM-YYYY`), printed class, and explicit wheel/passenger counts. Purchase date is never substituted with registration date. Missing/unreadable values stay null. A readable date/class is retained when Tesseract supplies a missing registration number. Tesseract itself still extracts only the number.

`vehicleDetails` stores `regNumberParts`, `manufacturingDate`, `purchaseDate`, `registrationDate`, `vehicleType` (`car`, `bike`, `gcv`, `pcv`) and `subType`. The type is conservatively mapped from the printed class; LMV alone is insufficient. Subtypes use the supplied business mapping in `rc-details.ts`; wheelbase, model and door count never stand in for wheel count, and ambiguous seating is not assumed to exclude the driver. The customer can explicitly choose a subtype.

The WhatsApp summary displays every requested field. **Correct details** accepts one labelled edit per line, for example `purchase: 01-01-2025` and `subtype: C1A`. Invalid dates or incompatible type/subtype pairs are rejected atomically. Changing type clears an incompatible subtype. The customer may confirm explicitly displayed unknown fields, which remain null for team review; a registration number is still required before proceeding. Unknown dates are never fabricated to complete a quote payload.
