# Change: Add Meimaobing account settings chrome

## Why

The same-origin account route exists, but settings still looks like a Tuzi API-key form. Users cannot sign in, see balance, or fill their own key/URL. This change adds the login card as the default path and keeps API Key / Base URL editable without Tuzi presets.

## What Changes

- Show a Meimaobing login / refresh / sign-out card with balance and top-up when `meimaobing-account` is selected.
- Keep API Key and Base URL enabled and user-fillable. Do not disable them.
- Hide Tuzi-only fields (provider type, image compatibility, async endpoint, Tuzi key tutorial, Tuzi URL placeholder) on that profile.
- Preserve a user-filled API key and custom base URL. Do not copy the Tuzi key onto this route.
- Allow model discovery after login or after the user fills an API key. Never fall back to the Tuzi default URL.

## Non-Goals

- Do not change the default image route off `legacy-default`.
- Do not add toolbar brand replacement or `truthtruth.co` defaults.
- Do not alias NewAPI / TokenHub profile ids.

## Impact

- Affected specs:
  - `meimaobing-account`
- Affected code:
  - `packages/drawnix/src/components/settings-dialog/`
  - `packages/drawnix/src/utils/managed-image-provider-profiles.ts`
  - `packages/drawnix/src/utils/settings-manager.ts`
  - `packages/drawnix/src/utils/runtime-model-discovery.ts`
  - `.github/workflows/connect-ci.yml`
