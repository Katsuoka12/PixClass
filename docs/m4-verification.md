# M4 verification — 2026-11-17

## Scope and environment

Base `8569d4f`. M4 only: Telegram account linking, notification hooks, teacher missing-submission reminders, private bot commands, polling/webhook and profile UI. Existing independent apps, palette and Anuphan preserved. No schema migration. Added grammy 1.46.0; backend install audit reported zero vulnerabilities. No global Node/nvm changes.

Node 24.22.1 bundled runtime used directly because system Node/npm still resolves to an nvm shim without active version. XAMPP MariaDB 10.4.32 isolated at loopback3307, database student_tag_m1_test. Fixtures use generated users/classrooms and clean only their own data. Application dev preview uses that same isolated DB; no production database modified.

## Automated checks

- Backend strict typecheck and production compilation passed.
- Frontend Nuxt typecheck and production build passed. A sandboxed Nitro build initially could not create generated `.output` dependency directories (EPERM); repeating the same build with filesystem permission succeeded, without code changes. `git diff --check` passed.
- Full suite: **97 tests passed across 12 files**, including all 69 M1–M3 cases and 28 M4 cases. No failed tests/unhandled errors. Safe stderr messages from intentional failed-log/unavailable-DB tests are expected.
- Telegram SQL tests cover 15-minute token rotation/expiry/single use, active accounts, duplicate chat claims including concurrency, mute, current membership/archived/missing recipients, notification logs. No in-memory store fallback in product.
- HTTP tests cover cookie/CSRF, disabled integration, zod inputs, teacher role/rate limit and separate webhook secret. A valid webhook secret does not bypass CSRF on other APIs.
- Notification tests cover sent/unlinked/muted/failed counts, safe error codes, message limits, log failure tolerance and queued mute changes. Sender tests cover global/per-chat spacing and retry_after cooldown without automatic replay.
- grammy command tests feed actual Updates through handleUpdate using a fake API transformer, checking private-only /start, malformed/used links, tasks, zero grades, classes, mute/unmute and unlinked isolation. No real network or Telegram credentials in tests.
- Full flow test uses Express + actual MariaDB repositories + grammy with fabricated API responses: student obtains token from API, consumes it through secret-authenticated webhook, status becomes connected; teacher creates task/announcement and notifications/logs appear; student submits text-only work, teacher assigns zero and student gets notification; reminder excludes submitted student and counts one sent/unlinked/muted/blocked each. Unrelated teacher is denied.
- Initial notification/bot/HTTP tests were observed failing before implementation. SQL implementer observed missing-module RED before implementation.

## Browser inspection

Login via the Nuxt app as seed student and teacher. /profile shows name/email/role and Telegram disabled guidance, disables connect without bot settings, and refreshes status. Teacher assignment displays missing count and reminder button; clicking with no credentials shows the API's clear setup error and keeps the assignment intact. Tested 1440×1000 and375×812; no page overflow (mobile scrollWidth360 vs viewport375). Temporary viewport reset afterwards.

Local screenshots (ignored): `.local/m4-profile-desktop.jpg`, `.local/m4-reminder-desktop.jpg`. Browser connected/linked/live-delivery states were not tested against real Telegram. The API flow simulation covers corresponding backend states.

## Independent review

Reviewer found that looking up grade context via the protected-file accessor prevented text-only grade notifications. Fixed by passing the successfully graded Submission into the notification hook; real SQL/HTTP/grammy flow now covers text-only grade0. Send guard also rechecks active/chat/mute/member/missing state after rate-limit waiting, with a regression test for a queued mute change. Second review of these changes and runtime/config found no further actionable findings.

## Practical limits and remaining live check

backend/.env has no TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_USERNAME. Therefore **real Telegram account linking/delivery and public HTTPS webhook registration remain unverified**; no claim of live Bot API success is made. Configure credentials privately in that file, provide public HTTPS WEB_URL for message buttons, restart API, then repeat README M4 flow with a real student chat. Secrets were never printed or committed.

M4 queue is in-process only: restart can lose queued notifications, a failed DB log can leave a successful send unrecorded, no persistent retry/outbox exists. Telegram429 fails/logs the current send and delays subsequent sends. Manual reminders are limited to once/minute per teacher; a long cooldown/large class can exceed the120s browser timeout while server work continues, so check notification_log before retrying. Multiple API processes need shared throttling. No chat transfer/unlink UI, cron or Jitsi in this milestone. Existing frontend dependency audit limits from M1 remain documented.

## References checked

- Installed grammy1.46.0 types: Bot/init/start/handleUpdate, API transformers, client timeout and Bot API methods.
- https://grammy.dev/guide/deployment-types
- https://grammy.dev/guide/commands
- https://core.telegram.org/bots/features#deep-linking
- https://core.telegram.org/bots/api#setwebhook
- https://core.telegram.org/bots/api#sendmessage
