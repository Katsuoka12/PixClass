# Student Tag REST API — M2

Base path `/api` JSON UTF-8. Success returns `{ "data": ... }` except logout 204. Error always `{ "error": { "code": "CODE", "message": "ข้อความภาษาไทย" } }`. Never returns passwords, hashes, JWT, stack traces or raw database errors.

## Authentication and transport

- JWT session cookie named `session`, HttpOnly, SameSite=Lax, Path=/, 15-minute Max-Age, Secure when WEB_URL is HTTPS. HS256, fixed issuer/audience, subject contains user ID only.
- Every authenticated request checks the current user, active flag and role in MariaDB. Missing/expired/invalid cookie or inactive/deleted account → 401.
- Every mutation must send `Origin: <WEB_URL>` and must not send `Sec-Fetch-Site: cross-site`; otherwise 403 CSRF_REJECTED, including login/register/logout. Origin-less CLI clients must add this header explicitly.
- CORS allows only WEB_URL and credentials. Browser uses same-origin Nuxt `/api` proxy with credentials included; SSR forwards cookies directly to Express.
- JSON maximum 16 KB; no form or multipart endpoints in M1. All documented object inputs are strict (unexpected fields rejected); no query parameters supported.
- Authenticated UI route guards supplement API authorization. They do not authorize access themselves.

## Types

```ts
type Role = 'admin' | 'teacher' | 'student';
interface User { id: number; role: Role; name: string; email: string }
interface AuthData { user: User }
interface OverviewData { user: User; milestone: 'M2' }
```

Email is trimmed, lowercased, validated and at most 254 characters. Name is trimmed, 1–100 characters. Password is not trimmed, must have at least 8 characters and at most **72 UTF-8 bytes** (bcrypt input boundary). Login and register enforce the same password boundary.

## Routes

| Method | Path | Permission | Request | Success |
|---|---|---|---|---|
| POST | `/auth/register` | Public, student registration only | `{name,email,password}` | 201 `{data:{user:User}}`, sets session cookie |
| POST | `/auth/login` | Public, active account | `{email,password}` | 200 `{data:{user:User}}`, sets session cookie |
| POST | `/auth/logout` | Public, idempotent | `{}` or empty body | 204 no body, clears cookie |
| GET | `/auth/me` | Any authenticated active role | None | 200 `{data:{user:User}}` |
| GET | `/admin/overview` | admin only | None | 200 `{data:{user:User,milestone:"M2"}}` |
| GET | `/teacher/overview` | teacher only | None | 200 `{data:{user:User,milestone:"M2"}}` |
| GET | `/student/overview` | student only | None | 200 `{data:{user:User,milestone:"M2"}}` |

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
- Client work/grades tabs are labelled as M3 pending; there are no assignment/grade APIs yet. The grades UI route is teacher-only and also requires classroom access.

## Future milestones

Assignments/submissions/grades (M3), Telegram (M4), live/attendance (M5), admin user management and reminders (M6) are not implemented routes. Schema includes their tables as required by M1. Extend this contract when implementing each milestone, then update independently maintained frontend types.

## References checked for installed major versions

- [Nuxt 4 configuration](https://nuxt.com/docs/4.x/api/nuxt-config), [request context](https://nuxt.com/docs/4.x/api/composables/use-request-fetch), [middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware), [typecheck](https://nuxt.com/docs/4.x/api/commands/typecheck)
- [Express 5 API](https://expressjs.com/en/5x/api/), [MySQL2 prepared statements](https://sidorares.github.io/node-mysql2/docs), [Zod 4](https://zod.dev/api)
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), [express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
