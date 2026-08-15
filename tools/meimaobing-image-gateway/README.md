# Meimaobing Image Gateway

Run this process separately from the Vite frontend:

```bash
node tools/meimaobing-image-gateway/server.mjs
```

Configure it with the variables in `.env.example`. Put the static app and this
process behind one public origin. The managed frontend profile uses the fixed,
same-origin `/meimaobing/v1` path and an HttpOnly session; no `VITE_` gateway
URL or browser API key is required. For local development, proxy that path
from the Vite server to this process. `apps/web/vite.config.ts` proxies
`/meimaobing` and `/auth/meimaobing` to `MEIMAOBING_IMAGE_GATEWAY_DEV_TARGET`
(default `http://127.0.0.1:8787`). That target is a local process address,
not a product hostname.

The gateway starts Meimaobing OIDC authorization-code login with PKCE and
keeps the resulting session in encrypted, HttpOnly cookies. It exposes only
model discovery, account state, and OpenAI-compatible image generation/edit
routes. Browser API keys are neither accepted nor stored. The gateway sends a
body-bound, image-only Product Assertion to the private Inference Broker,
which owns Application Wallet authorization and TokenHub credentials.

Public origin, OIDC issuer, client id, and Store recharge URL are environment
values. This repository does not ship a product hostname.

## Closed beta deployment

The deployment artifacts in [`deploy/`](./deploy/) are templates. They run the
gateway on a loopback-only host port and attach it to the existing
`meimaobing-beta-internal` Docker network; they do not publish a new public
port. Replace the `example.test` hostnames in the Nginx site and secret
example with the origin you are actually deploying.

`MEIMAOBING_IMAGE_GATEWAY_ENABLED` defaults to `false`; changing it to `true`
requires the immutable Broker, Billing Bridge, and TokenHub images to be
verified together, the exact OIDC callback to be registered, and a coordinated
rollout approval. The deployment verifier requires that its non-secret Compose
value and the gateway secret agree, but an enabled gateway is not by itself a
wallet-acceptance result.

The verifier checks HTTPS origins, cookie security, secret length and
separation, principal-HMAC match with the Broker, a named Store ingress
profile, and an HTTPS `top_up_url`. It does not pin a particular public DNS
name.

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

Register a dedicated Image Dex client against the environment's OIDC issuer
with that exact callback. Keep its secret in the private Dex environment and
the gateway's mode-0600 secret file, never in the static application.

The callback origin must remain identical to the origin where the customer
started OpenTu login. The transaction cookie is intentionally host-only; do
not add a cross-domain `Domain` attribute or redirect the callback through
an unrelated hostname.

When the private contract is ready, install both the site template and
[`deploy/nginx/meimaobing-image-gateway.location.conf`](./deploy/nginx/meimaobing-image-gateway.location.conf)
on the host after replacing `example.test` hostnames. The routes keep all
browser traffic same-origin, preserve `Origin` for CSRF checks, support
multipart image edits, and have no broad CORS policy. The site also prevents
a stale service worker from preserving the pre-account error UI after a
release.

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
