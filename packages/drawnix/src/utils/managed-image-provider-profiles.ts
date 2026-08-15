import { ModelVendor, type ModelConfig } from '../constants/model-config';
import type {
  ProviderCapabilities,
  ProviderCatalog,
  ProviderProfile,
} from './settings-types';

export const TOKENHUB_IMAGE_PROVIDER_PROFILE_ID = 'tokenhub-images';
export const MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID = 'meimaobing-account';
export const TOKENHUB_IMAGE_PROVIDER_BASE_URL =
  'https://api.sg.aidenovak.com/v1';
export const MEIMAOBING_IMAGE_GATEWAY_API_PATH = '/meimaobing/v1';

const IMAGE_ONLY_CAPABILITIES: ProviderCapabilities = Object.freeze({
  supportsModelsEndpoint: true,
  supportsText: false,
  supportsImage: true,
  supportsVideo: false,
  supportsAudio: false,
  supportsTools: false,
});

function createImageModel(id: string, vendor: ModelVendor): ModelConfig {
  return {
    id,
    label: id,
    shortLabel: id,
    type: 'image',
    vendor,
    tags: ['managed-image-provider'],
  };
}

export const TOKENHUB_IMAGE_MODELS: readonly ModelConfig[] = Object.freeze([
  createImageModel('gemini-3.1-flash-lite-image', ModelVendor.GEMINI),
  createImageModel('gemini-3.1-flash-image', ModelVendor.GEMINI),
  createImageModel('gemini-3-pro-image', ModelVendor.GEMINI),
  createImageModel('gemini-2.5-flash-image', ModelVendor.GEMINI),
  createImageModel('gpt-image-2', ModelVendor.GPT),
  createImageModel('codex-gpt-image-2', ModelVendor.GPT),
]);

export const MEIMAOBING_ACCOUNT_IMAGE_MODELS: readonly ModelConfig[] =
  Object.freeze([
  createImageModel('gemini-3.1-flash-lite-image', ModelVendor.GEMINI),
  createImageModel('gemini-3.1-flash-image', ModelVendor.GEMINI),
  createImageModel('gemini-3-pro-image', ModelVendor.GEMINI),
  createImageModel('gemini-2.5-flash-image', ModelVendor.GEMINI),
  createImageModel('gpt-image-2', ModelVendor.GPT),
  createImageModel('codex-gpt-image-2', ModelVendor.GPT),
]);

function cloneModel(model: ModelConfig): ModelConfig {
  return {
    ...model,
    tags: model.tags ? [...model.tags] : undefined,
    imageDefaults: model.imageDefaults ? { ...model.imageDefaults } : undefined,
  };
}

function getBrowserOrigin(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const origin = window.location?.origin;
  return origin && origin !== 'null' ? origin : null;
}

/**
 * The account gateway must be served through the application's own origin so
 * an HttpOnly Meimaobing session can be used without a browser-held key. The
 * public route is a product contract, not a browser-configurable endpoint.
 */
export function getConfiguredMeimaobingImageGatewayUrl(): string {
  const browserOrigin = getBrowserOrigin();
  if (!browserOrigin) {
    return MEIMAOBING_IMAGE_GATEWAY_API_PATH;
  }

  return new URL(MEIMAOBING_IMAGE_GATEWAY_API_PATH, browserOrigin)
    .toString()
    .replace(/\/+$/, '');
}

export function isMeimaobingAccountProfileId(
  profileId?: string | null
): boolean {
  return (
    normalizeManagedImageProviderProfileId(profileId) ===
    MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID
  );
}

/**
 * Historical image tasks may outlive settings migration. Treat their retired
 * provider IDs as the account-backed route before any caller considers a
 * browser-held API key.
 */
export function normalizeManagedImageProviderProfileId(
  profileId?: string | null
): string | null | undefined {
  if (
    profileId === MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID ||
    profileId === TOKENHUB_IMAGE_PROVIDER_PROFILE_ID
  ) {
    return MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID;
  }

  return profileId;
}

export function isManagedImageProviderProfileId(
  profileId?: string | null
): boolean {
  return isMeimaobingAccountProfileId(profileId);
}

export function createTokenHubImageProviderProfile(
  profile?: Partial<ProviderProfile>
): ProviderProfile {
  const apiKey = typeof profile?.apiKey === 'string' ? profile.apiKey : '';
  const baseUrl = TOKENHUB_IMAGE_PROVIDER_BASE_URL;

  return {
    id: TOKENHUB_IMAGE_PROVIDER_PROFILE_ID,
    name: 'TokenHub Images',
    homepageUrl: 'https://api.sg.aidenovak.com/',
    providerType: 'openai-compatible',
    baseUrl,
    apiKey,
    authType: 'bearer',
    imageApiCompatibility: profile?.imageApiCompatibility || 'openai-gpt-image',
    preferAsyncImageEndpoint: false,
    enabled: profile?.enabled === true,
    capabilities: { ...IMAGE_ONLY_CAPABILITIES },
  };
}

export function createMeimaobingAccountProviderProfile(
  profile?: Partial<ProviderProfile>
): ProviderProfile {
  const baseUrl = getConfiguredMeimaobingImageGatewayUrl();

  return {
    id: MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID,
    name: 'Meimaobing 图片账户',
    iconUrl: '/meimaobing-logo.png',
    homepageUrl: 'https://meimaobing.ai/',
    providerType: 'openai-compatible',
    baseUrl,
    // This profile is authenticated by the HttpOnly Meimaobing browser session.
    apiKey: '',
    authType: 'custom',
    imageApiCompatibility: profile?.imageApiCompatibility || 'openai-gpt-image',
    preferAsyncImageEndpoint: false,
    enabled: profile?.enabled === true,
    capabilities: { ...IMAGE_ONLY_CAPABILITIES },
  };
}

function mergeKnownModels(
  existing: ModelConfig[] | undefined,
  knownModels: readonly ModelConfig[]
): ModelConfig[] {
  const knownIds = new Set(knownModels.map((model) => model.id));
  return [
    ...knownModels.map(cloneModel),
    ...(existing || [])
      .filter((model) => !knownIds.has(model.id))
      .map(cloneModel),
  ];
}

export function createManagedImageProviderCatalog(
  profile: ProviderProfile,
  knownModels: readonly ModelConfig[],
  existing?: ProviderCatalog
): ProviderCatalog {
  const discoveredModels = mergeKnownModels(
    existing?.discoveredModels,
    knownModels
  );
  const knownModelIds = new Set(discoveredModels.map((model) => model.id));
  const selectedModelIds = existing
    ? existing.selectedModelIds.filter((id) => knownModelIds.has(id))
    : knownModels.map((model) => model.id);

  return {
    profileId: profile.id,
    discoveredAt: existing?.discoveredAt ?? null,
    discoveredModels,
    selectedModelIds,
    sourceBaseUrl: profile.baseUrl || undefined,
    signature: existing?.signature,
    error: existing?.error ?? null,
  };
}
