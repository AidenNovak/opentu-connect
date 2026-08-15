import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// The Image gateway is an isolated Meimaobing OIDC client. The issuer comes
// from env; there is no baked-in public hostname.

const DEFAULT_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
  'gpt-image-2',
  'codex-gpt-image-2',
];
const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const OIDC_TRANSACTION_TTL_SECONDS = 10 * 60;
const OIDC_DISCOVERY_TTL_MS = 5 * 60 * 1000;
const OIDC_REQUEST_TIMEOUT_MS = 10 * 1000;
const SESSION_COOKIE_NAME = 'mb_image_session';
const TRANSACTION_COOKIE_NAME = 'mb_image_oidc_tx';
const SESSION_COOKIE_AAD = 'meimaobing-image-gateway-session-v1';
const TRANSACTION_COOKIE_AAD = 'meimaobing-image-gateway-transaction-v1';
const IMAGE_SURFACE = 'image';
const ACCOUNT_PATH = '/v1/account';
const IMAGE_PATHS = new Set([
  '/v1/images/generations',
  '/v1/images/edits',
]);

function isManagedImageGatewayRoute(path) {
  return (
    path === '/meimaobing/account' ||
    path === '/meimaobing/v1/models' ||
    path.startsWith('/meimaobing/v1/images/') ||
    path.startsWith('/auth/meimaobing/')
  );
}

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, '');
}

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw new Error('Boolean environment value must be true or false');
}

function requiredString(value, name, minimumLength = 1) {
  const normalized = String(value || '').trim();
  if (normalized.length < minimumLength) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function parsePublicOrigin(value) {
  let parsed;
  try {
    parsed = new URL(requiredString(value, 'MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN'));
  } catch {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN must be an absolute URL');
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN must contain only an HTTP(S) origin'
    );
  }
  if (parsed.protocol === 'http:' && !isLocalHostname(parsed.hostname)) {
    throw new Error(
      'MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN must use HTTPS outside local development'
    );
  }
  return parsed.origin;
}

function parseIssuer(value) {
  const raw = requiredString(value, 'MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER must be an absolute URL');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER must contain only an HTTPS origin'
    );
  }
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  if (isLocalHostname(parsed.hostname)) {
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      (path !== '/' && path !== '/issuer')
    ) {
      throw new Error(
        'MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER local value must be an HTTP(S) origin or /issuer'
      );
    }
    return path === '/' ? parsed.origin : `${parsed.origin}${path}`;
  }
  if (parsed.protocol !== 'https:' || path !== '/') {
    throw new Error(
      'MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER must contain only an HTTPS origin'
    );
  }
  return parsed.origin;
}

function parsePrivateServiceUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(requiredString(value, name));
  } catch {
    throw new Error(`${name} must be an absolute HTTP URL`);
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must contain only an HTTP(S) origin`);
  }
  return trimTrailingSlashes(parsed.origin);
}

function parsePrincipalSessionVerifier(env, sessionSecret, principalSecret, clientSecret) {
  const value = requiredString(
    env.MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL,
    'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL'
  );
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL must use the fixed Beta internal endpoint');
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  const hostname = parsed.hostname.toLowerCase();
  const composeService =
    hostname !== 'localhost' &&
    hostname !== '127.0.0.1' &&
    hostname !== '::1' &&
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname);
  if (
    parsed.protocol !== 'http:' ||
    parsed.port !== '8080' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    path !== '/internal/v1/principal-sessions' ||
    !composeService
  ) {
    throw new Error(
      'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL must be an internal HTTP principal-session endpoint'
    );
  }
  if (requiredString(env.MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT, 'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT') !== 'image') {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT must remain image');
  }
  const secret = requiredString(
    env.MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET,
    'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET',
    32
  );
  if ([sessionSecret, principalSecret, clientSecret].includes(secret)) {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET must be distinct from gateway credentials');
  }
  return { baseUrl: parsed.toString().replace(/\/$/, ''), product: 'image', secret };
}

function parseModelList(value) {
  const models = String(value || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const resolved = models.length > 0 ? models : DEFAULT_IMAGE_MODELS;
  if (
    resolved.some(
      (model) =>
        model.length > 160 || !/^[A-Za-z0-9._:/-]+$/.test(model)
    )
  ) {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_MODELS contains an invalid model ID');
  }
  return [...new Set(resolved)];
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
  );
}

/**
 * Reads only deployment metadata and server-held credentials. The public
 * browser bundle receives neither this configuration nor any provider key.
 */
export function readGatewayConfig(env = process.env) {
  const publicOrigin = parsePublicOrigin(
    env.MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN
  );
  const publicUrl = new URL(publicOrigin);
  const cookieSecure = parseBoolean(
    env.MEIMAOBING_IMAGE_GATEWAY_COOKIE_SECURE,
    publicUrl.protocol === 'https:'
  );
  if (!cookieSecure && !isLocalHostname(publicUrl.hostname)) {
    throw new Error(
      'MEIMAOBING_IMAGE_GATEWAY_COOKIE_SECURE may be disabled only for local development'
    );
  }

  const clientSecret = requiredString(
    env.MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_SECRET,
    'MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_SECRET'
  );
  const sessionSecret = requiredString(
    env.MEIMAOBING_IMAGE_GATEWAY_SESSION_SECRET,
    'MEIMAOBING_IMAGE_GATEWAY_SESSION_SECRET',
    32
  );
  const principalSecret = requiredString(
    env.MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET,
    'MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET',
    32
  );
  return {
    // The public beta stays closed until the Broker/TokenHub image surface is
    // deployed and its reservation contract has been verified end to end.
    enabled: parseBoolean(env.MEIMAOBING_IMAGE_GATEWAY_ENABLED, false),
    publicOrigin,
    issuer: parseIssuer(env.MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER),
    clientId: requiredString(
      env.MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID,
      'MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID'
    ),
    clientSecret,
    sessionSecret,
    principalSecret,
    authEpochVerifier: parsePrincipalSessionVerifier(env, sessionSecret, principalSecret, clientSecret),
    brokerBaseUrl: parsePrivateServiceUrl(
      env.MEIMAOBING_IMAGE_GATEWAY_BROKER_BASE_URL,
      'MEIMAOBING_IMAGE_GATEWAY_BROKER_BASE_URL'
    ),
    topUpUrl: normalizeTopUpUrl(env.MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL),
    models: parseModelList(env.MEIMAOBING_IMAGE_GATEWAY_MODELS),
    maxBodyBytes: parsePositiveInteger(
      env.MEIMAOBING_IMAGE_GATEWAY_MAX_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
      128 * 1024 * 1024
    ),
    sessionTtlSeconds: parsePositiveInteger(
      env.MEIMAOBING_IMAGE_GATEWAY_SESSION_TTL_SECONDS,
      DEFAULT_SESSION_TTL_SECONDS,
      24 * 60 * 60
    ),
    cookieSecure,
    port: parsePositiveInteger(env.PORT, 8787, 65535),
  };
}

function normalizeTopUpUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL must be an absolute HTTPS URL');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error('MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL must be an absolute HTTPS URL');
  }
  return parsed.toString();
}

// Keep the old export names temporarily so deployment scripts can change
// configuration without changing their process entry point in the same rollout.
export const readBridgeConfig = readGatewayConfig;

function deriveKey(secret, purpose) {
  return createHash('sha256')
    .update(`${purpose}\n${secret}`, 'utf8')
    .digest();
}

function sealPayload(payload, key, aad, randomBytes) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

function unsealPayload(value, key, aad) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parts[0], 'base64url')
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parts[1], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const result = new Map();
  if (typeof header !== 'string' || !header) return result;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator <= 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (name && value) result.set(name, value);
  }
  return result;
}

function buildCookie(name, value, config, maxAgeSeconds) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.cookieSecure) attributes.push('Secure');
  return attributes.join('; ');
}

function clearCookie(name, config) {
  return buildCookie(name, '', config, 0);
}

function setCookies(response, cookies) {
  if (!cookies || cookies.length === 0) return;
  response.setHeader('Set-Cookie', cookies);
}

function sendJson(response, statusCode, body, options = {}) {
  response.statusCode = statusCode;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (options.headers) {
    for (const [name, value] of Object.entries(options.headers)) {
      response.setHeader(name, value);
    }
  }
  setCookies(response, options.cookies);
  response.end(JSON.stringify(body));
}

function sendError(response, statusCode, code, config, options = {}) {
  const error = { code };
  if (code === 'INSUFFICIENT_BALANCE' && config.topUpUrl) {
    error.top_up_url = config.topUpUrl;
  }
  sendJson(response, statusCode, { error }, options);
}

function redirect(response, location, cookies) {
  response.statusCode = 302;
  response.setHeader('Location', location);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  setCookies(response, cookies);
  response.end();
}

// Browser-facing callback failures are deliberately sent to the shared Beta
// account center rather than rendered as JSON by this product. This URL never
// carries a product state, code, return target, or provider error, so it cannot
// resume or weaken a rejected transaction.
function accountCenterFailureUrl(config, reason = 'product_login_failed') {
  const target = new URL('/portal/login', config.issuer);
  target.searchParams.set('error', reason);
  return target.toString();
}

function safeReturnTo(value, publicOrigin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  try {
    const resolved = new URL(value, publicOrigin);
    if (resolved.origin !== publicOrigin || /[\u0000-\u001f\u007f]/.test(value)) {
      return '/';
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}

function randomOpaqueValue(randomBytes) {
  return randomBytes(32).toString('base64url');
}

function sameValue(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function isBearerTokenType(value) {
  return value === undefined || (typeof value === 'string' && value.toLowerCase() === 'bearer');
}

function isValidSubject(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 255 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/**
 * Dex's OIDC connector emits an opaque protobuf-encoded subject (base64url,
 * typically 60 bytes). Better Auth principal-state keys the Image product by
 * the exact raw OIDC user id (a 36-byte UUID) embedded as protobuf field 1.
 * Store and Super App unwrap the same encoding before issue/verify. A raw
 * UUID passes through unchanged.
 */
export function canonicalPrincipalSubject(sub) {
  if (typeof sub !== 'string' || sub.length === 0 || sub.length <= 36) {
    return sub;
  }
  for (const encoding of ['base64url', 'base64']) {
    try {
      const decoded = Buffer.from(sub, encoding);
      if (decoded.length > 2 && decoded[0] === 0x0a) {
        const length = decoded[1];
        if (2 + length <= decoded.length) {
          const userId = decoded.subarray(2, 2 + length).toString('utf8');
          if (/^[0-9a-fA-F-]{36}$/.test(userId)) return userId;
        }
      }
    } catch {
      // Try the next encoding. JWT subjects are base64url; some fixtures use
      // standard base64 with padding.
    }
  }
  return sub;
}

function normalizeIdentity(claims, userInfo) {
  const userInfoSubject = typeof userInfo?.sub === 'string' ? userInfo.sub : '';
  if (!isValidSubject(claims.sub) || !sameValue(claims.sub, userInfoSubject)) {
    throw new Error('OIDC userinfo subject does not match the ID token');
  }
  const pick = (value) =>
    typeof value === 'string' ? value.trim() : '';
  const email = pick(userInfo.email).toLowerCase();
  if (
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('OIDC userinfo did not provide a valid email');
  }
  return {
    sub: canonicalPrincipalSubject(claims.sub.trim()),
    name: pick(userInfo.name || userInfo.preferred_username).slice(0, 200),
    email,
  };
}

function createTransaction(returnTo, now, randomBytes) {
  return {
    state: randomOpaqueValue(randomBytes),
    nonce: randomOpaqueValue(randomBytes),
    codeVerifier: randomOpaqueValue(randomBytes),
    returnTo,
    startedAt: now(),
  };
}

function validTransaction(transaction, now) {
  if (!transaction || !Number.isFinite(transaction.startedAt)) return false;
  for (const key of ['state', 'nonce', 'codeVerifier']) {
    if (
      typeof transaction[key] !== 'string' ||
      transaction[key].length < 32 ||
      transaction[key].length > 256
    ) {
      return false;
    }
  }
  if (
    typeof transaction.returnTo !== 'string' ||
    transaction.returnTo.length > 1024
  ) {
    return false;
  }
  const age = now() - transaction.startedAt;
  return age >= -60 * 1000 && age <= OIDC_TRANSACTION_TTL_SECONDS * 1000;
}

function createSession(identity, issuer, now, sessionTtlSeconds, authEpoch) {
  const issuedAt = now();
  return {
    ...identity,
    issuer,
    authEpoch,
    issuedAt,
    expiresAt: issuedAt + sessionTtlSeconds * 1000,
  };
}

function validSession(session, issuer, now) {
  return (
    session &&
    isValidSubject(session.sub) &&
    typeof session.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(session.email) &&
    typeof session.issuer === 'string' &&
    sameValue(session.issuer, issuer) &&
    Number.isSafeInteger(session.authEpoch) &&
    session.authEpoch > 0 &&
    Number.isFinite(session.issuedAt) &&
    Number.isFinite(session.expiresAt) &&
    session.expiresAt > now() &&
    session.expiresAt - session.issuedAt <= 24 * 60 * 60 * 1000
  );
}

function principalSessionSignature(config, timestamp, body) {
  return createHmac('sha256', config.authEpochVerifier.secret)
    .update(`${config.authEpochVerifier.product}\n${timestamp}\n${body}`, 'utf8')
    .digest('base64url');
}

async function principalSessionRequest(config, fetchImpl, mode, payload, now) {
  const body = JSON.stringify(payload);
  const timestamp = String(now());
  return fetchImpl(`${config.authEpochVerifier.baseUrl}/${mode}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-beta-product': config.authEpochVerifier.product,
      'x-beta-auth-timestamp': timestamp,
      'x-beta-auth-signature': principalSessionSignature(config, timestamp, body),
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
  });
}

async function issuePrincipalSessionEpoch(config, fetchImpl, subject, now) {
  if (!isValidSubject(subject) || Buffer.byteLength(subject, 'utf8') > 36) {
    throw new Error('OIDC subject is invalid');
  }
  const response = await principalSessionRequest(config, fetchImpl, 'issue', { subject }, now);
  if (!response.ok) throw new Error('account-center principal session is unavailable');
  const payload = await response.json();
  const epoch = Number(payload?.auth_epoch);
  if (!Number.isSafeInteger(epoch) || epoch <= 0) {
    throw new Error('account-center principal session response is invalid');
  }
  return epoch;
}

async function verifyPrincipalSessionEpoch(config, fetchImpl, session, now) {
  if (!session || !isValidSubject(session.sub) || !Number.isSafeInteger(session.authEpoch) || session.authEpoch <= 0) {
    return false;
  }
  try {
    const response = await principalSessionRequest(
      config,
      fetchImpl,
      'verify',
      { subject: session.sub, auth_epoch: session.authEpoch },
      now
    );
    return response.status === 204;
  } catch {
    return false;
  }
}

function sha256Base64Url(value) {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

export function parseDiscovery(raw, issuer) {
  if (!raw || raw.issuer !== issuer) {
    throw new Error('OIDC discovery issuer does not match configuration');
  }
  return {
    issuer,
    authorizationEndpoint: issuerEndpoint(
      raw.authorization_endpoint,
      'authorization_endpoint',
      issuer
    ),
    tokenEndpoint: issuerEndpoint(raw.token_endpoint, 'token_endpoint', issuer),
    userInfoEndpoint: issuerEndpoint(
      raw.userinfo_endpoint,
      'userinfo_endpoint',
      issuer
    ),
    jwksUri: issuerEndpoint(raw.jwks_uri, 'jwks_uri', issuer),
  };
}

function issuerEndpoint(value, name, issuer) {
  let endpoint;
  try {
    endpoint = new URL(String(value || ''));
  } catch {
    throw new Error(`OIDC discovery ${name} is invalid`);
  }
  let issuerUrl;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw new Error(`OIDC discovery ${name} is outside the issuer origin`);
  }
  const issuerPath = issuerUrl.pathname.replace(/\/+$/, '');
  const endpointPath = endpoint.pathname.replace(/\/+$/, '') || '/';
  const pathOk =
    issuerPath === '' ||
    endpointPath === issuerPath ||
    endpointPath.startsWith(`${issuerPath}/`);
  const localHttp =
    issuerUrl.protocol === 'http:' && isLocalHostname(issuerUrl.hostname);
  if (
    endpoint.protocol !== (localHttp ? 'http:' : 'https:') ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.origin !== issuerUrl.origin ||
    !pathOk
  ) {
    throw new Error(`OIDC discovery ${name} is outside the issuer origin`);
  }
  return endpoint.toString();
}

function decodeJsonSegment(segment, description) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new Error(`OIDC ${description} is invalid`);
  }
}

function verifyJwtSignature(header, signingInput, signature, jwks) {
  if (
    !header ||
    typeof header.kid !== 'string' ||
    (header.alg !== 'RS256' && header.alg !== 'ES256')
  ) {
    return false;
  }
  const jwk = jwks.find(
    (candidate) =>
      candidate &&
      candidate.kid === header.kid &&
      candidate.alg === header.alg &&
      ((header.alg === 'RS256' && candidate.kty === 'RSA') ||
        (header.alg === 'ES256' && candidate.kty === 'EC'))
  );
  if (!jwk) return false;
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    if (header.alg === 'RS256') {
      return verifySignature(
        'RSA-SHA256',
        Buffer.from(signingInput, 'utf8'),
        key,
        signature
      );
    }
    return verifySignature(
      'sha256',
      Buffer.from(signingInput, 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      signature
    );
  } catch {
    return false;
  }
}

function verifyClaims(claims, config, nonce, now) {
  if (!claims || claims.iss !== config.issuer || !isValidSubject(claims.sub)) {
    throw new Error('OIDC ID token claims are invalid');
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some((audience) => audience === config.clientId)) {
    throw new Error('OIDC ID token audience is invalid');
  }
  if (audiences.length > 1 && claims.azp !== config.clientId) {
    throw new Error('OIDC ID token authorized party is invalid');
  }
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now()) {
    throw new Error('OIDC ID token has expired');
  }
  if (
    !Number.isFinite(claims.iat) ||
    claims.iat * 1000 > now() + 60 * 1000 ||
    claims.iat * 1000 < now() - 24 * 60 * 60 * 1000
  ) {
    throw new Error('OIDC ID token issued-at claim is invalid');
  }
  if (!sameValue(claims.nonce, nonce)) {
    throw new Error('OIDC ID token nonce is invalid');
  }
}

function createOidcClient(config, fetchImpl, now) {
  let discoveryCache = null;
  let jwksCache = null;

  const discover = async () => {
    if (discoveryCache && discoveryCache.expiresAt > now()) {
      return discoveryCache.value;
    }
    const response = await fetchImpl(
      `${config.issuer}/.well-known/openid-configuration`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
      }
    );
    if (!response.ok) throw new Error('OIDC discovery request failed');
    const value = parseDiscovery(await response.json(), config.issuer);
    discoveryCache = { value, expiresAt: now() + OIDC_DISCOVERY_TTL_MS };
    return value;
  };

  const loadJwks = async (jwksUri) => {
    if (jwksCache && jwksCache.uri === jwksUri && jwksCache.expiresAt > now()) {
      return jwksCache.value;
    }
    const response = await fetchImpl(jwksUri, {
      redirect: 'error',
      signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('OIDC key set request failed');
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.keys)) {
      throw new Error('OIDC key set is invalid');
    }
    jwksCache = {
      uri: jwksUri,
      value: payload.keys,
      expiresAt: now() + OIDC_DISCOVERY_TTL_MS,
    };
    return payload.keys;
  };

  const authorizationUrl = async (transaction) => {
    const discovery = await discover();
    const url = new URL(discovery.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', `${config.publicOrigin}/auth/meimaobing/callback`);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', transaction.state);
    url.searchParams.set('nonce', transaction.nonce);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set(
      'code_challenge',
      sha256Base64Url(transaction.codeVerifier)
    );
    return url.toString();
  };

  const completeAuthorizationCode = async (code, transaction) => {
    const discovery = await discover();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${config.publicOrigin}/auth/meimaobing/callback`,
      code_verifier: transaction.codeVerifier,
    });
    const basic = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
      'utf8'
    ).toString('base64');
    const tokenResponse = await fetchImpl(discovery.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
    });
    if (!tokenResponse.ok) throw new Error('OIDC token exchange failed');
    const token = await tokenResponse.json();
    if (
      !token ||
      typeof token.id_token !== 'string' ||
      typeof token.access_token !== 'string' ||
      !isBearerTokenType(token.token_type)
    ) {
      throw new Error('OIDC token response is invalid');
    }

    const parts = token.id_token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean)) {
      throw new Error('OIDC ID token is invalid');
    }
    const header = decodeJsonSegment(parts[0], 'ID token header');
    const claims = decodeJsonSegment(parts[1], 'ID token payload');
    const signature = Buffer.from(parts[2], 'base64url');
    const jwks = await loadJwks(discovery.jwksUri);
    if (!verifyJwtSignature(header, `${parts[0]}.${parts[1]}`, signature, jwks)) {
      throw new Error('OIDC ID token signature is invalid');
    }
    verifyClaims(claims, config, transaction.nonce, now);

    const userInfoResponse = await fetchImpl(discovery.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
    });
    if (!userInfoResponse.ok) throw new Error('OIDC userinfo request failed');
    return normalizeIdentity(claims, await userInfoResponse.json());
  };

  return { authorizationUrl, completeAuthorizationCode };
}

function headerValue(request, name) {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return null;
  if (typeof value !== 'string' || !value.trim() || value.includes(',')) {
    return null;
  }
  return value.trim();
}

function requestMediaType(request) {
  const raw = headerValue(request, 'content-type');
  if (!raw) return null;
  return raw.split(';', 1)[0].trim().toLowerCase();
}

function isSameOriginRequest(request, config) {
  return headerValue(request, 'origin') === config.publicOrigin;
}

async function readRequestBody(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error('Request body is too large');
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if (body.length === 0) {
    const error = new Error('Request body is required');
    error.code = 'BODY_REQUIRED';
    throw error;
  }
  return body;
}

function validIdempotencyKey(value) {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 255 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function derivedProductRequestId(secret, subject, method, path, idempotencyKey) {
  const digest = createHmac('sha256', deriveKey(secret, 'product-request-id'))
    .update(`${subject}\n${method}\n${path}\n${idempotencyKey}`, 'utf8')
    .digest('base64url');
  return `mbr_img_${digest}`;
}

function principalSignature(secret, timestamp, method, path, subject, productRequestId, body) {
  const digest = createHash('sha256').update(body).digest('hex');
  const payload = [
    timestamp,
    method,
    path,
    subject,
    IMAGE_SURFACE,
    productRequestId,
    digest,
  ].join('\n');
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function brokerHeaders(config, session, input, now) {
  const timestamp = new Date(now()).toISOString();
  const productRequestId = derivedProductRequestId(
    config.sessionSecret,
    session.sub,
    input.method,
    input.path,
    input.idempotencyKey
  );
  const headers = {
    'X-Meimaobing-Subject': session.sub,
    'X-Meimaobing-Surface': IMAGE_SURFACE,
    'X-Meimaobing-Product-Request-ID': productRequestId,
    'X-Meimaobing-Principal-Timestamp': timestamp,
    'X-Meimaobing-Principal-Signature': principalSignature(
      config.principalSecret,
      timestamp,
      input.method,
      input.path,
      session.sub,
      productRequestId,
      input.body
    ),
  };
  if (input.contentType) headers['Content-Type'] = input.contentType;
  if (input.accept) headers.Accept = input.accept;
  return headers;
}

function safeUpstreamHeaders(upstream) {
  const result = {};
  const contentType = upstream.headers.get('content-type');
  const requestId = upstream.headers.get('x-request-id');
  const location = upstream.headers.get('location');
  if (contentType) result['Content-Type'] = contentType;
  if (requestId) result['X-Request-ID'] = requestId;
  if (location && location.startsWith('/v1/image-jobs/')) {
    result.Location = `/meimaobing${location}`;
  }
  return result;
}

function errorCodeFromBroker(status, body) {
  let brokerCode = '';
  try {
    const parsed = JSON.parse(body.toString('utf8'));
    brokerCode = String(parsed?.error?.code || '').toLowerCase();
  } catch {
    // The browser intentionally receives no upstream diagnostic text.
  }
  if (
    status === 402 ||
    brokerCode === 'insufficient_balance' ||
    brokerCode === 'insufficient_application_credit' ||
    brokerCode === 'application_wallet_insufficient_balance'
  ) {
    return 'INSUFFICIENT_BALANCE';
  }
  if (status === 401 || brokerCode === 'invalid_principal') {
    return 'ACCOUNT_UNAVAILABLE';
  }
  if (status === 409 || brokerCode.includes('invocation_pending')) {
    return 'REQUEST_PENDING';
  }
  if (status >= 500) return 'ACCOUNT_UNAVAILABLE';
  return 'IMAGE_REQUEST_REJECTED';
}

function accountResponse(session, payload, config) {
  const wallet = payload?.wallet && typeof payload.wallet === 'object'
    ? payload.wallet
    : null;
  const normalizeInteger = (value) =>
    Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    authenticated: true,
    account: {
      display_name: session.name || null,
      // The browser sees the canonical login email, never the opaque OIDC
      // subject used internally for wallet ownership.
      email: session.email,
    },
    wallet: wallet
      ? {
          currency: wallet.currency === 'USD' ? 'USD' : 'USD',
          available_microusd:
            normalizeInteger(wallet.available_microusd) ??
            normalizeInteger(wallet.availableMicrousd),
          reserved_microusd:
            normalizeInteger(wallet.reserved_microusd) ??
            normalizeInteger(wallet.reservedMicrousd),
        }
      : null,
    top_up_url: config.topUpUrl,
  };
}

function sessionFromRequest(request, sessionKey, issuer, now) {
  const raw = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME);
  if (!raw) return null;
  let sealedSession;
  try {
    sealedSession = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const session = unsealPayload(sealedSession, sessionKey, SESSION_COOKIE_AAD);
  return validSession(session, issuer, now) ? session : null;
}

function transactionFromRequest(request, transactionKey, now) {
  const raw = parseCookies(request.headers.cookie).get(TRANSACTION_COOKIE_NAME);
  if (!raw) return null;
  let sealedTransaction;
  try {
    sealedTransaction = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const transaction = unsealPayload(
    sealedTransaction,
    transactionKey,
    TRANSACTION_COOKIE_AAD
  );
  return validTransaction(transaction, now) ? transaction : null;
}

/**
 * Creates the browser-facing Meimaobing Image Gateway. It deliberately has no
 * route for a browser-held bearer key and no CORS escape hatch.
 */
export function createMeimaobingImageGateway(options = {}) {
  const config = options.config || readGatewayConfig();
  // Hand-built test/in-process configs from the pre-gate contract did not
  // include `enabled`; preserve their behavior while env-based deployments
  // remain closed by default through readGatewayConfig().
  const enabled = config.enabled === undefined ? true : config.enabled === true;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const randomBytes = options.randomBytes || nodeRandomBytes;
  const sessionKey = deriveKey(config.sessionSecret, 'session');
  const transactionKey = deriveKey(config.sessionSecret, 'transaction');
  const oidc = createOidcClient(config, fetchImpl, now);

  const requireSession = async (request, response) => {
    const session = sessionFromRequest(request, sessionKey, config.issuer, now);
    if (!session || !(await verifyPrincipalSessionEpoch(config, fetchImpl, session, now))) {
      sendError(response, 401, 'SIGN_IN_REQUIRED', config);
      return null;
    }
    return session;
  };

  const proxyAccount = async (request, response, session) => {
    try {
      const body = Buffer.alloc(0);
      const brokerResponse = await fetchImpl(`${config.brokerBaseUrl}${ACCOUNT_PATH}`, {
        method: 'GET',
        headers: brokerHeaders(
          config,
          session,
          {
            method: 'GET',
            path: ACCOUNT_PATH,
            body,
            idempotencyKey: `account-${randomOpaqueValue(randomBytes)}`,
          },
          now
        ),
        redirect: 'error',
        signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
      });
      if (!brokerResponse.ok) {
        sendError(
          response,
          brokerResponse.status >= 500 ? 503 : 409,
          'ACCOUNT_UNAVAILABLE',
          config
        );
        return;
      }
      const payload = await brokerResponse.json();
      sendJson(response, 200, accountResponse(session, payload, config));
    } catch {
      sendError(response, 503, 'ACCOUNT_UNAVAILABLE', config);
    }
  };

  const proxyImageRequest = async (request, response, session, path) => {
    if (!isSameOriginRequest(request, config)) {
      sendError(response, 403, 'ORIGIN_NOT_ALLOWED', config);
      return;
    }
    const contentType = requestMediaType(request);
    const expectedType =
      path === '/v1/images/generations' ? 'application/json' : 'multipart/form-data';
    if (
      !contentType ||
      (path === '/v1/images/generations'
        ? contentType !== expectedType
        : contentType !== expectedType)
    ) {
      sendError(response, 415, 'INVALID_CONTENT_TYPE', config);
      return;
    }
    const idempotencyKey = headerValue(request, 'idempotency-key');
    if (!validIdempotencyKey(idempotencyKey)) {
      sendError(response, 400, 'IDEMPOTENCY_KEY_REQUIRED', config);
      return;
    }
    let body;
    try {
      body = await readRequestBody(request, config.maxBodyBytes);
    } catch (error) {
      sendError(
        response,
        error?.code === 'BODY_TOO_LARGE' ? 413 : 400,
        error?.code === 'BODY_TOO_LARGE' ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_IMAGE_REQUEST',
        config
      );
      return;
    }
    try {
      const brokerResponse = await fetchImpl(`${config.brokerBaseUrl}${path}`, {
        method: 'POST',
        headers: brokerHeaders(
          config,
          session,
          {
            method: 'POST',
            path,
            body,
            contentType: headerValue(request, 'content-type'),
            accept: headerValue(request, 'accept'),
            idempotencyKey,
          },
          now
        ),
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      const responseBody = Buffer.from(await brokerResponse.arrayBuffer());
      if (!brokerResponse.ok) {
        sendError(
          response,
          brokerResponse.status,
          errorCodeFromBroker(brokerResponse.status, responseBody),
          config
        );
        return;
      }
      response.statusCode = brokerResponse.status;
      response.setHeader('Cache-Control', 'no-store');
      for (const [name, value] of Object.entries(safeUpstreamHeaders(brokerResponse))) {
        response.setHeader(name, value);
      }
      response.end(responseBody);
    } catch {
      sendError(response, 503, 'ACCOUNT_UNAVAILABLE', config);
    }
  };

  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', config.publicOrigin);
    const path = requestUrl.pathname;

    if (path === '/healthz') {
      if (request.method !== 'GET') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'GET' },
        });
        return;
      }
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (!enabled && isManagedImageGatewayRoute(path)) {
      if (path.startsWith('/auth/meimaobing/')) {
        redirect(response, accountCenterFailureUrl(config, 'login_unavailable'));
        return;
      }
      sendError(response, 503, 'ACCOUNT_UNAVAILABLE', config);
      return;
    }

    if (path === '/auth/meimaobing/login') {
      if (request.method !== 'GET') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'GET' },
        });
        return;
      }
      try {
        const transaction = createTransaction(
          safeReturnTo(requestUrl.searchParams.get('return_to'), config.publicOrigin),
          now,
          randomBytes
        );
        const transactionCookie = sealPayload(
          transaction,
          transactionKey,
          TRANSACTION_COOKIE_AAD,
          randomBytes
        );
        redirect(response, await oidc.authorizationUrl(transaction), [
          buildCookie(
            TRANSACTION_COOKIE_NAME,
            transactionCookie,
            config,
            OIDC_TRANSACTION_TTL_SECONDS
          ),
        ]);
      } catch {
        redirect(response, accountCenterFailureUrl(config, 'login_unavailable'));
      }
      return;
    }

    if (path === '/auth/meimaobing/callback') {
      if (request.method !== 'GET') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'GET' },
        });
        return;
      }
      const transaction = transactionFromRequest(request, transactionKey, now);
      const clearTransaction = [clearCookie(TRANSACTION_COOKIE_NAME, config)];
      const state = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      if (!transaction || !sameValue(state, transaction.state) || !code) {
        console.error('image-gateway callback rejected', {
          hasTransaction: Boolean(transaction),
          hasCode: Boolean(code),
          stateMatches: Boolean(transaction) && sameValue(state, transaction.state),
        });
        redirect(response, accountCenterFailureUrl(config), clearTransaction);
        return;
      }
      try {
        const identity = await oidc.completeAuthorizationCode(code, transaction);
        const authEpoch = await issuePrincipalSessionEpoch(config, fetchImpl, identity.sub, now);
        const session = createSession(
          identity,
          config.issuer,
          now,
          config.sessionTtlSeconds,
          authEpoch
        );
        const sessionCookie = sealPayload(
          session,
          sessionKey,
          SESSION_COOKIE_AAD,
          randomBytes
        );
        redirect(response, transaction.returnTo, [
          ...clearTransaction,
          buildCookie(
            SESSION_COOKIE_NAME,
            sessionCookie,
            config,
            config.sessionTtlSeconds
          ),
        ]);
      } catch (error) {
        console.error(
          'image-gateway callback failed',
          error instanceof Error ? error.message : 'unknown'
        );
        redirect(response, accountCenterFailureUrl(config), clearTransaction);
      }
      return;
    }

    if (path === '/auth/meimaobing/logout') {
      if (request.method !== 'POST') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'POST' },
        });
        return;
      }
      if (!isSameOriginRequest(request, config)) {
        sendError(response, 403, 'ORIGIN_NOT_ALLOWED', config);
        return;
      }
      sendJson(response, 204, {}, {
        cookies: [clearCookie(SESSION_COOKIE_NAME, config)],
      });
      return;
    }

    if (path === '/meimaobing/account') {
      if (request.method !== 'GET') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'GET' },
        });
        return;
      }
      const session = await requireSession(request, response);
      if (session) await proxyAccount(request, response, session);
      return;
    }

    if (path === '/meimaobing/v1/models') {
      if (request.method !== 'GET') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'GET' },
        });
        return;
      }
      if (!(await requireSession(request, response))) return;
      sendJson(response, 200, {
        object: 'list',
        data: config.models.map((id) => ({
          id,
          object: 'model',
          owned_by: 'meimaobing',
        })),
      });
      return;
    }

    const brokerPath = path.replace(/^\/meimaobing/, '');
    if (IMAGE_PATHS.has(brokerPath)) {
      if (request.method !== 'POST') {
        sendError(response, 405, 'METHOD_NOT_ALLOWED', config, {
          headers: { Allow: 'POST' },
        });
        return;
      }
      if (requestUrl.search || requestUrl.hash) {
        sendError(response, 400, 'INVALID_IMAGE_REQUEST', config);
        return;
      }
      const session = await requireSession(request, response);
      if (session) await proxyImageRequest(request, response, session, brokerPath);
      return;
    }

    sendError(response, 404, 'NOT_FOUND', config);
  });
}

export function startMeimaobingImageGateway(options = {}) {
  const config = options.config || readGatewayConfig();
  const server = createMeimaobingImageGateway({ ...options, config });
  server.listen(config.port);
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startMeimaobingImageGateway();
}
