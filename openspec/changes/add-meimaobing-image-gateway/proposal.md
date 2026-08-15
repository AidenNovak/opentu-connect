# Change: Add isolated Meimaobing Image Gateway

## Why

OpenTu image traffic on Meimaobing must settle the Application Wallet, not NewAPI's API Wallet. The browser cannot hold a TokenHub key. That requires a same-origin, browser-facing OIDC client that mints a Product Assertion for the private Inference Broker. This change records that isolated process and its closed-by-default security contract so later frontend wiring has an approved boundary.

## What Changes

- Add a standalone Node process at `tools/meimaobing-image-gateway`.
- Authenticate the browser with Meimaobing OIDC authorization-code plus PKCE and keep the session in encrypted HttpOnly cookies.
- Proxy only account, model discovery, and OpenAI-compatible image generate/edit routes on same-origin `/meimaobing/*`.
- Attach an image-only Product Assertion when calling the private Inference Broker. Do not accept or store a browser API key.
- Default `MEIMAOBING_IMAGE_GATEWAY_ENABLED` to `false`. A disabled gateway must not start OIDC login or proxy image traffic.
- Keep Dex protobuf `sub` unwrap and bearer `token_type` case handling aligned with Store and Super App.
- Keep closed-beta Compose/Nginx/verifier artifacts on a loopback host port and the existing `meimaobing-beta-internal` network.

## Non-Goals

- Do not wire `settings-manager`, Vite, or the Service Worker in this change.
- Do not add a Meimaobing account client or managed provider profile.
- Do not expose NewAPI console, API Wallet, or `tools/newapi-*` paths.
- Do not enable the public Beta gateway as part of landing the process.

## Impact

- Affected specs:
  - `meimaobing-image-gateway` (new)
- Affected code:
  - `tools/meimaobing-image-gateway/`
  - `.github/workflows/connect-ci.yml`
