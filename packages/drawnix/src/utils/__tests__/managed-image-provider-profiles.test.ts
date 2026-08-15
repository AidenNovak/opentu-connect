import { describe, expect, it } from 'vitest';
import * as profiles from '../managed-image-provider-profiles';
import {
  createMeimaobingAccountProviderProfile,
  getConfiguredMeimaobingImageGatewayUrl,
  isMeimaobingAccountProfileId,
  MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID,
  MEIMAOBING_IMAGE_GATEWAY_API_PATH,
} from '../managed-image-provider-profiles';

describe('Meimaobing account provider profile', () => {
  it('uses the same-origin gateway path and no browser API key', () => {
    const profile = createMeimaobingAccountProviderProfile({ enabled: true });

    expect(profile.id).toBe(MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID);
    expect(profile.apiKey).toBe('');
    expect(profile.authType).toBe('custom');
    expect(profile.baseUrl).toBe(getConfiguredMeimaobingImageGatewayUrl());
    expect(profile.baseUrl.endsWith(MEIMAOBING_IMAGE_GATEWAY_API_PATH)).toBe(
      true
    );
    expect(profile.enabled).toBe(true);
  });

  it('does not treat NewAPI or TokenHub profile ids as the account profile', () => {
    expect(isMeimaobingAccountProfileId('meimaobing-account')).toBe(true);
    expect(isMeimaobingAccountProfileId('newapi-images')).toBe(false);
    expect(isMeimaobingAccountProfileId('tokenhub-images')).toBe(false);
  });

  it('does not export NewAPI aliases', () => {
    expect('NEWAPI_IMAGE_PROVIDER_PROFILE_ID' in profiles).toBe(false);
    expect('createNewApiImageProviderProfile' in profiles).toBe(false);
    expect('getConfiguredNewApiImageBridgeUrl' in profiles).toBe(false);
    expect('LEGACY_NEWAPI_IMAGE_PROVIDER_PROFILE_ID' in profiles).toBe(false);
    expect('TOKENHUB_IMAGE_PROVIDER_PROFILE_ID' in profiles).toBe(false);
    expect('createTokenHubImageProviderProfile' in profiles).toBe(false);
  });
});
