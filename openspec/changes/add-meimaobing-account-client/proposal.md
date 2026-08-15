# Change: Add Meimaobing account client without changing routes

## Why

The Image Gateway is now in the repository, but the OpenTu frontend still has no module that talks to the HttpOnly session. The next wiring steps need a client that reads `/meimaobing/account`, starts OIDC login, and describes a managed image profile. That client must not introduce NewAPI or TokenHub browser-key aliases, and must not change default provider routing in this change.

## What Changes

- Add `meimaobing-account.ts` for same-origin session refresh, sign-in, and sign-out.
- Add `createMeimaobingAccountProviderProfile()` with id `meimaobing-account`, empty `apiKey`, and base URL `/meimaobing/v1`.
- Add `openMeimaobingAccountSettings()` as a settings-navigation helper. Settings does not call it yet.
- Do not register the profile in `settings-manager`. Default Opentu provider routes stay unchanged.

## Non-Goals

- Do not wire `settings-manager`, Vite, Service Worker, or image adapters.
- Do not export `newapi-images`, `createNewApiImageProviderProfile`, or TokenHub browser-key profiles.
- Do not migrate historical localStorage profile ids in this change.
- Do not add brand assets.

## Impact

- Affected specs:
  - `meimaobing-account` (new)
- Affected code:
  - `packages/drawnix/src/utils/meimaobing-account.ts`
  - `packages/drawnix/src/utils/managed-image-provider-profiles.ts`
  - `packages/drawnix/src/utils/provider-settings-navigation.ts`
  - `.github/workflows/connect-ci.yml`
