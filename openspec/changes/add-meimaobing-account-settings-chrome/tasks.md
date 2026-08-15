## 1. Account Card

- [x] 1.1 Extract a settings account card with login, refresh, sign-out, balance, and top-up.
- [x] 1.2 Cover signed-out and ready states with tests.

## 2. Settings Wiring

- [x] 2.1 Render the card when `meimaobing-account` is selected.
- [x] 2.2 Keep API Key and Base URL enabled.
- [x] 2.3 Hide Tuzi provider-type, compatibility, async, tutorial, and URL placeholder on that profile.
- [x] 2.4 Allow model discovery after login or a filled API key, without a Tuzi URL fallback.
- [x] 2.5 Mark `meimaobing-account` as a managed profile so it cannot be deleted.

## 3. Persistence

- [x] 3.1 Preserve user-filled API key and custom base URL on the account profile.
- [x] 3.2 Do not copy the legacy Tuzi key onto that route.

## 4. Spec And CI

- [x] 4.1 Add `openspec/changes/add-meimaobing-account-settings-chrome`.
- [x] 4.2 Run the new tests in fork CI.
