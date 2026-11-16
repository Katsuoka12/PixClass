# M3 verification — 2026-11-16

## Scope and environment

M3 assignments, text/file submissions, grading, Gradebook and student todo, building on `7b570e7`. Existing independent Nuxt/Express apps, Anuphan and palette preserved. No schema migration needed. Added backend Multer 2.5.0, file-type 22.3.0 and @types/multer; install audit reported zero advisories for backend.

Used Node 24.22.1 runtime and the isolated XAMPP MariaDB 10.4.32 on 127.0.0.1:3307 / student_tag_m1_test. System node/npm now resolves to an nvm shim with no active Node; checks therefore invoke the installed tsc, vitest and Nuxt CLIs directly with the bundled Node24 executable, equivalent to package scripts. No global nvm configuration changed.

## Automated checks

- HTTP tests were observed RED against missing M3 routes before implementation; repository tests observed RED before implementation.
- New repository cases cover CRUD, owner/member/admin isolation, UTC/due dates, late writes, retained/replaced/removed attachments, grade0/precision/max score, no edits after grading, gradebook/todo, archived/removed users and concurrent submit/grade/removal.
- HTTP tests use real DB and disk: PDF/PNG/DOCX upload, Thai filename, mismatched/fake/oversized rejection, protected download, no static serve, path-free JSON, replacement/removal/deletion cleanup, archived writes and grade0 protection. Fixtures are disposable and cleaned separately from seed records.
- Race test waits for the actual blocking classroom SELECT in PROCESSLIST while a separate transaction owns the class row, then commits archive/removal and asserts the waiting write is rejected. Initial final run exposed unstable INNODB_LOCK_WAITS observations and an unawaited assertion on the failure path; changed the observer and captured promise outcomes before releasing locks. No product logic was changed for this test fix.
- Final checks passed: backend typecheck and production compilation; frontend Nuxt typecheck and production build; all 69 tests across 6 files (42 existing HTTP tests and 27 database/integration tests), with no unhandled errors. `git diff --check` passed.

## Browser flow

1. Teacher created “สำรวจวัฏจักรน้ำ — งานทดลอง M3” with description, due date and max20 in the seed classroom.
2. Student opened it from My Tasks, submitted Thai text and minimal.docx. UI showed late submission; authenticated attachment download succeeded.
3. After resume, teacher extended due date and observed late count change from1 to0 without manual reload.
4. Teacher saved grade0, then regraded to17.5/20 with feedback. Gradebook showed the same value and missing students.
5. Student My Tasks showed graded17.5/20; assignment page showed feedback and disabled answer editing, including after hard reload.
6. Gradebook and student result inspected at1440×1000 and375×812; no page horizontal overflow. Gradebook scroll stays within its accessible table container. Screenshots `.local/m3-gradebook-desktop.jpg` and `.local/m3-student-grade-desktop.jpg` remain local, not committed.

## Review and limits

Independent review found two frontend issues, both fixed: default8-second API timeout unsuitable for10MB multipart uploads (now120seconds), and stale late statuses after inline due date edits (now watches due_at and derives status from returned submission). Review found no additional actionable issue in backend file containment/cleanup, role checks, zero grade or class-first locks.

No external malware scanning, production HTTPS/proxy deployment test, real slow-network upload benchmark or Telegram/Jitsi/cron integration in M3. File signatures identify content type but do not guarantee a file is safe to open. Existing frontend dependency advisories remain as documented in root README. Demo assignment/submission retained only in isolated local test data.
