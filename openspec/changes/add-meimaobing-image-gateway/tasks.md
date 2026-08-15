## 1. Isolated Process

- [x] 1.1 Add `tools/meimaobing-image-gateway` as a standalone Node process, not a Vite plugin and not a NewAPI-named path.
- [x] 1.2 Default `MEIMAOBING_IMAGE_GATEWAY_ENABLED` to `false` in env config and Compose.
- [x] 1.3 Reject managed auth and image routes while the gateway is disabled.

## 2. Browser Session And OIDC

- [x] 2.1 Start authorization-code login with PKCE at `/auth/meimaobing/login`.
- [x] 2.2 Keep the callback origin identical to `MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN`.
- [x] 2.3 Store the session in an encrypted HttpOnly cookie. Do not accept a browser API key.
- [x] 2.4 Unwrap Dex protobuf `sub` to the raw UUID and accept bearer `token_type` case-insensitively.

## 3. Product Assertion And Routes

- [x] 3.1 Proxy `/meimaobing/account`, `/meimaobing/v1/models`, `/meimaobing/v1/images/generations`, and `/meimaobing/v1/images/edits` only.
- [x] 3.2 Attach image-only Product Assertion headers to Inference Broker calls.
- [x] 3.3 Keep TokenHub keys and the opaque subject out of browser JSON.
- [x] 3.4 Require same-origin `Origin` for image POST and logout.

## 4. Closed Beta Deploy And CI

- [x] 4.1 Keep Compose on loopback plus `meimaobing-beta-internal`, digest-pinned image, and read-only container.
- [x] 4.2 Keep Nginx same-origin locations for auth, account, and `/meimaobing/v1/`.
- [x] 4.3 Verify Store profile, issuer, principal-secret match, and feature-gate agreement in `deploy/verify-beta.sh`.
- [x] 4.4 Add subject/bearer unit tests and the verifier test; run both in fork CI.

## 5. Spec

- [x] 5.1 Add `openspec/changes/add-meimaobing-image-gateway` with proposal, design, tasks, and capability delta.
- [x] 5.2 Validate the change with OpenSpec `--strict`.
