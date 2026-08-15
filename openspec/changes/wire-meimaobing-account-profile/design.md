## Context

`meimaobing-account` is an unused factory. Settings still only rebuilds Tuzi and the legacy default profile. Later same-origin image wiring needs the profile to exist in the list, but making it the default image route now would send Opentu traffic through a disabled gateway.

## Goals / Non-Goals

- Goals: list the account profile, keep it disabled, keep the default image route on `legacy-default`
- Non-Goals: no NewAPI/TokenHub migration, no adapter/Vite/SW wiring, no settings chrome beyond the existing provider list

## Decisions

- Decision: Rebuild `meimaobing-account` the same way Tuzi built-ins are rebuilt.

  Users can see and later enable it. It is not selected by default.

- Decision: `enabled` defaults to false.

  The Image Gateway is still closed by `MEIMAOBING_IMAGE_GATEWAY_ENABLED=false`. Auto-enabling the profile would look like a working image provider.

- Decision: Do not migrate `newapi-images`.

  This fork never persisted that id through settings. Rewriting it would invent a NewAPI product path.

## Open Questions

- None for this registration-only slice.
