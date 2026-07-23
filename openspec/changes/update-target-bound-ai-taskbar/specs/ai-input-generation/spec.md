## ADDED Requirements

### Requirement: AI Input Bar SHALL Follow The Current Image Target

The system SHALL reuse the existing AI input bar near a selected generated image or regular uploaded image.

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
- **THEN** the AI input bar SHALL move near the image
- **AND** SHALL show the selected image as the current target
- **AND** SHALL use an empty prompt
- **AND** SHALL NOT match an image task by an asset-library URL
- **AND** SHALL NOT inherit another image's prompt, task, anchor, attachments or knowledge context

#### Scenario: Change the current image target

- **GIVEN** the AI input bar is bound to image A
- **WHEN** the user selects image B
- **THEN** the target thumbnail SHALL display image B
- **AND** image A's asynchronous Blob result or retry timer SHALL NOT overwrite image B

#### Scenario: Replace the source of the same image element

- **GIVEN** an image remains selected
- **WHEN** its URL, prompt, task ID or anchor ID changes in place
- **THEN** the AI input bar SHALL refresh the target context without requiring reselection
