## ADDED Requirements

### Requirement: Same-Origin Image Transport

The system SHALL send `meimaobing-account` image requests to the page origin with cookie credentials and SHALL NOT attach a browser API key.

#### Scenario: Paid image POST includes cookies and idempotency

- **GIVEN** the selected image route is `meimaobing-account`
- **WHEN** the client POSTs `/images/generations` or `/images/edits`
- **THEN** the request SHALL use `credentials: 'include'`
- **AND** SHALL NOT attach an `Authorization` header
- **AND** SHALL include `Idempotency-Key` when the caller did not supply one

#### Scenario: Network failure stays an account error

- **GIVEN** a `meimaobing-account` image request
- **WHEN** the browser fetch fails with a network error that is not an abort
- **THEN** the client SHALL throw `MeimaobingImageGatewayError` with code `ACCOUNT_UNAVAILABLE`
- **AND** SHALL NOT prompt for an API key

### Requirement: Account Route Credentials Without API Key

The system SHALL treat an enabled `meimaobing-account` route as credentialed by the Meimaobing session.

#### Scenario: Empty API key is enough for the account profile

- **GIVEN** `meimaobing-account` is enabled with an empty `apiKey`
- **WHEN** `hasInvocationRouteCredentials` is evaluated for that profile's image model
- **THEN** the result SHALL be true
- **AND** the resolved route `apiKey` SHALL remain empty
- **AND** the default image route SHALL remain `legacy-default`

#### Scenario: Auth skips the API key prompt

- **GIVEN** a Gemini config whose provider profile id is `meimaobing-account` or whose base URL is the reserved same-origin `/meimaobing/v1` path
- **WHEN** `validateAndEnsureConfig` runs
- **THEN** it SHALL require the Meimaobing image account session
- **AND** SHALL NOT prompt for an API key

### Requirement: Cookie-Backed Model Discovery

The system SHALL discover models for `meimaobing-account` over the same-origin gateway with cookie credentials.

#### Scenario: Discovery omits Bearer

- **GIVEN** runtime discovery is asked for profile `meimaobing-account`
- **WHEN** it requests `/models`
- **THEN** the fetch SHALL use `credentials: 'include'`
- **AND** SHALL NOT attach an `Authorization` header
- **AND** SHALL allow an empty API key
