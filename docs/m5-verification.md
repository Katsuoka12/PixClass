# M5 verification — 2026-11-17

## Scope and environment

Base929ace9. M5 only: live sessions, per-account entry tokens, Jitsi embed/fallback, attendance, teacher end/absence reminders, classroom entry without Telegram. Independent Nuxt4.6.4 and Express5 apps, TypeScript strict, existing palette/Anuphan preserved. No schema/dependency migration. Node24.22.1 direct CLIs used because global nvm shim still has no active version. Isolated XAMPP MariaDB10.4.32 loopback3307/student_tag_m1_test, generated fixtures only. No production DB touched.

## Automated verification

- Backend strict typecheck and production compilation passed.
- **118 backend tests passed across16 files**, including all97 previous cases and21 M5 cases. Expected generic stderr from intentional unavailable-DB/log tests, no unhandled failures.
- **2 frontend Node tests passed**, observed RED before helper implementation: strict local live-only login return, Jitsi fallback host/room injection rejection and display-name encoding.
- Nuxt typecheck and production build passed. git diff --check passed.
- Repository9 real SQL cases cover active-session start concurrency, scoped2h tokens, other-account/expiry/removed/inactive/archive cases, stable earliest join/re-entry/leave, teacher-only attendance, end closure/idempotence, absent eligibility. Tests observe a classroom lock wait then expire token/remove membership; waiting join must recheck current state. Concurrent join/end never leaves an open attendance after end.
- HTTP4 cases observed RED against missing routes, then passed: auth/roles/CSRF/strict zod, public lists without room, current-user link, explicit GET join header and cross-site rejection, teacher-only end/attendance/reminders/rate limit and authenticated beacon-style JSON leave.
- Live notification4 cases observed RED then passed: distinct individual invitation URLs with no token in logged text, ended-only absent audience/counters, stale invitation guard and rejection of archived classroom reminders before dispatch/log. Existing notify gained one test observed RED→GREEN for live eligibility callbacks; eligibility is rechecked after queued wait.
- Full HTTP→SQL→simulated-send flow3 cases: teacher starts, individual invitation URLs generated; correct student enters via invite, wrong-account token rejected; unlinked student enters from classroom link; first join timestamp survives re-entry; teacher sees2 present/1 absent, end closes open rows and blocks joins, only absent student receives reminder. Send simulation uses fabricated test IDs/chats and no Telegram network.

## Browser inspection

Native Chrome Guest session: logged in as seed teacher, created “ทดลองห้องเรียนสด M5” in classroom1 via the stream, opened attendance roster (4 current students), then switched to student1 and requested entry without Telegram. Live page removed token query before presenting explicit entry/privacy message. Student explicitly entered; actual meet.jit.si external_api.js/iframe loaded its pre-meeting screen with the correct display name and muted audio/video controls. Browser microphone prompt was dismissed; no media permission granted or Jitsi Join/authentication completed. Student used the app exit button; UI returned to entry screen and disposed iframe. Read-only SQL confirmed user3 first joined_at09:04:59UTC and left_at09:06:36UTC (16:04/16:06 Bangkok). Screenshot `.local/m5-entry.png` retained locally/ignored.

Browser UI inspection uses native Computer Use because the previous CUA browser tool is no longer available in this turn. No production account, camera/microphone grant or external Jitsi login is automated. The isolated local demo session is retained, not committed.

Teacher then reopened attendance and observed1 present/3 absent, student1 entry16:04/exit16:06 Bangkok. Ended the demo class through confirmation at16:09; UI showed ended and the absent reminder button. Local screenshot `.local/m5-attendance.png` retained/ignored. No actual conference media or moderator login was completed; the pre-meeting embed itself loaded successfully.

Teacher clicked the absent reminder after end: UI reported3 absent,0 sent,3 unlinked and0 muted/failed/skipped, matching the seed students' unlinked state. No external messages sent. Backend preview restarted on final compiled code after verification.

## Independent review

Read-only review found no actionable issue in ownership/current membership, class-first token/end locking, expiry checks, room disclosure, custom-header GET boundary, queued live eligibility, safe auth redirect, Jitsi opt-in/token removal, fallback/events/dispose/polling/beacon. A late external script load after timeout cannot be guaranteed cancelled, but handlers/instance creation are disabled after failure/dispose and no live token is present in its referrer.

## Remaining production checks and limits

Real Telegram credentials remain absent; no real Bot API delivery claim. Actual two-device Jitsi audio/video/moderator login still needs user hardware/account validation. Public meet.jit.si requires creator authentication; fallback exists, not a bypass. App tokens scope Student Tag access/attendance, not external Jitsi moderator rights. Ending app session cannot forcibly destroy public conference.

Attendance is a page check-in, not identity/call duration proof. First join/latest leave only; old tabs can report an exit while another tab remains open, separate Jitsi tabs cannot report hangup, pagehide is best effort, current membership changes the roster. Existing15-minute JWT expiry may require login/re-entry; no auth-refresh/outbox/per-tab heartbeat subsystem added. Token lifetime2h, attendance stable across re-entry. In-process M4 delivery/retry/long-batch limits remain. Jitsi gets only display name and user-selected media after explicit entry; production should use an approved controlled deployment and HTTPS.

## Official sources checked

- https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/ — external_api.js constructor/options
- https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-events/ — videoConferenceJoined/videoConferenceLeft/readyToClose and listeners
- https://jitsi.org/blog/authentication-on-meet-jit-si/ — public creator authentication requirement
- Installed Nuxt4.6.4 runtime/types and existing grammy1.46.0 adapter retained
