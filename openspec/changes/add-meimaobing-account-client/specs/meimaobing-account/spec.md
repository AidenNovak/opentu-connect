## ADDED Requirements

### Requirement: Same-Origin Account Session Client

The system SHALL provide a Meimaobing account client that reads the Image Gateway over the page origin with cookie credentials and SHALL NOT send a browser-held API key.

#### Scenario: Refresh uses cookie credentials

- **GIVEN** the browser origin is `https://drawnix.example.test`
- **WHEN** the account client refreshes
- **THEN** it SHALL `GET /meimaobing/account` with `credentials: 'include'`
- **AND** SHALL NOT attach an `Authorization` header

#### Scenario: Snapshot hides the OIDC subject

- **GIVEN** the gateway account JSON includes `account.subject`
- **WHEN** the client normalizes the snapshot
- **THEN** the UI snapshot SHALL include email and optional display name
- **AND** SHALL NOT include `subject`

#### Scenario: Cross-origin gateway URL is rejected

- **GIVEN** a configured API base URL whose origin differs from `window.location.origin`
- **WHEN** the client resolves gateway paths
- **THEN** it SHALL return `null`
- **AND** SHALL NOT call that URL

### Requirement: Account-Backed Image Profile Factory

The system SHALL describe a managed image provider profile identified only as `meimaobing-account`, authenticated by the Meimaobing session rather than an API key.

#### Scenario: Profile has no browser API key

- **GIVEN** `createMeimaobingAccountProviderProfile()` is called
- **WHEN** the profile is returned
- **THEN** `id` SHALL be `meimaobing-account`
- **AND** `apiKey` SHALL be empty
- **AND** `authType` SHALL be `custom`
- **AND** `baseUrl` SHALL be the same-origin `/meimaobing/v1` path

#### Scenario: NewAPI and TokenHub ids are not aliases

- **GIVEN** a profile id of `newapi-images` or `tokenhub-images`
- **WHEN** `isMeimaobingAccountProfileId` is evaluated
- **THEN** the result SHALL be false
- **AND** the module SHALL NOT export NewAPI or TokenHub alias symbols

### Requirement: Default Provider Routes Unchanged

This change SHALL NOT register the Meimaobing account profile in settings or alter the default image provider route.

#### Scenario: Settings manager is untouched

- **GIVEN** this change is applied
- **WHEN** `settings-manager` builds the default provider list
- **THEN** it SHALL NOT insert `meimaobing-account`
- **AND** existing Opentu provider selection SHALL remain unchanged
