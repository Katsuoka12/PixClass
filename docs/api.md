# Student Tag REST API — M5

Base path `/api` JSON UTF-8. Success returns `{ "data": ... }` except logout 204. Error always `{ "error": { "code": "CODE", "message": "ข้อความภาษาไทย" } }`. Never returns passwords, hashes, JWT, stack traces or raw database errors.

## Authentication and transport

- JWT session cookie named `session`, HttpOnly, SameSite=Lax, Path=/, 15-minute Max-Age, Secure when WEB_URL is HTTPS. HS256, fixed issuer/audience, subject contains user ID only.
- Every authenticated request checks the current user, active flag and role in MariaDB. Missing/expired/invalid cookie or inactive/deleted account → 401.
- Every browser mutation must send `Origin: <WEB_URL>` and must not send `Sec-Fetch-Site: cross-site`; otherwise 403 CSRF_REJECTED, including login/register/logout. Origin-less CLI clients must add this header explicitly. Telegram webhook is the sole exception: it authenticates its own secret header, as documented below.
- CORS allows only WEB_URL and credentials. Browser uses same-origin Nuxt `/api` proxy with credentials included; SSR forwards cookies directly to Express.
- JSON maximum 16 KB. M3 submission PUT also accepts multipart as documented below. All documented object inputs are strict (unexpected fields rejected); no query parameters supported.
- Authenticated UI route guards supplement API authorization. They do not authorize access themselves.

## Types

```ts
type Role = 'admin' | 'teacher' | 'student';
interface User { id: number; role: Role; name: string; email: string }
interface AuthData { user: User }
interface OverviewData { user: User; milestone: 'M5' }
```

Email is trimmed, lowercased, validated and at most 254 characters. Name is trimmed, 1–100 characters. Password is not trimmed, must have at least 8 characters and at most **72 UTF-8 bytes** (bcrypt input boundary). Login and register enforce the same password boundary.

## Routes

| Method | Path | Permission | Request | Success |
|---|---|---|---|---|
| POST | `/auth/register` | Public, student registration only | `{name,email,password}` | 201 `{data:{user:User}}`, sets session cookie |
| POST | `/auth/login` | Public, active account | `{email,password}` | 200 `{data:{user:User}}`, sets session cookie |
| POST | `/auth/logout` | Public, idempotent | `{}` or empty body | 204 no body, clears cookie |
| GET | `/auth/me` | Any authenticated active role | None | 200 `{data:{user:User}}` |
| GET | `/admin/overview` | admin only | None | 200 `{data:{user:User,milestone:"M3"}}` |
| GET | `/teacher/overview` | teacher only | None | 200 `{data:{user:User,milestone:"M3"}}` |
| GET | `/student/overview` | student only | None | 200 `{data:{user:User,milestone:"M3"}}` |

Passing `role` or any other field to register is 400, never creates a teacher/admin. Teacher/admin accounts come from seed; admin creation UI/API comes in M6. The role overviews supply role landing data; classrooms use the routes below.

## Errors

| HTTP | code | Condition |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid input, unsupported fields/query or password byte length |
| 400 | INVALID_JSON | Malformed JSON |
| 401 | INVALID_CREDENTIALS | Login email/password wrong or account inactive; same message for missing account |
| 401 | UNAUTHENTICATED | Session missing/invalid/expired or account disabled/deleted |
| 403 | FORBIDDEN | Authenticated user has a different role |
| 403 | CSRF_REJECTED | Origin missing/mismatched or Fetch Metadata says cross-site |
| 404 | NOT_FOUND | Unknown route |
| 409 | EMAIL_EXISTS | Email already registered, including concurrent insert duplicate |
| 413 | PAYLOAD_TOO_LARGE | JSON body exceeds 16 KB |
| 429 | RATE_LIMITED | More than 10 requests to login OR register per 15 minutes per client IP (separate counters), Retry-After header provided |
| 500 | INTERNAL_ERROR | Unexpected failure; generic message only |

Error precedence depends on middleware: CSRF before JSON parsing; auth before query validation on protected routes. Login/register rate limiting counts successful and failed attempts. Loopback reverse proxy forwarding is trusted; a production proxy must replace incoming forwarding headers and preserve the actual client IP. Limits are process-local.

## Example

```http
POST /api/auth/login
Content-Type: application/json
Origin: http://localhost:3000

{"email":"teacher@student-tag.test","password":"StudyTag!2026"}
```

```json
{"data":{"user":{"id":2,"role":"teacher","name":"ครูอรทัย","email":"teacher@student-tag.test"}}}
```

## Classrooms and announcements — M2

```ts
interface Classroom {
  id: number; teacher_id: number; teacher_name: string; name: string; section: string;
  join_code?: string; archived: boolean; member_count: number; created_at: string;
}
interface ClassMember { id: number; name: string; joined_at: string }
interface Announcement {
  id: number; class_id: number; author_id: number; author_name: string;
  body: string; created_at: string;
}
```

Dates are ISO 8601 UTC strings. `join_code` is included only for the owning teacher, omitted for students. Member rows contain no emails. All routes require active authentication; admin has no classroom access override. No query parameters supported. IDs are positive unsigned 32-bit integers; malformed IDs return 400. Unknown fields rejected. All mutations share existing CSRF checks.

| Method | Path | Permission | Request | Success |
|---|---|---|---|---|
| GET | `/classes` | teacher/student | None | 200 `{data:{classes:Classroom[]}}`, only owned/enrolled, active before archived, newest first |
| POST | `/classes` | teacher | `{name,section?}` | 201 `{data:{class:Classroom}}` |
| POST | `/classes/join` | student | `{code}` | 200 `{data:{class:Classroom}}`, idempotent membership |
| GET | `/classes/:id` | owning teacher/enrolled student | None | 200 `{data:{class:Classroom}}` |
| PATCH | `/classes/:id` | owning teacher, active classroom | `{name?,section?,archived?:true}` | 200 `{data:{class:Classroom}}` |
| GET | `/classes/:id/members` | owning teacher/enrolled student | None | 200 `{data:{teacher:{id,name},members:ClassMember[]}}` |
| DELETE | `/classes/:id/members/:userId` | owning teacher, active classroom | Empty or `{}` | 204, no body |
| GET | `/classes/:id/announcements` | owning teacher/enrolled student | None | 200 `{data:{announcements:Announcement[]}}`, newest first |
| POST | `/classes/:id/announcements` | owning teacher, active classroom | `{body}` | 201 `{data:{announcement:Announcement}}` |

- Name: trimmed 1–200 characters. Section: trimmed 0–100, default empty string. PATCH must contain at least one supported field. It does not allow changing teacher, code, or restoring an archived room.
- Join: code trimmed/uppercased, 6–20 ASCII alphanumeric characters to support seed SCI2026. New codes use crypto randomBytes(6), 12 uppercase hex characters with a UNIQUE DB constraint; retry collisions at most 5 times. Rate limit: 20 join attempts/minute/IP (counts valid and invalid attempts).
- Existing members joining again receive 200 without duplicate membership rows. Archived rooms reject joins even for existing members. Students removed by the teacher lose all room/stream/people access and no longer see that room in their list; they can rejoin an active room using its code.
- Archive is read-only. Existing participants retain room/stream/people reads. Edit/join/post/remove return 409 CLASS_ARCHIVED. Mutation SQL also predicates on active classroom status. No delete/unarchive endpoint in M2.
- Announcement body: trimmed 1–5000 characters, literal plain text, newlines preserved; render with escaped text interpolation, never HTML. M4 dispatches Telegram notifications after this write commits.
- M2 errors add 404 CLASS_NOT_FOUND (missing room or join code), 404 MEMBER_NOT_FOUND (removal target absent), 409 CLASS_ARCHIVED; 403 FORBIDDEN for wrong role or nonparticipants. Authentication precedes validation; teacher-only mutations reject nonteachers before parsing body.
- The grades UI route is teacher-only and also requires classroom access.

## Assignments, submissions and grading — M3

```ts
interface Assignment {
  id: number; class_id: number; class_name: string; class_archived: boolean;
  title: string; description: string; due_at: string | null; max_points: number;
  allow_late: boolean; created_at: string;
}
interface AssignmentInput {
  title: string; description?: string; due_at?: string | null;
  max_points?: number; allow_late?: boolean;
}
interface PublicSubmission {
  id: number; assignment_id: number; student_id: number; answer_text: string;
  file_url: string | null; original_name: string | null; submitted_at: string;
  grade: number | null; feedback: string | null; graded_at: string | null; is_late: boolean;
}
interface SubmissionRow {
  student_id: number; student_name: string; status: 'missing' | 'submitted' | 'late';
  submission: PublicSubmission | null;
}
interface Gradebook {
  assignments: Assignment[];
  students: { id: number; name: string; submissions: PublicSubmission[] }[];
}
interface TodoRow {
  assignment: Assignment; submission: PublicSubmission | null;
  status: 'missing' | 'submitted' | 'late' | 'graded';
}
```

File paths/storage names never appear in JSON; `file_url` points to the protected `/api/submissions/:id/file` route. Dates are ISO UTC. Access requires owning teacher or current student membership; admin has no bypass. Archived classrooms preserve reads and downloads but reject mutations with 409 CLASS_ARCHIVED.

| Method | Path | Permission | Request | Success |
|---|---|---|---|---|
| GET | `/classes/:id/assignments` | owner/enrolled student | None | 200 `{data:{assignments:Assignment[]}}` |
| POST | `/classes/:id/assignments` | owning teacher | AssignmentInput | 201 `{data:{assignment:Assignment}}` |
| GET | `/assignments/:id` | owner/enrolled student | None | 200 `{data:{assignment:Assignment}}` |
| PATCH | `/assignments/:id` | owning teacher | Nonempty partial AssignmentInput | 200 `{data:{assignment:Assignment}}` |
| DELETE | `/assignments/:id` | owning teacher | Empty or `{}` | 204; deletes submissions and attachment files too |
| GET | `/assignments/:id/submission` | enrolled student, own only | None | 200 `{data:{submission:PublicSubmission|null}}` |
| PUT | `/assignments/:id/submission` | enrolled student, own only | Submission input below | 200 `{data:{submission:PublicSubmission}}` |
| GET | `/assignments/:id/submissions` | owning teacher | None | 200 `{data:{submissions:SubmissionRow[]}}`, every current student including missing |
| PATCH | `/submissions/:id/grade` | owning teacher | `{grade:number,feedback?:string}` | 200 `{data:{submission:PublicSubmission}}` |
| GET | `/submissions/:id/file` | submission owner with current membership, or owning teacher | None | 200 binary attachment, original filename, nosniff/no-store |
| GET | `/classes/:id/gradebook` | owning teacher | None | 200 `{data:Gradebook}` |
| GET | `/me/todo` | student | None | 200 `{data:{items:TodoRow[]}}`, enrolled active classes only |

### Assignment and grade validation

- Title trimmed 1–200 characters; description trimmed 0–5000 (default empty). due_at defaults null; otherwise valid ISO date-time with explicit timezone, normalized to UTC. max_points integer 1–9999 (default 100); allow_late boolean (default true).
- PATCH rejects unknown fields and empty objects; class/teacher cannot change. Reducing max_points below an existing grade returns 409 MAX_POINTS_BELOW_GRADE.
- Grade is finite 0..max_points, at most two decimal places. Feedback trimmed 0–5000, defaults empty. Zero is a graded result. Regrading is allowed; no ungrade endpoint.
- Submit/edit and grade transactions acquire classroom, assignment and submission locks in consistent order. If grading wins, student edit fails; if edit wins, teacher grades the updated submission. Class archive/removal is rechecked after locking. All SQL uses prepared statements.
- `is_late` means submitted_at > current due_at. Editing due_at recalculates display status. Student writes after the deadline fail when allow_late=false, even if a previous submission exists. Already graded submissions cannot be edited, including grade 0.
- Gradebook/teacher roster contain current members only. Owning teachers can still download historical submissions from removed members; removed students lose access to the classroom and attachments.

### Submission and file transport

PUT accepts JSON `{answer_text?:string,remove_file?:boolean}` for text/removal or multipart with `answer_text`, optional `file`, optional `remove_file` (`"true"`/`"false"`). Answer text trimmed 0–5000, default empty. At least nonempty text or an attachment must remain after the update.

- Omitting a file preserves the existing attachment; a new file replaces it; remove_file=true explicitly removes it. A new file combined with remove_file=true is 400. Student/assignment IDs cannot be supplied in the body.
- Exactly one attachment, at most **10 × 1024 × 1024 bytes**, extensions PDF/JPG/JPEG/PNG/DOCX. Actual detected MIME must match an allowed extension; browser Content-Type is not trusted. Original names are sanitized and UTF-8 names supported.
- Multer writes to private disk storage with crypto.randomBytes(32) names. Authentication, role, classroom access and CSRF run before parsing uploads. Failed updates remove new files; replacement/deletion removes old files after DB commit. No static `/uploads` route.
- Multipart field count limited to 2, part count 3, text field size 20 KB. Submission PUT limited to 30 attempts per 5 minutes per IP; multipart browser timeout 120 seconds. Large production uploads also need suitable reverse proxy request/body timeouts and limits.
- Download requires authentication each time and responds as an attachment, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`. A known file URL alone grants no access. Storage filename whitelist prevents path traversal. Missing disk files return safe 404.
- MIME signature detection is not malware scanning or a guarantee that a document is safe to open. No external scanning service receives student files.

### Additional M3 errors

| HTTP | code | Condition |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid fields/IDs, date, grade precision/range shape, conflicting file actions |
| 400 | EMPTY_SUBMISSION | No text or attachment remains |
| 400 | INVALID_FILE | Disallowed/mismatched content, malformed multipart or too many parts/files |
| 400 | GRADE_EXCEEDS_MAX | Grade exceeds current assignment maximum |
| 404 | ASSIGNMENT_NOT_FOUND | Unknown/deleted assignment |
| 404 | SUBMISSION_NOT_FOUND | Unknown/deleted submission |
| 404 | FILE_NOT_FOUND | No attachment or file missing from disk |
| 409 | ALREADY_GRADED | Student tries to edit graded work |
| 409 | DEADLINE_PASSED | Late submission/edit disallowed |
| 409 | MAX_POINTS_BELOW_GRADE | New max would invalidate existing grades |
| 413 | FILE_TOO_LARGE | Attachment exceeds 10 MB |

Existing auth/role/class/archive/CSRF/rate-limit errors still apply.

## M4 Telegram

```ts
interface TelegramStatus { configured: boolean; connected: boolean; muted: boolean }
interface TelegramLink { url: string; expires_at: string }
interface ReminderResult { total: number; sent: number; unlinked: number; muted: number; failed: number; skipped: number }
```

| Method | Path | Permission | Request | Success |
|---|---|---|---|---|
| GET | `/telegram/status` | Any active authenticated role | None | 200 `{data:TelegramStatus}` |
| POST | `/telegram/link-token` | Any active authenticated role + CSRF | `{}` | 201 `{data:TelegramLink}` |
| POST | `/assignments/:id/remind` | Owning teacher, active classroom + CSRF | `{}` | 200 `{data:ReminderResult}` |
| POST | `/telegram/webhook` | Telegram secret header, webhook mode only; no cookie/Origin | Telegram Update JSON | 200 `{ok:true}` |

- Status never exposes chat ID or link token. `configured` requires both bot token and username. Disabled integrations return 503 TELEGRAM_NOT_CONFIGURED from link/remind; status still works.
- Link URL is `https://t.me/<username>?start=<32-hex-token>`. Token uses crypto.randomBytes(16), expires in 15 minutes, is consumed atomically once, and is never logged. Issuing a new token invalidates earlier unused tokens. Only private user chats can link. One chat per account and one account per chat; MVP does not transfer an already-linked account to a different chat. Invalid/expired/used links produce a safe bot reply; duplicate chat/account links request administrator assistance.
- Link attempts limited to 5 per 15 minutes per authenticated user. Reminders limited to 1 per minute per teacher across assignments (including rejected attempts). Inputs are strict empty JSON objects, no query fields. Assignment IDs are positive uint32 integers. Existing 401/403/404/409 CLASS_ARCHIVED errors apply.
- Reminder counts start with current active enrolled students with **no submission**, including exclusion of late/ungraded submissions. Each recipient is rechecked after waiting in the send queue. `unlinked` means no chat ID; `muted` means notifications disabled; `failed` includes Telegram send/network failure; `skipped` includes membership/archive/activity changes or disabled transport. All six counts are nonnegative integers; outcome counts sum to total. An empty audience returns zero counts. No recipient names/chat IDs returned.
- Creating an assignment or announcement and grading/regrading a submission dispatches notifications **after DB commit**, without delaying or undoing the successful classroom response. Text-only submissions and zero grades are supported. New task/announcement audiences are active enrolled students; grades go only to the submission owner if still enrolled. No notifications on task edits/deletion or student submission edits.
- Shared notify service checks active account, linkage, mute and class access; records `sent/failed/skipped` in notification_log with kind `assignment/announcement/grade/reminder`, event ref_id and bounded plain text payload. Errors contain safe fixed codes only. Delivery failures continue to the next user. Text is bounded below 4096 characters, user content is sent without parse_mode; no attachments/student answer files sent to Telegram.
- One process-wide sequential send queue, minimum 50ms between sends and 1s per chat. A 429 response applies its retry_after cooldown to subsequent sends; the failed message is logged, not replayed. No persistent outbox/retry in M4; process restart or an unavailable DB can lose an in-flight notification/log. Manual reminder retry remains available. Multiple API instances require shared throttling before scaling.
- Commands `/tasks`, `/grades`, `/classes`, `/mute`, `/unmute` operate on the current linked active account and current membership/ownership, only in private chats. Tasks/grades are student views; other roles get an empty list and web link. Commands reply even while muted. Lists show at most 15 items within the message limit with a link to the web for full data. `/start` alone gives linking instructions.

### Webhook boundary

Registered only when TELEGRAM_MODE=webhook and bot credentials are set. Requests must have `X-Telegram-Bot-Api-Secret-Token` equal to TELEGRAM_WEBHOOK_SECRET (32–256 allowed ASCII characters); constant-time comparison is used for equal-length secrets before parsing. Missing/wrong secret → 403 WEBHOOK_REJECTED. JSON limit 256 KB; zod validates update_id and relevant message/chat/from/entities shapes, allowing Telegram extension fields. Invalid payload → 400 VALIDATION_ERROR/INVALID_JSON; oversized → 413 PAYLOAD_TOO_LARGE. No query fields supported. Non-message updates are ignored successfully.

Only this exact POST bypasses browser CSRF; the secret does not authorize any cookie-authenticated API. Runtime verifies bot username using getMe, registers commands and a public HTTPS WEB_URL `/api/telegram/webhook` with allowed_updates=[message], max_connections=1. Polling removes existing webhook without dropping pending updates. Do not run two polling processes with the same token. No bot/Telegram token appears in request paths or application logs. Reverse proxy must preserve the webhook secret header and avoid logging request bodies.

Additional HTTP error: 503 TELEGRAM_NOT_CONFIGURED. Link consumption errors INVALID_LINK (400) and TELEGRAM_ALREADY_LINKED (409) are internal domain errors translated into safe Thai bot replies; there is no public link-consume HTTP endpoint.

## M5 Live Class and attendance

```ts
interface LiveSession {
  id:number; class_id:number; class_name:string; class_archived:boolean; title:string;
  scheduled_at:string|null; started_at:string|null; ended_at:string|null; created_by:number;
}
interface AttendanceRow { user_id:number; name:string; joined_at:string|null; left_at:string|null }
interface LiveAttendance { session:LiveSession; students:AttendanceRow[] }
interface LiveEntry { session:LiveSession; room_name:string; display_name:string; domain:string }
```

| Method | Path | Permission | Request | Success |
|---|---|---|---|---|
| GET | `/classes/:id/live` | Owner/current student member | None | 200 `{data:{sessions:LiveSession[]}}` newest first |
| POST | `/classes/:id/live/start` | Owning teacher, active class | `{title:string}` | 201 `{data:{session:LiveSession}}` |
| POST | `/live/:id/link` | Owner/current member, active class/session | `{}` | 201 `{data:{url:string,expires_at:string}}` |
| GET | `/live/join?t=<token>` | Current active account matching token, class access + explicit header | Only query `t` (64 lowercase hex) and `X-Live-Join: 1` | 200 `{data:LiveEntry}`; records check-in |
| POST | `/live/:id/leave` | Current owner/member | `{}` | 204; idempotent |
| POST | `/live/:id/end` | Owning teacher | `{}` | 200 `{data:{session:LiveSession}}`; idempotent |
| GET | `/live/:id/attendance` | Owning teacher | None | 200 `{data:LiveAttendance}` |
| POST | `/live/:id/remind-absent` | Owning teacher; ended session | `{}` | 200 `{data:ReminderResult}` as M4 |

IDs positive uint32. Title trimmed1–200. No unknown input fields/query parameters except join.t. All POST routes retain cookie CSRF Origin checks, including best-effort beacon leave. GET join additionally requires X-Live-Join:1 and rejects Sec-Fetch-Site:cross-site so normal navigation/prefetch/images cannot record attendance. Frontend fetches only on an explicit entry action, never SSR. Cache-Control:no-store; join response Referrer-Policy:no-referrer. Browser login return accepts only `/live/join?t=<64hex>`; external/extra-query redirects rejected.

Class-first READ COMMITTED transactions serialize start, join, end, archive and member removal. Only one open session/class. Room names `st-<48 random hex>` from crypto.randomBytes(24). List/start/end/attendance never include room_name; only successful scoped token entry exposes it and the configured JITSI_DOMAIN. get/token/join recheck current user active role and owner/membership; admin has no classroom override. Archived lists/attendance are readable; start/token/join blocked. End and leave allow archive cleanup.

Live tokens crypto.randomBytes(32), stored in existing live_tokens, bound to current user/session, expire in2h. They are reusable until expiry to allow reload/re-entry; used_at records first successful use. Token expiry is checked after acquiring locks. Sharing a token with another account does not grant entry. End blocks every token for that session. A new token is obtainable through the classroom without Telegram. Invite URLs point to WEB_URL/live/join?t=token, never directly to Jitsi; API cookie authentication remains required. App/proxy logs must redact join query strings and login redirect queries; never log token/link URL bodies.

Check-in records opening the authenticated Student Tag live page, before establishing Jitsi media. One attendance row peruser/session, earliest joined_at retained and left_at cleared on re-entry. videoConferenceLeft/readyToClose, explicit exit and pagehide beacon update left_at best effort; duplicate exits do not move it. End stamps all still-open rows with ended_at. A beacon from an old tab can mark the user's shared attendance row as left even if another tab remains open; no per-tab duration/proctoring guarantees. Attendance shows current active enrolled students only (teacher excluded), null joined_at means absent. Membership changes after a class alter the current roster; historical immutable rosters are outside MVP.

Start dispatches per-student live_invite messages after commit via shared M4 notify. Message text/log payload contains no bearer token; button contains individual URL. Queued sends recheck account/mute/member and live status. Ended-only absent reminders use live_absent kind and recheck absence before sending. M4 delivery counters/throttling/failure behavior apply. Disabled/unlinked Telegram never blocks classroom entry. Archived-class reminder requests reject409 CLASS_ARCHIVED; if archived after dispatch begins, queued recipients are skipped. Start limited10/5min/user; link30/min/user; join60/min/user; absent reminder1/min/teacher. Long batches may exceed120s UI timeout; inspect log before retrying.

Jitsi external_api.js is loaded client-side only after user entry, from HTTPS configured domain, using userInfo.displayName, startWithAudioMuted/startWithVideoMuted=true, addListener and dispose. No student email/answer/grade is sent to Jitsi. Token query is removed before third-party loading, with no-referrer metadata/links. A10s script timeout exposes fallback. Public meet.jit.si may require creator login; fallback opens the random room URL in a separate tab. App tokens do not secure public Jitsi URLs or grant Jitsi moderator rights; closing a Student Tag session does not forcibly destroy the external conference. Separate tabs cannot report actual Jitsi hangup. Existing15-minute JWT expiry still applies; on expiry the page closes the embed and asks the user to log in/re-enter. Use a controlled Jitsi deployment and HTTPS for production; do not treat attendance as identity or call-duration proof.

Additional domain errors: LIVE_NOT_FOUND404, INVALID_LIVE_TOKEN400 (missing/expired/other-account token), LIVE_ALREADY_ACTIVE409, LIVE_ENDED409, LIVE_NOT_ENDED409. Existing CLASS_NOT_FOUND404, CLASS_ARCHIVED409, FORBIDDEN403, UNAUTHENTICATED401, VALIDATION_ERROR400, CSRF_REJECTED403, RATE_LIMITED429 apply.

## Future milestones

Admin user management and scheduled reminders (M6) are not implemented routes. Schema includes their tables as required by M1. Extend this contract when implementing each milestone, then update independently maintained frontend types.

## References checked for installed major versions

- [Nuxt 4 configuration](https://nuxt.com/docs/4.x/api/nuxt-config), [request context](https://nuxt.com/docs/4.x/api/composables/use-request-fetch), [middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware), [typecheck](https://nuxt.com/docs/4.x/api/commands/typecheck)
- [Express 5 API](https://expressjs.com/en/5x/api/), [MySQL2 prepared statements](https://sidorares.github.io/node-mysql2/docs), [Zod 4](https://zod.dev/api)
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), [express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
