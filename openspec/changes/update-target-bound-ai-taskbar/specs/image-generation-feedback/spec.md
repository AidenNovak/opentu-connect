## ADDED Requirements

### Requirement: Generated Images SHALL Preserve Lightweight Target Metadata

The system SHALL preserve enough metadata to restore prompt editing without storing media binaries or full task history in canvas elements.

#### Scenario: Insert a generated image

- **WHEN** an image generation result is inserted
- **THEN** the image element SHALL retain its prompt, task ID and anchor ID
- **AND** the anchor SHALL retain the result element ID and latest task relationship

#### Scenario: Detailed task history is unavailable

- **GIVEN** a generated image remains on the canvas
- **AND** detailed task history is unavailable
- **WHEN** the image is selected
- **THEN** the AI input bar SHALL restore the prompt from image metadata
