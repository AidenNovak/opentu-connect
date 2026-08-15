// @vitest-environment node
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMeimaobingImageGateway,
  readGatewayConfig,
} from '../../../../../tools/meimaobing-image-gateway/server.mjs';

const UI_ORIGIN = 'http://app.example.test';
const OIDC_ISSUER = 'https://auth.example.test';
const SWITCHED_OIDC_ISSUER = 'https://auth.switched.example.test';
const BROKER_ORIGIN = 'http://broker.internal';
const PRINCIPAL_SESSION_ORIGIN =
  'http://beta-better-auth-center:8080/internal/v1/principal-sessions';
const STORE_RECHARGE_URL = 'https://store.example.test/user/recharge/index';
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const publicJwk = publicKey.export({ format: 'jwk' }) as Record<string, string>;
const servers: Array<ReturnType<typeof createMeimaobingImageGateway>> = [];

type BrokerResponder = (
  url: string,
  init: RequestInit
) => Response | Promise<Response>;

interface GatewayHarness {
  baseUrl: string;
  brokerRequests: Array<{ url: string; init: RequestInit }>;
  fetchImpl: ReturnType<typeof vi.fn>;
  setTokenNonce: (nonce: string) => void;
  setPrincipalEpoch: (epoch: number) => void;
}

function gatewayConfig(overrides: Record<string, unknown> = {}) {
  return {
    publicOrigin: UI_ORIGIN,
    issuer: OIDC_ISSUER,
    clientId: 'drawnix-image-beta',
    clientSecret: 'server-only-client-secret',
    sessionSecret: 'session-secret-with-at-least-32-characters',
    principalSecret: 'principal-secret-with-at-least-32-chars',
    authEpochVerifier: {
      baseUrl: PRINCIPAL_SESSION_ORIGIN,
      product: 'image',
      secret: 'image-principal-session-verifier-secret-0001',
    },
    brokerBaseUrl: BROKER_ORIGIN,
    topUpUrl: STORE_RECHARGE_URL,
    models: ['gpt-image-2'],
    maxBodyBytes: 1024 * 1024,
    sessionTtlSeconds: 8 * 60 * 60,
    cookieSecure: false,
    port: 0,
    enabled: true,
    ...overrides,
  };
}

function base64Url(value: object) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createIdToken(nonce: string) {
  const header = base64Url({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const payload = base64Url({
    iss: OIDC_ISSUER,
    sub: 'meimaobing-user-123',
    aud: gatewayConfig().clientId,
    nonce,
    iat: Math.floor(NOW / 1000),
    exp: Math.floor(NOW / 1000) + 60 * 60,
  });
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString(
    'base64url'
  )}`;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function startGateway(
  brokerResponder: BrokerResponder = async () =>
      new Response(JSON.stringify({ wallet: { available_microusd: 1_000_000 } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  config = gatewayConfig()
): Promise<GatewayHarness> {
  let tokenNonce = '';
  let principalEpoch = 1;
  const brokerRequests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = requestUrl(input);
    if (url === `${OIDC_ISSUER}/.well-known/openid-configuration`) {
      return new Response(
        JSON.stringify({
          issuer: OIDC_ISSUER,
          authorization_endpoint: `${OIDC_ISSUER}/authorize`,
          token_endpoint: `${OIDC_ISSUER}/token`,
          userinfo_endpoint: `${OIDC_ISSUER}/userinfo`,
          jwks_uri: `${OIDC_ISSUER}/jwks`,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url === `${OIDC_ISSUER}/token`) {
      return new Response(
        JSON.stringify({
          token_type: 'Bearer',
          access_token: 'oidc-access-token',
          id_token: createIdToken(tokenNonce),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url === `${OIDC_ISSUER}/jwks`) {
      return new Response(
        JSON.stringify({
          keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }],
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url === `${OIDC_ISSUER}/userinfo`) {
      return new Response(
        JSON.stringify({
          sub: 'meimaobing-user-123',
          name: 'Meimaobing Tester',
          email: 'tester@example.test',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url === `${PRINCIPAL_SESSION_ORIGIN}/issue`) {
      const body = JSON.parse(String(init.body || '{}')) as { subject?: string };
      return new Response(
        body.subject === 'meimaobing-user-123'
          ? JSON.stringify({ auth_epoch: principalEpoch })
          : '',
        {
          status: body.subject === 'meimaobing-user-123' ? 200 : 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (url === `${PRINCIPAL_SESSION_ORIGIN}/verify`) {
      const body = JSON.parse(String(init.body || '{}')) as {
        subject?: string;
        auth_epoch?: number;
      };
      return new Response(null, {
        status:
          body.subject === 'meimaobing-user-123' && body.auth_epoch === principalEpoch
            ? 204
            : 409,
      });
    }
    if (url.startsWith(BROKER_ORIGIN)) {
      brokerRequests.push({ url, init });
      return brokerResponder(url, init);
    }
    throw new Error(`Unexpected gateway fetch: ${url}`);
  });
  let nextRandomValue = 0;
  const server = createMeimaobingImageGateway({
    config,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => NOW,
    randomBytes: (size: number) => Buffer.alloc(size, ++nextRandomValue),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    brokerRequests,
    fetchImpl,
    setTokenNonce: (nonce) => {
      tokenNonce = nonce;
    },
    setPrincipalEpoch: (epoch) => {
      principalEpoch = epoch;
    },
  };
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  return (
    headers.getSetCookie?.() ||
    (response.headers
      .get('set-cookie')
      ?.split(/,(?=[^;,\s]+=)/)
      .filter(Boolean) ?? [])
  );
}

function cookiePair(response: Response, name: string): string {
  const cookie = setCookies(response).find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie.split(';', 1)[0];
}

async function signIn(
  gateway: GatewayHarness,
  returnTo = '/canvas?source=settings'
) {
  const login = await fetch(
    `${gateway.baseUrl}/auth/meimaobing/login?return_to=${encodeURIComponent(returnTo)}`,
    { redirect: 'manual' }
  );
  const authorizationUrl = new URL(login.headers.get('location') || '');
  gateway.setTokenNonce(authorizationUrl.searchParams.get('nonce') || '');
  const callback = await fetch(
    `${gateway.baseUrl}/auth/meimaobing/callback?code=accepted&state=${encodeURIComponent(
      authorizationUrl.searchParams.get('state') || ''
    )}`,
    {
      redirect: 'manual',
      headers: {
        Cookie: cookiePair(login, 'mb_image_oidc_tx'),
      },
    }
  );
  return {
    authorizationUrl,
    callback,
    sessionCookie: cookiePair(callback, 'mb_image_session'),
  };
}

function deriveProductRequestId(idempotencyKey: string) {
  const config = gatewayConfig();
  const key = createHash('sha256')
    .update(`product-request-id\n${config.sessionSecret}`, 'utf8')
    .digest();
  const digest = createHmac('sha256', key)
    .update(
      `meimaobing-user-123\nPOST\n/v1/images/generations\n${idempotencyKey}`,
      'utf8'
    )
    .digest('base64url');
  return `mbr_img_${digest}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
});

describe('Meimaobing Image Gateway', () => {
  it('defaults environment-based beta deployments to disabled', () => {
    const config = readGatewayConfig({
      MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN: 'https://app.example.test',
      MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER: OIDC_ISSUER,
      MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID: 'drawnix-image-beta',
      MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_SECRET: 'server-only-client-secret',
      MEIMAOBING_IMAGE_GATEWAY_SESSION_SECRET:
        'session-secret-with-at-least-32-characters',
      MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET:
        'principal-secret-with-at-least-32-chars',
      MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL:
        PRINCIPAL_SESSION_ORIGIN,
      MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT: 'image',
      MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET:
        'image-principal-session-verifier-secret-0001',
      MEIMAOBING_IMAGE_GATEWAY_BROKER_BASE_URL: BROKER_ORIGIN,
      MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL: STORE_RECHARGE_URL,
    });

    expect(config.enabled).toBe(false);
    expect(config.topUpUrl).toBe(STORE_RECHARGE_URL);
  });

  it('keeps account and image routes unavailable while the beta gate is closed and sends browser login to the account-center error page', async () => {
    const gateway = await startGateway(undefined, gatewayConfig({ enabled: false }));

    const health = await fetch(`${gateway.baseUrl}/healthz`);
    const account = await fetch(`${gateway.baseUrl}/meimaobing/account`);
    const login = await fetch(
      `${gateway.baseUrl}/auth/meimaobing/login`,
      { redirect: 'manual' }
    );

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
    expect(account.status).toBe(503);
    await expect(account.json()).resolves.toEqual({
      error: { code: 'ACCOUNT_UNAVAILABLE' },
    });
    expect(login.status).toBe(302);
    expect(login.headers.get('location')).toBe(
      'https://auth.example.test/portal/login?error=login_unavailable'
    );
    expect(gateway.brokerRequests).toEqual([]);
  });

  it('binds PKCE login to an internal return path and stores only an HttpOnly session', async () => {
    const gateway = await startGateway();
    const { authorizationUrl, callback, sessionCookie } = await signIn(
      gateway,
      'https://attacker.example.test/steal'
    );

    expect(authorizationUrl.origin).toBe(OIDC_ISSUER);
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('client_id')).toBe(
      gatewayConfig().clientId
    );
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      `${UI_ORIGIN}/auth/meimaobing/callback`
    );
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
      'S256'
    );
    expect(authorizationUrl.searchParams.get('state')).toBeTruthy();
    expect(authorizationUrl.searchParams.get('nonce')).toBeTruthy();
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');
    expect(sessionCookie).toMatch(/^mb_image_session=/);
    expect(setCookies(callback).join('\n')).toContain('HttpOnly');
    expect(setCookies(callback).join('\n')).toContain('SameSite=Lax');
    expect(setCookies(callback).join('\n')).not.toMatch(/(?:^|;)\s*Domain=/i);
    expect(setCookies(callback).join('\n')).not.toContain('oidc-access-token');
  });

  it('binds a sealed image session to its issuer and never returns its opaque subject to the browser', async () => {
    const gateway = await startGateway();
    const { sessionCookie } = await signIn(gateway);

    const account = await fetch(`${gateway.baseUrl}/meimaobing/account`, {
      headers: { Cookie: sessionCookie },
    });
    expect(account.status).toBe(200);
    const accountPayload = await account.json();
    expect(accountPayload).toMatchObject({
      authenticated: true,
      account: {
        display_name: 'Meimaobing Tester',
        email: 'tester@example.test',
      },
    });
    expect(accountPayload.account).not.toHaveProperty('subject');

    const switchedIssuer = await startGateway(
      undefined,
      gatewayConfig({ issuer: SWITCHED_OIDC_ISSUER })
    );
    const staleSession = await fetch(`${switchedIssuer.baseUrl}/meimaobing/account`, {
      headers: { Cookie: sessionCookie },
    });
    expect(staleSession.status).toBe(401);
    await expect(staleSession.json()).resolves.toEqual({
      error: { code: 'SIGN_IN_REQUIRED' },
    });
  });

  it('rejects a sealed image session after the account-center epoch advances', async () => {
    const gateway = await startGateway();
    const { sessionCookie } = await signIn(gateway);
    gateway.setPrincipalEpoch(2);

    const response = await fetch(`${gateway.baseUrl}/meimaobing/account`, {
      headers: { Cookie: sessionCookie },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'SIGN_IN_REQUIRED' },
    });
    expect(gateway.brokerRequests).toEqual([]);
  });

  it('sends invalid browser callbacks to the shared account center and rejects unauthenticated image access without reaching the broker', async () => {
    const gateway = await startGateway();
    const callback = await fetch(
      `${gateway.baseUrl}/auth/meimaobing/callback?code=accepted&state=wrong`,
      { redirect: 'manual' }
    );
    const image = await fetch(
      `${gateway.baseUrl}/meimaobing/v1/images/generations`,
      {
        method: 'POST',
        headers: {
          Origin: UI_ORIGIN,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'request-12345',
        },
        body: JSON.stringify({ prompt: 'private prompt' }),
      }
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(
      'https://auth.example.test/portal/login?error=product_login_failed'
    );
    expect(callback.headers.get('set-cookie')).toContain('mb_image_oidc_tx=');
    expect(callback.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(image.status).toBe(401);
    await expect(image.json()).resolves.toEqual({
      error: { code: 'SIGN_IN_REQUIRED' },
    });
    expect(gateway.brokerRequests).toEqual([]);
  });

  it('forwards an authenticated image call with a body-bound Product Assertion and no browser bearer key', async () => {
    const gateway = await startGateway(
      async () =>
        new Response(JSON.stringify({ data: [{ url: 'https://image.example.test/a.png' }] }), {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'broker-request-123',
          },
        })
    );
    const { sessionCookie } = await signIn(gateway);
    const body = JSON.stringify({ model: 'gpt-image-2', prompt: 'private prompt' });
    const idempotencyKey = 'image-request-12345';

    const response = await fetch(
      `${gateway.baseUrl}/meimaobing/v1/images/generations`,
      {
        method: 'POST',
        headers: {
          Origin: UI_ORIGIN,
          Cookie: sessionCookie,
          Authorization: 'Bearer browser-secret-that-must-not-forward',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('broker-request-123');
    await expect(response.json()).resolves.toEqual({
      data: [{ url: 'https://image.example.test/a.png' }],
    });
    expect(gateway.brokerRequests).toHaveLength(1);
    const brokerRequest = gateway.brokerRequests[0];
    expect(brokerRequest.url).toBe(`${BROKER_ORIGIN}/v1/images/generations`);
    expect(Buffer.from(brokerRequest.init.body as Uint8Array).toString('utf8')).toBe(
      body
    );
    const headers = new Headers(brokerRequest.init.headers);
    const productRequestId = deriveProductRequestId(idempotencyKey);
    const timestamp = new Date(NOW).toISOString();
    const expectedSignature = createHmac(
      'sha256',
      gatewayConfig().principalSecret
    )
      .update(
        [
          timestamp,
          'POST',
          '/v1/images/generations',
          'meimaobing-user-123',
          'image',
          productRequestId,
          createHash('sha256').update(body).digest('hex'),
        ].join('\n'),
        'utf8'
      )
      .digest('hex');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-meimaobing-subject')).toBe('meimaobing-user-123');
    expect(headers.get('x-meimaobing-surface')).toBe('image');
    expect(headers.get('x-meimaobing-product-request-id')).toBe(productRequestId);
    expect(headers.get('x-meimaobing-principal-timestamp')).toBe(timestamp);
    expect(headers.get('x-meimaobing-principal-signature')).toBe(expectedSignature);
  });

  it('requires a same-origin request and an idempotency key for paid image calls', async () => {
    const gateway = await startGateway();
    const { sessionCookie } = await signIn(gateway);
    const endpoint = `${gateway.baseUrl}/meimaobing/v1/images/generations`;
    const crossOrigin = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example.test',
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'image-request-12345',
      },
      body: JSON.stringify({ prompt: 'private prompt' }),
    });
    const noIdempotency = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Origin: UI_ORIGIN,
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'private prompt' }),
    });

    expect(crossOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toEqual({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
    });
    expect(noIdempotency.status).toBe(400);
    await expect(noIdempotency.json()).resolves.toEqual({
      error: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
    });
    expect(gateway.brokerRequests).toEqual([]);
  });

  it('redacts an insufficient-balance broker response and exposes only the configured top-up destination', async () => {
    const gateway = await startGateway(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'insufficient_application_credit',
              detail: 'private broker and wallet diagnostic',
            },
          }),
          { status: 402, headers: { 'Content-Type': 'application/json' } }
        )
    );
    const { sessionCookie } = await signIn(gateway);
    const response = await fetch(
      `${gateway.baseUrl}/meimaobing/v1/images/generations`,
      {
        method: 'POST',
        headers: {
          Origin: UI_ORIGIN,
          Cookie: sessionCookie,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'image-request-12345',
        },
        body: JSON.stringify({ prompt: 'private prompt' }),
      }
    );

    expect(response.status).toBe(402);
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      error: {
        code: 'INSUFFICIENT_BALANCE',
        top_up_url: STORE_RECHARGE_URL,
      },
    });
    expect(responseText).not.toContain('private broker');
  });

  it('clears the authenticated session only from a same-origin logout request', async () => {
    const gateway = await startGateway();
    const { sessionCookie } = await signIn(gateway);
    const denied = await fetch(`${gateway.baseUrl}/auth/meimaobing/logout`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.example.test', Cookie: sessionCookie },
    });
    const logout = await fetch(`${gateway.baseUrl}/auth/meimaobing/logout`, {
      method: 'POST',
      headers: { Origin: UI_ORIGIN, Cookie: sessionCookie },
    });

    expect(denied.status).toBe(403);
    expect(logout.status).toBe(204);
    expect(setCookies(logout).join('\n')).toContain('mb_image_session=');
    expect(setCookies(logout).join('\n')).toContain('Max-Age=0');
  });
});
