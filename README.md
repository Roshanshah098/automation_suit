# Claude Automation Suite

A single Node.js/Express app that combines three automations originally built as
n8n workflows, rewired to run as real code and powered end-to-end by the Claude API:

1. **AI CV Screening** — candidate submits a form + resume PDF → Claude rates
   the fit against your job description → row saved to Google Sheets → HR and
   the candidate are emailed automatically.
2. **Invoice Extraction** — polls Gmail for invoice emails → pulls text from
   PDF attachments → Claude extracts structured invoice + line-item data →
   each line is written to Google Sheets → email is marked read.
3. **Smart AI Webhook Router** — any JSON payload posted to a webhook is
   classified by Claude into a route (`support` / `sales` / `technical` /
   `general`), a priority, and a one-line summary.

## 1. Install

```bash
npm install
cp .env.example .env
```

## Testing for free (no Anthropic API credits needed)

Anthropic's API is pay-as-you-go — new accounts sometimes get a small starter
credit, but there's no guaranteed permanent free tier. If you just want to
try this project out first, set in `.env`:

```
MOCK_MODE=true
```

With this on, **every Claude-powered step returns a realistic canned response
instead of making a real API call** — no key required, zero cost:

- CV screening returns a mock rating like `"7/10 — Interview"`
- Invoice extraction returns a mock invoice with one sample line item
- The AI router uses a simple keyword heuristic to pick a route (e.g. the
  word "refund" routes to `support`) instead of asking Claude

Every mock response is clearly labeled `[MOCK — no API call made]` so you
never mistake it for a real AI result. This lets you fully exercise the
upload form, PDF parsing, Google Sheets writes, and email sending — the
**only** part being faked is the Claude call itself.

The **AI router** (`/api/ai-router`) needs no Google setup at all, so with
`MOCK_MODE=true` you can test it immediately after `npm install` — skip
straight to step 4 below. CV screening and invoice extraction still write to
Gmail/Sheets (a separate, genuinely free Google API), so they need the
one-time Google OAuth setup in step 3 regardless of mock mode.

When you're ready for real AI output: add a funded `ANTHROPIC_API_KEY` (see
console.anthropic.com → Billing) and set `MOCK_MODE=false`.

## 2. Fill in `.env`

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | From https://console.anthropic.com/ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth2 credentials (see below) |
| `GOOGLE_REFRESH_TOKEN` | Generated once via `npm run get-google-token` |
| `CV_SPREADSHEET_ID`, `INVOICE_SPREADSHEET_ID` | The long ID in a Google Sheet's URL |
| `HR_EMAIL`, `JOB_TITLE`, `JOB_DESCRIPTION` | Used by the CV screening workflow |
| `ENABLE_INVOICE_POLLER` | `true` to auto-poll Gmail every minute; otherwise trigger manually |

## 3. Google setup (Gmail + Sheets)

1. Go to https://console.cloud.google.com/apis/credentials, create a project,
   and enable the **Gmail API** and **Google Sheets API**.
2. Under **Credentials**, create an **OAuth client ID** of type "Web application".
   Add `http://localhost:3000/oauth2callback` as an authorized redirect URI.
3. Copy the client ID/secret into `.env`.
4. Run:
   ```bash
   npm run get-google-token
   ```
   Open the printed URL, approve access, and paste the `code` param back into
   the terminal. Copy the printed `GOOGLE_REFRESH_TOKEN` into `.env`.
5. Share your target Google Sheet(s) with the Google account you authenticated
   with (or just use that account's own sheets), and paste their spreadsheet
   IDs into `.env`.

> Note: this uses your own Gmail account (send + read), not a service account —
> matching how the original n8n Gmail nodes worked with an OAuth-connected inbox.

## 4. Run it

```bash
npm start        # production
npm run dev       # auto-restarts on file changes (Node's --watch)
```

Server starts on `http://localhost:3000` (change with `PORT` in `.env`).

## 5. Open the dashboard

Once the server is running, open:

```
http://localhost:3000
```

This is the **Automation Control Room** — one page with all three workflows,
built so a non-technical person can see automation actually happening, not
just call raw API endpoints:

- **CV Screening** — a real form on the left; submit it and watch the status
  badge go from Idle → Working → Done
- **Invoice Extraction** — a "Check inbox now" button that triggers a live
  Gmail poll
- **AI Router** — paste any message/JSON and see how Claude classifies it
- **Live activity log** — a real-time feed across the bottom (via
  Server-Sent Events) showing every step of every workflow as it happens:
  "Resume parsed (471 words)", "AI rating generated", "Saved to Google
  Sheet", "HR notified by email", etc. — so it's visible when a task is
  running versus done, not just a silent JSON response.

The plain test form (`cv-screening-form.html`) still exists if you ever want
a bare, dependency-free page for CV screening specifically.

## 6. Try each workflow directly (optional — the dashboard covers all of this)

### CV Screening
With curl, if you'd rather not use the dashboard form:

```bash
curl -X POST http://localhost:3000/api/cv-screening \
  -F fullName="Jane Doe" \
  -F email="jane@example.com" \
  -F expectation="2500-3000$" \
  -F linkedin="https://linkedin.com/in/janedoe" \
  -F resume=@/path/to/resume.pdf
```

### Invoice Extraction
Send yourself a test email with subject containing "invoice" and a PDF
attachment, then trigger a manual run:

```bash
curl -X POST http://localhost:3000/api/invoice-extraction/run
```

Check status/config:
```bash
curl http://localhost:3000/api/invoice-extraction/status
```

Set `ENABLE_INVOICE_POLLER=true` in `.env` to have this run automatically
every minute instead.

### Smart AI Webhook Router
```bash
curl -X POST http://localhost:3000/api/ai-router \
  -H "Content-Type: application/json" \
  -d '{"message": "My payment failed twice and I need a refund"}'
```

Response:
```json
{ "received": true, "route": "support", "priority": "high", "summary": "..." }
```

Add real branch logic (create a ticket, push to Slack, etc.) inside the
`switch` statement in `src/routes/aiRouter.js`.

## Project structure

```
src/
  config/         env loading + validation
  services/       claudeService, gmailService, sheetsService, pdfService, googleAuth
  routes/         cvScreening.js, invoiceExtraction.js, aiRouter.js, events.js (SSE)
  jobs/           invoicePoller.js (cron)
  middleware/     upload.js (multer), errorHandler.js
  utils/          logger.js, activityBus.js (live activity pub/sub)
  server.js       Express app entry point
scripts/
  getGoogleRefreshToken.js   one-time OAuth helper
public/
  index.html                 Automation Control Room dashboard (served at /)
  cv-screening-form.html      bare CV screening test form (no dashboard chrome)
```

## Customizing

- **Rating rubric / job description**: edit `JOB_DESCRIPTION` in `.env`, or the
  system prompt in `src/services/claudeService.js` → `rateCandidate`.
- **Invoice fields**: edit the JSON shape requested in `extractInvoiceData` and
  the columns written in `src/routes/invoiceExtraction.js`.
- **Router routes**: edit `AI_ROUTER_ROUTES` in `.env` and the `switch` block
  in `src/routes/aiRouter.js`.
- **Swap Gmail for something else**: the invoice workflow's Gmail trigger can
  be replaced with any source that hands you a PDF buffer (webhook upload,
  S3 event, etc.) — just feed the buffer into `pdfService.extractText`.
- **Dashboard look**: colors/type live at the top of `public/index.html` as
  CSS variables (`--ink`, `--panel`, `--paper`, `--amber`, `--mint`,
  `--coral`) — change those to re-theme the whole page in one place.
- **Live activity log**: any route can call
  `broadcast('workflow-name', 'processing'|'success'|'error'|'info', 'message')`
  from `src/utils/activityBus.js` to add more steps to the live feed.
