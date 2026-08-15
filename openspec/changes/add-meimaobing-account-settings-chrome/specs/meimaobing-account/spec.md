## ADDED Requirements

### Requirement: Settings Login Card

The settings provider detail for `meimaobing-account` SHALL show a Meimaobing login card as the default authentication path.

#### Scenario: Signed-out account shows login

- **GIVEN** the selected provider profile is `meimaobing-account`
- **AND** the account snapshot is signed out
- **WHEN** the provider detail renders
- **THEN** it SHALL show a control that starts Meimaobing sign-in
- **AND** SHALL keep API Key and Base URL editable

#### Scenario: Ready account shows wallet actions

- **GIVEN** the selected provider profile is `meimaobing-account`
- **AND** the account snapshot is authenticated
- **WHEN** the provider detail renders
- **THEN** it SHALL show available balance
- **AND** SHALL show sign-out
- **AND** SHALL show a top-up link when `topUpUrl` is present

### Requirement: No Tuzi Presets On The Account Profile

The `meimaobing-account` settings form SHALL NOT present Tuzi default endpoint, compatibility, or API-key tutorial controls.

#### Scenario: Tuzi widgets are hidden

- **GIVEN** the selected provider profile is `meimaobing-account`
- **WHEN** the provider detail renders
- **THEN** it SHALL NOT show the Tuzi endpoint picker
- **AND** SHALL NOT use `TUZI_PROVIDER_DEFAULT_BASE_URL` as the Base URL placeholder
- **AND** SHALL NOT show the Tuzi API Key tutorial

### Requirement: User-Filled Account Credentials Persist

The system SHALL keep a user-filled `apiKey` and `baseUrl` on `meimaobing-account` and SHALL NOT copy the legacy Tuzi key onto that profile.

#### Scenario: Custom key survives reload

- **GIVEN** stored settings contain `meimaobing-account` with `apiKey` `sk-user` and a custom `baseUrl`
- **WHEN** settings are loaded
- **THEN** that profile SHALL keep `apiKey` `sk-user`
- **AND** SHALL keep the custom `baseUrl`
- **AND** the default image route SHALL remain `legacy-default`
