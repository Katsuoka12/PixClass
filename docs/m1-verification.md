# M1 verification — 2026-11-16

## Environment

Windows / Node 24.22.1 (bundled runtime, system default remains Node 20.20.0), npm 10.8.2, Nuxt 4.6.4 / Vue 3.5.45 / Nitro 2.13.6, Express 5.3.0 / zod 4.6.7 / mysql2 3.24.6 / bcrypt 6.0.0 / jsonwebtoken 9.0.3 / Vitest 4.1.12.

Used existing XAMPP MariaDB 10.4.32 binary from `D:/XamppF/mysql/bin`. Initialized a separate data directory `.local/mariadb`, bound only to 127.0.0.1:3307, imported SQL into `student_tag_m1_test`. Existing XAMPP data files and port 3306 databases were not modified. `.local` is Git ignored.

## Results

- schema.sql + seed.sql imported successfully; 1 admin, 1 teacher, 4 students, 1 class, 4 memberships and 2 assignments.
- Backend HTTP tests plus real MariaDB integration suite: **27 passing tests**. Ordinary `npm test` skips the 5 DB cases unless RUN_DB_TESTS=1 is set.
- Backend strict typecheck and production TypeScript build passed.
- Frontend Nuxt strict typecheck and production build passed.
- The final sandboxed build encountered EPERM while generating `.output/server/node_modules`; repeating the same build with approved filesystem access passed. No product-code workaround was needed.
- No lint script configured in M1.
- Browser: registered a new test student; logged in as seeded admin, teacher and student; confirmed role landing pages; logged out; reloaded authenticated student page successfully (SSR cookie forwarding); student opening `/admin` received the 403 page.
- Browser responsive inspection: 375×812 and 1440×1000, login and student home. No horizontal overflow in inspected pages. Desktop login screenshot saved locally at `.local/m1-login-desktop.jpg` (not committed).

## Review fixes

Independent read-only review found and verified two issues before completion:

1. `useRequestFetch().create` is not supported on Nitro SSR, and internal `/api` fetch bypasses devProxy. Browser reproduced initial HTTP 500 and subsequent recursive request failure. Final implementation uses `$fetch.create`, private server API URL and explicit cookie forwarding. Initial login and authenticated hard reload then passed.
2. Rate limits initially saw all proxied clients as loopback. Added narrowly trusted loopback forwarding, Nuxt proxy xfwd and an independent-client HTTP regression test. The test failed before the fix (second client incorrectly 429), then passed after.

## Remaining limitations

- M2–M6 are deliberately unimplemented; no Telegram/Jitsi tests yet.
- Production reverse proxy and HTTPS deployment have not been tested.
- Frontend dependency audit reports **10 transitive advisory entries (6 low, 4 moderate), 0 high/critical**. Root chains are deepmerge (GHSA-gcqx-w48m-w2h4) and minimatch (GHSA-g3hv-75wg-m249) through Nuxt/Nitro tools. npm's force recommendation downgrades Nuxt to 4.1.3; not applied because the project requires current stable Nuxt. This is a dependency advisory report, not a claim that runtime exposure has been ruled out.
- Backend install audit reported 0 advisories.
- Local preview servers use only the isolated test DB. Standard setup uses `.env` and the normal XAMPP database as documented in README.
