## Context

`meimaobing-account` exists in settings as a disabled built-in. Image generation, model discovery, and Gemini auth still assume a browser API key. Local Vite and the Service Worker do not yet treat `/meimaobing` as an API surface.

## Goals / Non-Goals

- Goals: cookie-backed same-origin image and model calls when the account profile is selected; keep the default Opentu image route unchanged
- Non-Goals: settings login UI, brand assets, default size, NewAPI/TokenHub aliases, public hostname defaults

## Decisions

- Decision: Attach `credentials: 'include'` in `provider-transport` for `meimaobing-account`.

  The session is an HttpOnly cookie on the page origin. Bearer auth would invent a browser-held key.

- Decision: Add an `Idempotency-Key` only for POST `/images/generations` and `/images/edits`.

  Those routes create a payable Broker reservation. Model discovery and account reads do not.

- Decision: Vite proxies `/meimaobing` and `/auth/meimaobing` to `127.0.0.1:8787` by default.

  That is a local process address, overridable with `MEIMAOBING_IMAGE_GATEWAY_DEV_TARGET`. It is not a product hostname and is not a `VITE_` browser setting.

- Decision: The Service Worker must passthrough gateway paths.

  Navigation to `/auth/meimaobing/login` is a document request. Caching it as `index.html` would break OIDC.

## Open Questions

- None for this wiring slice.
