# M2 verification — 2026-11-16

## Scope and environment

M2 classrooms and announcements, following M1 commit `178f3a8`. No dependency additions, schema migrations or cross-project imports. Node 24.22.1, existing Express 5.3.0 / Nuxt 4.6.4 dependencies, isolated XAMPP MariaDB 10.4.32 on 127.0.0.1:3307 (`student_tag_m1_test`). Existing XAMPP production data untouched.

## Automated verification

- New classroom HTTP suite: 20 cases, observed failing against missing endpoints before implementation, then passing.
- Combined M1/M2 HTTP + real MariaDB suite: 50 tests (42 HTTP, 8 DB integration). Default tests skip 8 DB cases unless RUN_DB_TESTS=1.
- Real SQL tests cover persistence/UTF-8, unique generated codes, concurrent duplicate join, ownership/membership read and mutation checks, immediate access revocation, archived SQL write predicates and UTC timestamp values.
- Final required checks passed: backend `npm run typecheck`, `npm test` with DB enabled (50/50), `npm run build`; frontend `npm run typecheck` and `npm run build` (Nuxt production output generated successfully).
- No lint script configured.

## Browser verification

- Teacher logged in, created a new room and saw a 12-character code; edited its name and posted a multiline announcement.
- Student logged in, joined by that code and read the announcement. Hard reload retained access and rendered stream through SSR.
- Student people page showed member names without email/code; direct grades route returned 403.
- Teacher removed the student with confirmation. Student then opening the old room URL received 403.
- Teacher archived the test room with confirmation. Read-only stream retained the announcement and hid editing/posting controls and invitation code.
- Student retrying that code received the archived-room error in the join form.
- Stream inspected at 375×812 and 1440×1000; mobile document width equalled viewport width, no horizontal overflow. Screenshot `.local/m2-stream-desktop.jpg` captures student stream during the successful join flow, before the subsequent removal/archive tests.

## Review and limitations

- Independent read-only code review found no actionable M2 regression after inspecting role/ownership checks, SQL predicates, SSR and Nuxt nested route keys.
- Archive tests simulate an archive occurring before the repository mutation. They verify the final SQL guard but do not run overlapping archive/write transactions. Concurrent duplicate joins are exercised with real parallel requests.
- M3 work/grading tabs are honest placeholders. No Telegram/Jitsi/cron functionality in M2.
- Existing M1 frontend dependency advisories and production HTTPS/reverse-proxy limitations still apply; see root README and M1 verification report.
- Preview data is disposable test data; browser-created demo room was intentionally archived during verification. Seed room remains active and unchanged.
