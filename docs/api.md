# Student Tag REST API — M3

Base path `/api` JSON UTF-8. Success returns `{ "data": ... }` except logout 204. Error always `{ "error": { "code": "CODE", "message": "ข้อความภาษาไทย" } }`. Never returns passwords, hashes, JWT, stack traces or raw database errors.

## Authentication and transport

- JWT session cookie named `session`, HttpOnly, SameSite=Lax, Path=/, 15-minute Max-Age, Secure when WEB_URL is HTTPS. HS256, fixed issuer/audience, subject contains user ID only.
- Every authenticated request checks the current user, active flag and role in MariaDB. Missing/expired/invalid cookie or inactive/deleted account → 401.
- Every mutation must send `Origin: <WEB_URL>` and must not send `Sec-Fetch-Site: cross-site`; otherwise 403 CSRF_REJECTED, including login/register/logout. Origin-less CLI clients must add this header explicitly.
- CORS allows only WEB_URL and credentials. Browser uses same-origin Nuxt `/api` proxy with credentials included; SSR forwards cookies directly to Express.
- JSON maximum 16 KB. M3 submission PUT also accepts multipart as documented below. All documented object inputs are strict (unexpected fields rejected); no query parameters supported.
- Authenticated UI route guards supplement API authorization. They do not authorize access themselves.

## Types

```ts
type Role = 'admin' | 'teacher' | 'student';
interface User { id: number; role: Role; name: string; email: string }
interface AuthData { user: User }
interface OverviewData { user: User; milestone: 'M3' }
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
- Announcement body: trimmed 1–5000 characters, literal plain text, newlines preserved; render with escaped text interpolation, never HTML. Telegram delivery is added in M4, not performed here.
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

Existing auth/role/class/archive/CSRF/rate-limit errors still apply. No Telegram messages or reminders are sent in M3.

## Future milestones

Telegram (M4), live/attendance (M5), admin user management and reminders (M6) are not implemented routes. Schema includes their tables as required by M1. Extend this contract when implementing each milestone, then update independently maintained frontend types.

## References checked for installed major versions

- [Nuxt 4 configuration](https://nuxt.com/docs/4.x/api/nuxt-config), [request context](https://nuxt.com/docs/4.x/api/composables/use-request-fetch), [middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware), [typecheck](https://nuxt.com/docs/4.x/api/commands/typecheck)
- [Express 5 API](https://expressjs.com/en/5x/api/), [MySQL2 prepared statements](https://sidorares.github.io/node-mysql2/docs), [Zod 4](https://zod.dev/api)
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), [express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
