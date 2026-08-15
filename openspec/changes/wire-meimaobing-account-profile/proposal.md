# Change: Register Meimaobing account profile without changing default routes

## Why

The account client and profile factory exist but `settings-manager` never inserts `meimaobing-account`, so settings cannot show it and later same-origin wiring has nothing to select. This change registers the profile as a disabled built-in. It does not make it the default image route and does not migrate NewAPI or TokenHub ids.

## What Changes

- Rebuild `meimaobing-account` in `ensureLegacyCompatibility`, with empty `apiKey` and `enabled: false` by default.
- Attach the managed image catalog for that profile.
- Keep the default invocation image route on `legacy-default`.
- Leave stored `newapi-images` / `tokenhub-images` ids unchanged.

## Non-Goals

- Do not switch image generation onto `/meimaobing/v1`.
- Do not add settings UI chrome beyond the profile appearing in the existing provider list.
- Do not alias or migrate NewAPI / TokenHub profile ids.

## Impact

- Affected specs:
  - `meimaobing-account`
- Affected code:
  - `packages/drawnix/src/utils/settings-manager.ts`
  - `packages/drawnix/src/utils/__tests__/settings-manager.test.ts`
  - `.github/workflows/connect-ci.yml`
