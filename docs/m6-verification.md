# M6 verification — 2026-11-18

## Scope and environment

Baseba57b6a. M6 only: node-cron due reminders, Admin management, monthly assignment calendar and documentation; existing student todo retained. Independent Nuxt4.6.4/Express5/strict TypeScript, palette/Anuphan preserved. Added node-cron4.6.0, zero transitive dependencies. No database migration.

Checks use existing installed Node26.13.1 directly (`.../nvm/installs/v26.13.1/node.exe`); the earlier bundled Node24 path is no longer present in this session. No global nvm changes. Isolated XAMPP MariaDB10.4.32 on loopback3307/student_tag_m1_test. SQL/flow tests generate and clean only their fixtures; production XAMPP3306 never used. Browser preview explicitly disables Telegram credentials in its process without editing backend/.env, preventing external sends during UI inspection.

## Automated checks

- Backend strict typecheck, production compilation and **148 tests across23 files passed**. Existing118 M1–M5 tests retained,30 M6 cases added. Generic stderr for intentional failed DB/log cases expected; no unhandled errors.
- Frontend **5 Node helper tests passed**, Nuxt typecheck and production build passed. git diff --check passed. Sandboxed output creation initially returned EPERM for a generated Nitro dependency directory; same build with required filesystem permission succeeded without product changes.
- Admin/calendar SQL10 cases cover active current DB role/guard, exact projected user fields, teacher-only creation, duplicates, protected/self admin, pagination, current locked result after concurrent state change, two-admin protection without deadlock, Bangkok month bounds/leap/year, active membership/ownership, own submissions and grade0.
- Reminder SQL7 cases cover exact24h/3h boundaries, missing-only recipients, cross-pool lock contention, durable/concurrent claims, all-status dedup, due edits, stale membership/submission/activity/archive, safe completion identity/error and connection-loss protection. Losing advisory lock prevents further delivery and destroys uncertain connection.
- HTTP3 cases observed RED then GREEN: admin cookie/role/CSRF, strict IDs/page/body/password72byte boundary, real bcrypt hash, normalized email, calendar month bounds/role, private response serializer.
- Worker3 and scheduler lifecycle2 cases: claim before notify, custom reservation completion, no sends for busy/already-claimed work, release on exceptions, disabled credentials never schedule/reserve, immediate startup run, noOverlap and stop waiting on the pending job.
- Full HTTP/SQL/shared-notify5 cases: create teacher→real bcrypt login→suspend→old cookie and new login denied→reactivate; protected admin denial; calendar own score0 with file URL and no disk path/other answer; concurrent+repeated cron yields exactly8 result rows for2 thresholds×4 missing students (sent/unlinked/muted/blocked), submitted student excluded; suspension after queueing skips delivery; successful send with failed result-log update leaves durable reservation and is not sent again.
- SQL and frontend helpers observed RED before implementation. Admin current-read concurrency regression observed RED before correction. Full integration send transport is simulated with fabricated chats, no Telegram network. Cron integration scopes generated assignments to avoid processing unrelated fixtures; production job remains global.

## Browser inspection

Chrome Incognito in a new test window, preserving the user's existing tabs. Seed admin opened the real dashboard and current user list; responsive500px window showed contained horizontal table scrolling, desktop1536px showed columns and controls. A disposable teacher was created through the actual API with a random password never printed; UI confirmation suspended it and then reactivated it, with correct badges/action changes and success messages. Seed admin row remains protected. Local screenshot `.local/m6-admin.png` ignored/not committed. The disposable teacher was removed afterwards by exact generated ID/email in the isolated DB.

Student1 opened /calendar: November2026 showed the20November18:00 task and own graded17.5/20 result. Next month showed an empty December; returning to November restored the task and correct Thai date. Undated tasks remain linked through /todo. Desktop grid and compact agenda were inspected; screenshots stored locally as `.local/m6-calendar-desktop.png` and `.local/m6-calendar-compact.png`.

## Independent review

Read-only review found no actionable issue in current-role authorization, protected admin targets, hash/chat privacy, Bangkok month scopes, own-submission joins, durable claim identity/dedup, advisory lock loss, notification eligibility after wait, startup/shutdown, or frontend paging/confirmation/calendar helpers. Later integration tests exercise queue suspension and log failure explicitly.

## Dependency alert assessment

Install audit reported5 high entries in existing dev-only Vitest4.1.12/Vite8.3.8/tinyglobby0.2.17/fdir6.5.0→picomatch4.0.7 chain. Lockfile marks all five dev=true; node-cron4.6.0 is production and has no subdependencies. Source advisory GHSA-fc5q-39xc-vjpf/CVE-2026-112366 was reviewedNov17 and lists affected<=4.0.7 with no patched version at check time: https://github.com/advisories/GHSA-fc5q-39xc-vjpf . This assessment does not establish exploitability of this app. No force downgrade/override or risk dismissal performed. Track upstream before exposing dev/test tooling to untrusted glob patterns. Existing frontend audit notes from earlier milestones are separate.

Assessment target is working checkout based onba57b6a; backend/package-lock.json modified only for node-cron, SHA2561434C172AAA5AF61918B03FC8512D59DE952AE82AE651F2F126BCAE9FC953229 at assessment. Existing package versions traced from that inventory, no deployment assessed. No security scan or Cloud finding publication performed.

## Remaining checks and intentional limits

At-most-once reminder **attempt** per user/assignment/24h-or3h includes failed/skipped/unlinked/muted outcomes. Claim precedes sending and due edits do not reset. Crash/forced shutdown/log failure can lose a reminder and retain skipped/DUE_RESERVED; no automatic retry. Do not delete relevant due_* rows while relying on their dedup history. Manual teacher reminders are independent. Job runs only while API is alive and Telegram configured; shared in-process delivery throttle limits from M4 remain. Shutdown has the existing10s hard deadline.

No real Telegram credentials/media/device test, production HTTPS deployment or new full security audit. Jitsi media/authentication and existing15-minute JWT behavior remain documented M5 limits. No admin provisioning/role changes/password reset UI; all admin targets protected. Calendar excludes undated tasks, which remain in /todo; 2000–2100 supported. No Docker/CI/export/quiz or other out-of-scope features added.

## Sources checked

- Installed node-cron4.6.0 declarations for schedule/noOverlap/stop/destroy
- https://nodecron.com/scheduling-options.html
- Installed Nuxt4.6.4 existing patterns/types; existing bcrypt12 and grammy1.46.0 adapter
