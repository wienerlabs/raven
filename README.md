# Raven

Raven is Wiener Labs' personal outreach engine. It turns a contact list into one specific AI solution per person, then reaches every contact with a personal email (or a WhatsApp message when there is no email), a personal one page solution brief, one click replies and polite follow ups. Every step is paced, tracked and stoppable.

The product UI is Turkish. The visual language follows the Paralyx design system: Sora Light, white canvas, lavender accent reserved for interactive elements, pill buttons and rounded cards.

## What it does

- **Import** Excel or CSV lists (Apollo style exports and Turkish headers are recognised). Duplicates merge by email or phone. Sanctioned country domains and consent jurisdictions are held automatically.
- **Research** each company from its email domain (homepage title, description, text excerpt) and check MX records before sending.
- **Personalise** with Claude: one solution per person (problem, three step system, capabilities, two week pilot, metrics, security note), an email with A/B subjects, two follow ups, a WhatsApp text and a landing page. A validator blocks em dashes, exclamation marks, emoji, spam words, raw links, crypto solutions, gendered honorifics and names that do not match the list.
- **Review** every pitch in the panel with live previews of all emails, the WhatsApp bubble and the landing page. Edit fields or the full JSON, send yourself a test, approve in bulk.
- **Launch once.** Raven spreads the sends across business hours with random gaps, per sender daily limits and sender rotation. Follow ups thread under the first email and stop as soon as the person replies, clicks a reply button, unsubscribes or bounces. A bounce guard pauses the campaign if the bounce rate climbs.
- **Get answers.** Each email carries one click reply buttons (meeting, send details, not now), a personal brief with a note form and calendar link, and IMAP sync that detects replies, auto replies and bounces in the sender mailbox. Every response lands in the inbox page and can notify the team by email or Slack.
- **WhatsApp** for contacts without email: click to chat links with the personal text prefilled (default), or the WhatsApp Business Cloud API with an approved template for contacts who opted in.

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

## WhatsApp templates

Business initiated Cloud API messages need an approved template. Suggested template `raven_intro`, category marketing, with a URL button whose base is `https://<your domain>/r/`:

- Turkish body: `Merhaba {{1}}, ben Wiener Labs'ten yazıyorum. {{2}} için {{3}} üzerine kısa bir çözüm taslağı hazırladık. İncelemek isterseniz aşağıdaki bağlantı size özel. İstemezseniz DUR yazmanız yeterli.`
- English body: `Hi {{1}}, this is Wiener Labs. We prepared a short solution brief on {{3}} for {{2}}. The link below is yours. Reply STOP if you would rather not hear from us.`

Webhook: `/api/webhooks/whatsapp` (verify token and app secret from the environment). Replies are classified, and `DUR` or `STOP` suppresses the number.

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

See `.env.example`. Secrets live only in the environment: SMTP and IMAP passwords, API keys, the admin password, the session secret and the cron secret. Non secret settings (sender profile, offer text, calendar link, legal details) are edited in the panel.
