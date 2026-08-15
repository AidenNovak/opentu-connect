# Change: Wire Meimaobing same-origin image requests

## Why

The account profile is now listed in settings, but image generation still treats it as a browser API-key route. Selecting it would prompt for a Tuzi key, drop the HttpOnly cookie, and miss local `/meimaobing` traffic. This change sends paid image requests through same-origin `/meimaobing/v1` when that profile is chosen. It does not make Meimaobing the default image route.

## What Changes

- Send `meimaobing-account` transport requests with `credentials: 'include'` and an `Idempotency-Key` on generate/edit POSTs.
- Treat an enabled account profile as credentialed without an API key, and do not copy the legacy Tuzi key onto that route.
- Skip the API-key prompt for the reserved same-origin account route and require the Meimaobing session instead.
- Discover models for that profile with cookies and no `Authorization` header.
- Proxy `/meimaobing` and `/auth/meimaobing` in local Vite, and let the Service Worker pass those paths through.

## Non-Goals

- Do not change the default image route off `legacy-default`.
- Do not add settings login chrome, brand assets, or a default 1:1 size.
- Do not alias or migrate NewAPI / TokenHub profile ids.
- Do not add `VITE_` gateway URLs or browser-held TokenHub keys.

## Impact

- Affected specs:
  - `meimaobing-account`
- Affected code:
  - `packages/drawnix/src/services/provider-routing/provider-transport.ts`
  - `packages/drawnix/src/utils/settings-manager.ts`
  - `packages/drawnix/src/utils/gemini-api/auth.ts`
  - `packages/drawnix/src/utils/runtime-model-discovery.ts`
  - `packages/drawnix/src/services/media-generation/image-generation-service.ts`
  - `packages/drawnix/src/services/model-adapters/gpt-image-adapter.ts`
  - `apps/web/vite.config.ts`
  - `apps/web/src/sw/index.ts`
  - `.github/workflows/connect-ci.yml`
