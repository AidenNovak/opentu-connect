## ADDED Requirements

### Requirement: Regeneration SHALL Replace The Bound Image In Place

The system SHALL create a new image task for an edited prompt and replace only the bound image target.

#### Scenario: Regeneration succeeds

- **GIVEN** a generated image is bound to the AI input bar
- **WHEN** the edited prompt task succeeds
- **THEN** the existing image element SHALL update to the new resource
- **AND** its element ID, position and dimensions SHALL remain unchanged
- **AND** its generation metadata SHALL update to the new task and prompt

#### Scenario: Regeneration fails

- **GIVEN** a generated image is bound to the AI input bar
- **WHEN** the edited prompt task fails
- **THEN** the original image SHALL remain unchanged
- **AND** the AI input bar SHALL expose a recoverable failure state

#### Scenario: Target was removed during generation

- **GIVEN** a replacement task references a bound image
- **AND** the image is removed before generation completes
- **WHEN** the result is processed
- **THEN** the system SHALL report post-processing failure
- **AND** SHALL NOT insert a new unbound image

#### Scenario: Edit one image from a batch

- **GIVEN** a batch produced independently bound images
- **WHEN** one image prompt is edited
- **THEN** only that image SHALL be replaced
