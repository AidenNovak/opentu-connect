## ADDED Requirements

### Requirement: AI Input Bar SHALL Follow A Generated Image Target

The system SHALL reuse the existing AI input bar near a selected generated image.

#### Scenario: Select a generated image

- **GIVEN** a single image has stored generation prompt metadata
- **WHEN** the user selects the image
- **THEN** the AI input bar SHALL move near the image
- **AND** SHALL restore the image prompt for editing

#### Scenario: Clear target selection

- **GIVEN** the AI input bar is bound to a generated image
- **WHEN** the user clears the selection or selects unsupported content
- **THEN** the AI input bar SHALL return to its default bottom position

#### Scenario: Select a regular uploaded image

- **GIVEN** an image has no generation prompt or task binding
- **WHEN** the user selects the image
- **THEN** the AI input bar SHALL NOT enter target editing mode
