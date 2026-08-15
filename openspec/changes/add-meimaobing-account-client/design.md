## Context

The isolated Image Gateway authenticates with an HttpOnly cookie and mints a Product Assertion for the Application Wallet. The frontend still uses ordinary provider profiles with browser API keys. This change lands the unused client and profile factory so later wiring has one account-backed path. Default routing must stay on the current Opentu providers until that later change.

## Goals / Non-Goals

- Goals:
  - give the frontend a same-origin account client
  - describe a managed image profile that holds no API key
  - keep NewAPI and TokenHub out of this module
- Non-Goals:
  - no settings-manager registration
  - no image-generation path change
  - no historical `newapi-images` / `tokenhub-images` migration

## Decisions

- Decision: Profile id is only `meimaobing-account`.

  Do not alias `newapi-images` or `tokenhub-images`. Migration of old stored ids belongs in a later settings-manager change, and only if that fork actually persisted those ids.

- Decision: Gateway URL is the fixed same-origin `/meimaobing/v1` path.

  The browser must not configure a `VITE_` TokenHub or NewAPI base URL for this profile.

- Decision: `authType` is `custom` and `apiKey` is always empty.

  Authentication is the HttpOnly session cookie. A later executor must send `credentials: 'include'` and must not attach `Authorization: Bearer`.

- Decision: Leave `settings-manager` untouched.

  Creating the factory is not the same as inserting it into the default profile list.

## Risks / Trade-offs

- The modules are unused until the next wiring PR. That is intentional so default routes cannot silently switch.
- Omitting legacy id aliases means a later migration, if needed, must be explicit.

## Open Questions

- None for this unused-client slice.
