# Raven

Raven is Wiener Labs' personal outreach engine. It turns a contact list into one specific AI solution per person, then reaches every contact with a personal email (or a WhatsApp message when there is no email), a personal one page solution brief, one click replies and polite follow ups. Every step is paced, tracked and stoppable.

The product UI is Turkish. The visual language follows the Paralyx design system: Sora Light, lavender accent reserved for interactive elements, pill buttons and rounded cards. The admin panel and login open in a dark theme by default (a toggle switches to light and is remembered per browser); recipient facing pages and emails stay light and carry the Wiener Labs mark, while the panel carries the Raven mark.

## What it does

- **Import** Excel or CSV lists (Apollo style exports and Turkish headers are recognised). Duplicates merge by email or phone. Sanctioned country domains and consent jurisdictions are held automatically.
- **Research** each company from its email domain (homepage title, description, text excerpt) and check MX records before sending.
- **Personalise** with Claude: one solution per person (problem, three step system, capabilities, two week pilot, metrics, security note), an email with A/B subjects, two follow ups, a WhatsApp text and a landing page. A validator blocks em dashes, exclamation marks, emoji, spam words, raw links, crypto solutions, gendered honorifics and names that do not match the list.
- **Review** every pitch in the panel with live previews of all emails, the WhatsApp bubble and the landing page. Edit fields or the full JSON, send yourself a test, approve in bulk.
- **Launch once.** Raven spreads the sends across business hours with random gaps, per sender daily limits and sender rotation. Follow ups thread under the first email and stop as soon as the person replies, clicks a reply button, unsubscribes or bounces. A bounce guard pauses the campaign if the bounce rate climbs.
- **Get answers.** Each email carries one click reply buttons (meeting, send details, not now), a personal brief with a note form and calendar link, and IMAP sync that detects replies, auto replies and bounces in the sender mailbox. Every response lands in the inbox page and can notify the team by email or Slack.
- **WhatsApp both ways.** With a business number set, every email and personal brief offers "WhatsApp'tan yazın". The prefilled message carries a reference code, so the webhook links the sender's number to the right contact, records their WhatsApp consent and drops the message into the inbox. Contacts without email get click to chat links with the personal text prefilled, or an approved Cloud API template when they opted in. Inside the 24 hour service window the team replies from the panel.
- **See the response curve.** The dashboard charts cumulative replies, daily replies or the reply rate over 14, 30 or 90 days against daily sends, marks meeting requests, breaks replies down by intent and shows reply rates per sector. It refreshes itself every minute.
- **Sign in with Face ID.** Team members add a passkey from Settings or through a one time invite link and then sign in with Face ID, Touch ID or Windows Hello. Faces never leave the device; Raven only verifies the signature. The admin password keeps working as a fallback.

## Stack

Next.js 16 (App Router, server actions, proxy), React 19, Tailwind CSS 4, Drizzle ORM on Postgres (PGlite for tests and local work), nodemailer and imapflow, the Anthropic SDK, Vitest.

```
contacts, settings -> research (website, MX) -> Claude -> validator -> pitch
approved pitches -> launch -> slot planner -> messages (scheduled)
cron, worker or panel -> dispatcher (SKIP LOCKED) -> SMTP, Resend or WhatsApp
recipient -> landing page, reply buttons, unsubscribe -> events, responses, suppressions
sender inbox -> IMAP sync -> replies, auto replies, bounces
```

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run import:contacts -- "path/to/list.xlsx"
npm run generate
npm run build && npm start
```

`DATABASE_URL` accepts any Postgres URL or `pglite:./.data/raven` for a zero install local database. Without `EMAIL_PROVIDER=smtp` or `resend`, Raven runs in console mode and never sends real email. Pre generated pitch files keyed by email can be loaded with `npm run import:pitches -- file.json --approve-clean`.

## Sending setup

1. Use a dedicated sending domain or subdomain and add SPF, DKIM and DMARC records. The settings page checks all three and verifies the SMTP login.
2. With Google Workspace, enable two step verification on the sender mailbox and create an app password. SMTP is `smtp.gmail.com:465`, IMAP is `imap.gmail.com:993`.
3. Warm new mailboxes for two weeks at 20 to 40 emails a day, then raise `SENDER_DAILY_LIMIT` gradually. Several mailboxes can be listed as JSON in `RAVEN_SENDERS` and Raven rotates between them.
4. Send yourself tests from a contact page before launching. Links opened from test emails run in preview mode and never change a contact.

Resend is supported through `EMAIL_PROVIDER=resend`, with its webhook at `/api/webhooks/resend`. Check the provider's policy on outreach before using it for contacts who have not opted in.

## Scheduling

The dispatcher sends whatever is due and is safe to run from several places at once (rows are claimed with `FOR UPDATE SKIP LOCKED`).

- **Vercel cron:** `vercel.json` runs `/api/cron/dispatch` once a day, which is all the Hobby plan allows. On Pro, change the schedule to `* * * * *`.
- **External scheduler:** call `GET /api/cron/dispatch` every minute with `Authorization: Bearer <CRON_SECRET>` (for example from cron-job.org). Add `?inbox=1` to force an inbox sync.
- **Worker:** `npm run worker` dispatches every 30 seconds and syncs inboxes every 5 minutes against the configured database.
- **Panel:** turn on live sending on the campaign page to dispatch from an open browser tab.

## WhatsApp setup

Everything is configured on the WhatsApp page of the panel; environment variables are only a fallback.

1. **Business number.** Enter the WhatsApp Business number people should write to. Emails and personal briefs immediately show a "WhatsApp'tan yazın" button that opens a chat with a prefilled message and a reference code such as `R-AbCdE12345`.
2. **Cloud API.** In Meta Business create a system user token with `whatsapp_business_messaging` and `whatsapp_business_management`, then paste the token, the phone number ID and the WhatsApp Business account ID. The token and the app secret are stored encrypted (AES-256-GCM, key derived from `RAVEN_SESSION_SECRET`) and are never sent back to the browser.
3. **Webhook.** Copy the callback URL (`/api/webhooks/whatsapp`) and the generated verify token into the Meta app, subscribe to `messages`, and save the app secret so every delivery is signature checked.
4. **Template.** "Şablonu Meta'ya gönder" submits the `raven_intro` marketing template in Turkish and English with a URL button pointing at `https://<your domain>/r/{{1}}`; "Şablon durumunu yenile" shows the review result.
5. **Automatic sending.** Once the template is approved, turn on automatic sending. Templates only go to contacts with WhatsApp consent; everyone else stays in the one tap manual queue.

Inbound messages are classified like email replies, `DUR` or `STOP` suppresses the number, and repeated webhook deliveries are ignored.

## Face ID sign in

Passkeys use WebAuthn with the relying party set to the host of `RAVEN_BASE_URL`, so they only work on the production domain (and on `localhost` during development). Challenges are single use and expire after five minutes, invites are single use and expire after 48 hours, and removing a person from Settings ends their open sessions.

## Compliance defaults

Every email names the sender and company, states why the reader received it and where the data came from, links the KVKK notice at `/gizlilik`, and offers a one click unsubscribe (`List-Unsubscribe` and `List-Unsubscribe-Post` per RFC 8058). Suppressions cover email, phone and domain and are checked before every send. Contacts flagged for sanctions or consent review stay on hold until an admin records the review. Before large campaigns in Türkiye, confirm your İYS obligations for commercial electronic messages.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run import:contacts -- file.xlsx` | Import a list |
| `npm run import:pitches -- file.json [--approve-clean]` | Load pitch JSON keyed by email |
| `npm run pitches:validate -- pitches.json contacts.json` | Validate pitch files |
| `npm run generate [-- --limit=20]` | Generate missing pitches with Claude |
| `npm run worker` | Long running dispatcher and inbox sync |
| `npm test` | Unit and integration tests on PGlite |
| `TEST_DATABASE_URL=postgres://... npm test` | Run the database tests on a real Postgres server |

## Environment

See `.env.example`. SMTP and IMAP passwords, the Anthropic key, the admin password, the session secret and the cron secret live in the environment. WhatsApp credentials can be entered in the panel, where they are stored encrypted. Non secret settings (sender profile, offer text, calendar link, legal details) are edited in the panel.
