# Meimaobing Image Gateway

Run this process separately from the Vite frontend:

```bash
node tools/meimaobing-image-gateway/server.mjs
```

Configure it with the variables in `.env.example`. Put the static app and this
process behind one public origin. The managed frontend profile uses the fixed,
same-origin `/meimaobing/v1` path and an HttpOnly session; no `VITE_` gateway
URL or browser API key is required. For local development, proxy that path
from the Vite server to this process.

The gateway starts Meimaobing OIDC authorization-code login with PKCE and
keeps the resulting session in encrypted, HttpOnly cookies. It exposes only
model discovery, account state, and OpenAI-compatible image generation/edit
routes. Browser API keys are neither accepted nor stored. The gateway sends a
body-bound, image-only Product Assertion to the private Inference Broker,
which owns Application Wallet authorization and TokenHub credentials.

## Closed beta deployment

The deployment artifacts in [`deploy/`](./deploy/) are deliberately closed by
default. They run the gateway on a loopback-only host port and attach it to
the existing `meimaobing-beta-internal` Docker network; they do not publish a
new public port. The reviewed OpenTu Beta origin is
`https://image.truthtruth.co`: its host-Nginx site is
[`deploy/nginx/meimaobing-image-beta.conf`](./deploy/nginx/meimaobing-image-beta.conf),
which serves versioned static files from
`/opt/meimaobing-beta/image-web/current` and includes the gateway routes.

The Beta source now includes the `image` Product Assertion surface,
`/v1/account`, image reservation quotes, and final image reconciliation.
`MEIMAOBING_IMAGE_GATEWAY_ENABLED` defaults to `false`; changing it to `true`
requires the immutable Broker, Billing Bridge, and TokenHub images to be
verified together, the exact OIDC callback to be registered, and a coordinated
rollout approval. The deployment verifier requires that its non-secret Compose
value and the gateway secret agree, but an enabled gateway is not by itself a
wallet-acceptance result.

The Beta gateway accepts only
`MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE=cutover-truthtruth-isolated`: its
`top_up_url` must be exactly
`https://store.truthtruth.co/user/recharge/index`. It uses the isolated
`https://auth.truthtruth.co` OIDC issuer and a dedicated Image Beta client;
the verifier rejects a Prod issuer, legacy Store path, or any other profile.

The intended production boundary is:

```text
Browser -> same-origin Image Gateway -> private Inference Broker
                                         -> Billing Bridge / TokenHub
```

The browser holds only an HttpOnly Meimaobing session. The Broker reads and
authorizes the Application Wallet; neither the browser nor the gateway returns
or stores a TokenHub key.

For a staged deployment, build the Dockerfile with a Node 20 base image pinned
by digest, publish the resulting gateway image by digest, prepare the
mode-0600 `image-gateway.env`, then run `bash deploy/verify-beta.sh` before
starting the `managed-images` Compose profile. The verifier requires the
feature gate in Compose and the secret file to match; set it to `true` only
after the Broker, Billing Bridge, and TokenHub image contract is live.

The expected OIDC redirect is always:

```text
${MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN}/auth/meimaobing/callback
```

`auth.truthtruth.co` publishes the isolated Beta OIDC discovery document.
Register `meimaobing-image-gateway-truthtruth-beta` in that Beta Dex with the
exact callback above. Keep its separate secret in the private Beta Dex
environment and the gateway's mode-0600 secret file, never in the static
application.

The callback origin must remain identical to the origin where the customer
started OpenTu login. The transaction cookie is intentionally host-only; do
not add a cross-domain `Domain` attribute or redirect the callback through
an unrelated hostname.

When the private contract is ready, install both the site template and
[`deploy/nginx/meimaobing-image-gateway.location.conf`](./deploy/nginx/meimaobing-image-gateway.location.conf)
on the host. The routes keep all browser traffic same-origin, preserve
`Origin` for CSRF checks, support multipart image edits, and have no broad
CORS policy. The site also prevents a stale service worker from preserving the
pre-account error UI after a release.

## Public routes

```text
GET  /auth/meimaobing/login?return_to=/internal/path
GET  /auth/meimaobing/callback
POST /auth/meimaobing/logout
GET  /meimaobing/account
GET  /meimaobing/v1/models
POST /meimaobing/v1/images/generations
POST /meimaobing/v1/images/edits
```

Paid image requests require an `Idempotency-Key` and a same-origin `Origin`
header. The gateway has no generic CORS mode and deliberately drops all
browser-provided authorization and Meimaobing assertion headers.
