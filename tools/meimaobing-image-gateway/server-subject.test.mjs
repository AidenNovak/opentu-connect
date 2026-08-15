import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalPrincipalSubject, isBearerTokenType } from './server.mjs';

function dexProductSubject(uuid) {
  const raw = Buffer.concat([
    Buffer.from([0x0a, 36]),
    Buffer.from(uuid, 'utf8'),
    Buffer.from([0x12, 5]),
    Buffer.from('local', 'utf8'),
  ]);
  return {
    uuid,
    base64url: raw.toString('base64url'),
    base64: raw.toString('base64'),
  };
}

test('passes a raw 36-byte UUID through unchanged', () => {
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assert.equal(canonicalPrincipalSubject(uuid), uuid);
});

test('unwraps the Dex protobuf subject used by Store and Super App', () => {
  const encoded = dexProductSubject('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(encoded.base64url.length, 60);
  assert.equal(canonicalPrincipalSubject(encoded.base64url), encoded.uuid);
  assert.equal(canonicalPrincipalSubject(encoded.base64), encoded.uuid);
});

test('unwraps another Dex product subject in either base64 form', () => {
  const encoded = dexProductSubject('9f8e7d6c-5b4a-3928-1706-f5e4d3c2b1a0');
  assert.equal(canonicalPrincipalSubject(encoded.base64url), encoded.uuid);
  assert.equal(canonicalPrincipalSubject(encoded.base64), encoded.uuid);
});

test('leaves an opaque non-Dex subject unchanged', () => {
  const opaque = 'not-a-dex-protobuf-subject-and-longer-than-thirty-six';
  assert.equal(canonicalPrincipalSubject(opaque), opaque);
});

test('accepts Dex token_type bearer in either RFC case', () => {
  assert.equal(isBearerTokenType(undefined), true);
  assert.equal(isBearerTokenType('Bearer'), true);
  assert.equal(isBearerTokenType('bearer'), true);
  assert.equal(isBearerTokenType('BEARER'), true);
  assert.equal(isBearerTokenType('mac'), false);
  assert.equal(isBearerTokenType(''), false);
});
