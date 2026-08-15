## Context

Meimaobing splits customer credit into two wallet domains. Chat, Agent, and OpenTu settle the Application Wallet through Inference Broker / Billing Bridge / TokenHub. NewAPI traffic settles a separate API Wallet. Mixing those domains, or putting a TokenHub key in the browser, would charge the wrong ledger and leak credentials.

This change introduces only the browser-facing Image Gateway process. The OpenTu SPA is not switched onto it yet. The process must still encode the production boundary so later wiring cannot invent a second auth or billing path.

## Goals / Non-Goals

- Goals:
  - keep OpenTu image spend on the Application Wallet
  - keep TokenHub credentials off the browser
  - keep the gateway closed until Broker, Billing Bridge, and TokenHub image contracts are verified together
  - keep the public origin identical for login start and OIDC callback
- Non-Goals:
  - no frontend profile, Vite proxy, or Service Worker intercept in this change
  - no NewAPI product surface
  - no shared session with Chat or Agent
  - no public port on the Beta overlay

## Decisions

- Decision: Isolate the gateway as `tools/meimaobing-image-gateway`, not a Vite plugin and not a NewAPI-named directory.

  The process is an OIDC client and Product Assertion mint. Naming it after NewAPI would point later slices at the API Wallet.

- Decision: Browser credential is an encrypted HttpOnly cookie (`mb_image_session`), never `Authorization: Bearer`.

  The gateway has no CORS escape hatch and no route that accepts a browser-held API key. Image POST also requires a same-origin `Origin`.

- Decision: OIDC is authorization-code plus PKCE against a dedicated Image Beta client.

  Redirect URI is always `${MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN}/auth/meimaobing/callback`. The transaction cookie is host-only. Production Meimaobing auth is not a fallback issuer for this Beta surface.

- Decision: Canonicalize Dex protobuf `sub` before wallet ownership.

  Dex emits a base64url protobuf subject. Store and Super App unwrap field 1 to the raw UUID. The gateway MUST do the same so Application Wallet keys match across products. A raw 36-byte UUID passes through. Bearer `token_type` is compared case-insensitively so Dex `bearer` is accepted.

- Decision: Broker calls carry an image-only Product Assertion.

  Headers include subject, surface `image`, derived product request id, timestamp, and HMAC over method/path/subject/surface/id/body digest. The principal HMAC secret MUST match the Broker's `INFERENCE_BROKER_IMAGE_PRINCIPAL_HMAC_SECRET` and MUST differ from the session secret, OIDC client secret, and auth-epoch verifier secret.

- Decision: Feature gate defaults to false.

  Env-based `readGatewayConfig()` sets `enabled=false`. Managed routes then return `503 ACCOUNT_UNAVAILABLE` or redirect login to the account-center failure URL. Enabling requires a coordinated Broker/Bridge/TokenHub rollout; the verifier is not itself wallet-acceptance.

- Decision: Expose a fixed same-origin path set.

  `/healthz`, `/auth/meimaobing/{login,callback,logout}`, `/meimaobing/account`, `/meimaobing/v1/models`, `/meimaobing/v1/images/generations`, `/meimaobing/v1/images/edits`. Account JSON may include display name, email, wallet micro-USD, and `top_up_url`. It MUST NOT include the opaque OIDC subject or any TokenHub key.

- Decision: Closed-beta deploy stays loopback-only on `meimaobing-beta-internal`.

  Compose publishes `127.0.0.1:${MEIMAOBING_IMAGE_GATEWAY_HOST_PORT:-8787}:8787`. Host Nginx on `image.truthtruth.co` includes the gateway locations. The verifier requires digest-pinned images, mode-0600 secrets, the isolated issuer `https://auth.truthtruth.co`, and Store profile `cutover-truthtruth-isolated`.

## Risks / Trade-offs

- Implementation landed in the same PR as this proposal because the isolated process already existed on the Meimaobing Beta tree. The proposal now pins the security contract before any frontend wiring.
- In-memory JWKS cache, unbounded concurrency, and advertised `/v1/image-jobs` Location without a proxy route remain known follow-ups. They do not change the wallet or credential boundary.
- A 128 MiB memory cap with 25 MiB buffered bodies can restart the process under concurrent edits. Size or spooling is a later hardening change, not a reason to put keys in the browser.

## Migration Plan

- Land the process disabled.
- Register the exact OIDC callback on the Image Beta Dex client before enabling.
- Enable only after Broker, Billing Bridge, and TokenHub image reservation/reconciliation are verified together.
- Frontend wiring is a later change that MUST use `/meimaobing/v1` and MUST NOT introduce a `VITE_` TokenHub key.

## Open Questions

- None for this isolated-process slice. Job-status proxy, JWKS refresh-on-unknown-kid, and verifier-outage vs invalid-session status codes are deferred.
