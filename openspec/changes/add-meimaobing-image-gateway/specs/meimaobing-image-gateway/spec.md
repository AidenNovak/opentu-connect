## ADDED Requirements

### Requirement: Isolated Image Gateway Process

The system SHALL provide Meimaobing Image Gateway as a standalone process under `tools/meimaobing-image-gateway`, separate from the Vite application and from NewAPI.

#### Scenario: Process is named for Meimaobing Image

- **GIVEN** the repository includes the Image Gateway
- **WHEN** an operator starts the process
- **THEN** the entrypoint SHALL be `tools/meimaobing-image-gateway/server.mjs`
- **AND** SHALL NOT live under a `newapi` path

### Requirement: Closed By Default

The system SHALL keep the Image Gateway disabled unless `MEIMAOBING_IMAGE_GATEWAY_ENABLED` is explicitly `true`.

#### Scenario: Disabled gateway refuses managed routes

- **GIVEN** `MEIMAOBING_IMAGE_GATEWAY_ENABLED` is unset or `false`
- **WHEN** a client requests `/auth/meimaobing/login`, `/meimaobing/account`, or `/meimaobing/v1/images/generations`
- **THEN** login SHALL redirect to the account-center failure URL
- **AND** account and image routes SHALL return `503` with code `ACCOUNT_UNAVAILABLE`

#### Scenario: Health check remains available while disabled

- **GIVEN** the gateway is disabled
- **WHEN** a client requests `GET /healthz`
- **THEN** the process SHALL return `200` with status `ok`

### Requirement: HttpOnly Session Without Browser API Keys

The system SHALL authenticate the browser with an encrypted HttpOnly session cookie and SHALL NOT accept or store a browser-held API key or TokenHub credential.

#### Scenario: Session cookie is HttpOnly

- **GIVEN** OIDC login completes
- **WHEN** the gateway sets `mb_image_session`
- **THEN** the cookie SHALL include `HttpOnly` and `SameSite=Lax`
- **AND** SHALL include `Secure` when the public origin is HTTPS

#### Scenario: No browser bearer route

- **GIVEN** a client sends `Authorization: Bearer` with a TokenHub or NewAPI key and no valid session cookie
- **WHEN** it requests `/meimaobing/v1/images/generations`
- **THEN** the gateway SHALL return `401` with code `SIGN_IN_REQUIRED`
- **AND** SHALL NOT forward that bearer token to TokenHub

### Requirement: Dedicated OIDC Client And Callback Origin

The system SHALL start Meimaobing OIDC authorization-code login with PKCE against the configured HTTPS issuer and SHALL keep the callback on the same public origin that served login.

#### Scenario: Callback stays on the public origin

- **GIVEN** `MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN` is `https://image.example.test`
- **WHEN** the gateway redirects to the authorization endpoint
- **THEN** `redirect_uri` SHALL be `https://image.example.test/auth/meimaobing/callback`

#### Scenario: Beta issuer is not production fallback

- **GIVEN** the Image Beta gateway is configured
- **WHEN** OIDC discovery runs
- **THEN** the issuer SHALL be the configured Image Beta origin
- **AND** SHALL NOT fall back to production Meimaobing auth

### Requirement: Canonical Dex Subject

The system SHALL unwrap a Dex protobuf-encoded OIDC `sub` to the embedded 36-byte UUID before using it as the Meimaobing Subject, and SHALL pass a raw UUID through unchanged.

#### Scenario: Dex protobuf subject unwraps to UUID

- **GIVEN** the ID token `sub` is a Dex protobuf subject encoded as base64url or base64
- **WHEN** the gateway normalizes identity
- **THEN** the session subject SHALL be the UUID in protobuf field 1

#### Scenario: Raw UUID subject is unchanged

- **GIVEN** the ID token `sub` is already a 36-byte UUID
- **WHEN** the gateway normalizes identity
- **THEN** the session subject SHALL equal that UUID

#### Scenario: Bearer token_type is case-insensitive

- **GIVEN** the token response `token_type` is `bearer`, `Bearer`, or `BEARER`
- **WHEN** the gateway validates the token type
- **THEN** the value SHALL be accepted as Bearer

### Requirement: Image-Only Product Assertion

The system SHALL send a body-bound, image-only Product Assertion to the private Inference Broker and SHALL NOT return TokenHub credentials to the browser.

#### Scenario: Broker request carries image assertion headers

- **GIVEN** a valid session cookie
- **WHEN** the gateway proxies an image generate or edit request
- **THEN** the Broker request SHALL include `X-Meimaobing-Subject`, `X-Meimaobing-Surface: image`, `X-Meimaobing-Product-Request-ID`, `X-Meimaobing-Principal-Timestamp`, and `X-Meimaobing-Principal-Signature`
- **AND** the surface SHALL be `image`

#### Scenario: Account payload hides wallet credentials

- **GIVEN** a valid session and a successful Broker account response
- **WHEN** the gateway returns `/meimaobing/account`
- **THEN** the JSON MAY include display name, email, wallet micro-USD fields, and `top_up_url`
- **AND** SHALL NOT include the opaque OIDC subject or a TokenHub key

### Requirement: Fixed Same-Origin Image Routes

The system SHALL expose only health, Meimaobing auth, account, model list, and image generate/edit routes on the public origin.

#### Scenario: Image generate requires session and same origin

- **GIVEN** a valid session cookie
- **AND** `Origin` matches `MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN`
- **WHEN** the client `POST`s `/meimaobing/v1/images/generations` with `application/json` and a valid `Idempotency-Key`
- **THEN** the gateway SHALL proxy the body to the Broker `/v1/images/generations` with the Product Assertion

#### Scenario: Cross-origin image POST is rejected

- **GIVEN** a valid session cookie
- **AND** `Origin` does not match the public origin
- **WHEN** the client `POST`s `/meimaobing/v1/images/generations`
- **THEN** the gateway SHALL return `403` with code `ORIGIN_NOT_ALLOWED`

### Requirement: Application Wallet Boundary

The system SHALL treat OpenTu image traffic as Application Wallet spend through the Inference Broker and SHALL NOT route that traffic to NewAPI's API Wallet.

#### Scenario: Insufficient Application Wallet maps to 402

- **GIVEN** the Broker rejects an image request for insufficient application credit
- **WHEN** the gateway translates the upstream error
- **THEN** the browser SHALL receive `402` with code `INSUFFICIENT_BALANCE`

#### Scenario: No NewAPI product path

- **GIVEN** the Image Gateway is deployed
- **WHEN** an operator inspects its public routes
- **THEN** the process SHALL NOT expose a NewAPI console, API Wallet, or `tools/newapi-*` entrypoint

### Requirement: Closed Beta Deployment Guardrails

The system SHALL keep Beta deployment artifacts closed by default: loopback host port, existing private network, digest-pinned image, and verifier checks that the feature gate, HTTPS origins, Store profile, and principal secrets match. Public hostnames SHALL come from environment configuration, not from a baked-in test domain.

#### Scenario: Verifier rejects an empty Store profile

- **GIVEN** `MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE` is empty
- **WHEN** `deploy/verify-beta.sh` runs
- **THEN** verification SHALL fail

#### Scenario: Principal secrets must match Broker

- **GIVEN** the gateway principal HMAC secret differs from `INFERENCE_BROKER_IMAGE_PRINCIPAL_HMAC_SECRET`
- **WHEN** `deploy/verify-beta.sh` runs
- **THEN** verification SHALL fail
