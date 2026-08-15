import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDiscovery, readGatewayConfig } from './server.mjs';

const LOCAL_ISSUER = 'http://issuer.alpha.localhost:13200/issuer';
const PROD_ISSUER = 'https://auth.example.test';

function gatewayEnv(overrides = {}) {
  return {
    MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN: 'https://image.example.test',
    MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER: PROD_ISSUER,
    MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID: 'alpha-image',
    MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_SECRET: 'change-me-image',
    MEIMAOBING_IMAGE_GATEWAY_SESSION_SECRET: 's'.repeat(32),
    MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET: 'p'.repeat(32),
    MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL:
      'http://epoch-verifier:8080/internal/v1/principal-sessions',
    MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT: 'image',
    MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET: 'v'.repeat(32),
    MEIMAOBING_IMAGE_GATEWAY_BROKER_BASE_URL: 'http://inference-broker:8080',
    ...overrides,
  };
}

function discovery(issuer, endpoints = {}) {
  return {
    issuer,
    authorization_endpoint: endpoints.authorization || `${issuer}/authorize`,
    token_endpoint: endpoints.token || `${issuer}/token`,
    userinfo_endpoint: endpoints.userinfo || `${issuer}/userinfo`,
    jwks_uri: endpoints.jwks || `${issuer}/jwks.json`,
  };
}

test('accepts a local HTTP issuer with an /issuer path suffix', () => {
  const parsed = parseDiscovery(discovery(LOCAL_ISSUER), LOCAL_ISSUER);
  assert.equal(parsed.issuer, LOCAL_ISSUER);
  assert.equal(parsed.authorizationEndpoint, `${LOCAL_ISSUER}/authorize`);
  assert.equal(parsed.tokenEndpoint, `${LOCAL_ISSUER}/token`);
});

test('accepts a production HTTPS origin issuer', () => {
  const parsed = parseDiscovery(discovery(PROD_ISSUER), PROD_ISSUER);
  assert.equal(parsed.authorizationEndpoint, `${PROD_ISSUER}/authorize`);
});

test('rejects HTTP endpoints for a production HTTPS issuer', () => {
  assert.throws(
    () =>
      parseDiscovery(
        discovery(PROD_ISSUER, {
          authorization: 'http://auth.example.test/authorize',
        }),
        PROD_ISSUER
      ),
    /outside the issuer origin/
  );
});

test('rejects discovery endpoints on a different origin', () => {
  assert.throws(
    () =>
      parseDiscovery(
        discovery(LOCAL_ISSUER, {
          token: 'http://evil.alpha.localhost:13200/issuer/token',
        }),
        LOCAL_ISSUER
      ),
    /outside the issuer origin/
  );
});

test('rejects endpoints that leave the issuer path prefix', () => {
  assert.throws(
    () =>
      parseDiscovery(
        discovery(LOCAL_ISSUER, {
          userinfo: 'http://issuer.alpha.localhost:13200/other/userinfo',
        }),
        LOCAL_ISSUER
      ),
    /outside the issuer origin/
  );
});

test('loads a local HTTP /issuer config against a compose verifier', () => {
  const config = readGatewayConfig(
    gatewayEnv({
      MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN: 'http://image.alpha.localhost:13200',
      MEIMAOBING_IMAGE_GATEWAY_COOKIE_SECURE: 'false',
      MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER: LOCAL_ISSUER,
    })
  );
  assert.equal(config.issuer, LOCAL_ISSUER);
  assert.equal(
    config.authEpochVerifier.baseUrl,
    'http://epoch-verifier:8080/internal/v1/principal-sessions'
  );
});

test('rejects a loopback epoch verifier hostname', () => {
  assert.throws(
    () =>
      readGatewayConfig(
        gatewayEnv({
          MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL:
            'http://127.0.0.1:8080/internal/v1/principal-sessions',
        })
      ),
    /internal HTTP principal-session endpoint/
  );
  assert.throws(
    () =>
      readGatewayConfig(
        gatewayEnv({
          MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL:
            'http://localhost:8080/internal/v1/principal-sessions',
        })
      ),
    /internal HTTP principal-session endpoint/
  );
});
