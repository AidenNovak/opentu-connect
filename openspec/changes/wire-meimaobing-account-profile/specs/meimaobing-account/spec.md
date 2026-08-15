## MODIFIED Requirements

### Requirement: Default Provider Routes Unchanged

This change SHALL register `meimaobing-account` as an available provider profile and SHALL NOT make it the default image route.

#### Scenario: Settings manager lists the account profile

- **GIVEN** settings are initialized with no stored Meimaobing profile
- **WHEN** `settings-manager` rebuilds built-in profiles
- **THEN** `providerProfiles` SHALL include `meimaobing-account`
- **AND** that profile SHALL have an empty `apiKey`
- **AND** `enabled` SHALL be false

#### Scenario: Default image route stays on the legacy profile

- **GIVEN** settings are initialized without an explicit image route override
- **WHEN** the default invocation preset is built
- **THEN** the image `defaultModelRef.profileId` SHALL remain `legacy-default`

## ADDED Requirements

### Requirement: Do Not Migrate NewAPI Profile Ids

The system SHALL NOT rewrite stored `newapi-images` or `tokenhub-images` profile ids to `meimaobing-account` in this change.

#### Scenario: Stored NewAPI profile remains a separate id

- **GIVEN** local settings contain a profile with id `newapi-images`
- **WHEN** settings are loaded
- **THEN** that profile id SHALL remain `newapi-images`
- **AND** `meimaobing-account` SHALL still be present as its own profile
