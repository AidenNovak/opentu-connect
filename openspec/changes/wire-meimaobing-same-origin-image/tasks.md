## 1. Transport

- [x] 1.1 Send `meimaobing-account` requests with cookie credentials.
- [x] 1.2 Attach `Idempotency-Key` on paid image POSTs when the caller did not supply one.
- [x] 1.3 Map non-abort network failures on that profile to `ACCOUNT_UNAVAILABLE`.

## 2. Credentials And Auth

- [x] 2.1 Treat the account profile as credentialed without an API key.
- [x] 2.2 Do not copy the legacy Tuzi API key onto the account route.
- [x] 2.3 Skip the API-key prompt and require the Meimaobing session instead.
- [x] 2.4 Discover models with cookies and no Bearer header.
- [x] 2.5 Confirm the session before `generateImage` creates a task.

## 3. Local And Worker Routing

- [x] 3.1 Proxy `/meimaobing` and `/auth/meimaobing` in the Vite dev server.
- [x] 3.2 Passthrough those paths in the Service Worker.

## 4. Spec And Tests

- [x] 4.1 Add `openspec/changes/wire-meimaobing-same-origin-image`.
- [x] 4.2 Cover transport, credentials, auth, discovery, adapter errors, and pre-submit account checks.
- [x] 4.3 Run the new tests in fork CI.
