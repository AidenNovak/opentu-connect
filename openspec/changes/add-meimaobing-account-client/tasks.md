## 1. Account Client

- [x] 1.1 Add `meimaobing-account.ts` with cookie-credential refresh, sign-in, and sign-out.
- [x] 1.2 Reject cross-origin gateway URLs and unsafe `return_to` values.
- [x] 1.3 Keep the opaque OIDC subject out of the UI snapshot.

## 2. Managed Profile Factory

- [x] 2.1 Add `createMeimaobingAccountProviderProfile()` with empty `apiKey` and `/meimaobing/v1`.
- [x] 2.2 Identify the profile only as `meimaobing-account`.
- [x] 2.3 Do not export NewAPI or TokenHub aliases.

## 3. Navigation Helper And Isolation

- [x] 3.1 Add `openMeimaobingAccountSettings()` without mounting it in settings UI.
- [x] 3.2 Leave `settings-manager` and default provider routes unchanged.

## 4. Spec And Tests

- [x] 4.1 Add `openspec/changes/add-meimaobing-account-client`.
- [x] 4.2 Cover session refresh, sign-in return path, profile id, and alias absence.
- [x] 4.3 Run the new drawnix tests in fork CI.
