## 1. Settings Registration

- [x] 1.1 Rebuild `meimaobing-account` in `ensureLegacyCompatibility`.
- [x] 1.2 Default the profile to disabled with an empty API key.
- [x] 1.3 Attach the managed image catalog.
- [x] 1.4 Strip a stored API key on that profile id if one appears.

## 2. Isolation

- [x] 2.1 Keep the default image route on `legacy-default`.
- [x] 2.2 Do not migrate `newapi-images` or `tokenhub-images`.

## 3. Spec And Tests

- [x] 3.1 Add `openspec/changes/wire-meimaobing-account-profile`.
- [x] 3.2 Cover profile presence, default route, and NewAPI non-migration.
- [x] 3.3 Run `settings-manager` tests in fork CI.
