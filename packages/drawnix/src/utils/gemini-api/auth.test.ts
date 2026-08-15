import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiConfig } from './types';
import type { MeimaobingGatewayPaths } from '../meimaobing-account';

const requireMeimaobingImageAccountMock = vi.fn(async () => undefined);
const gatewayPaths: MeimaobingGatewayPaths = {
  apiBaseUrl: 'https://app.example.test/meimaobing/v1',
  accountUrl: 'https://app.example.test/meimaobing/account',
  loginUrl: 'https://app.example.test/auth/meimaobing/login',
  logoutUrl: 'https://app.example.test/auth/meimaobing/logout',
};
const getMeimaobingGatewayPathsMock = vi.fn<
  () => MeimaobingGatewayPaths | null
>(() => gatewayPaths);
const geminiSettingsGetMock = vi.fn(() => ({ apiKey: 'legacy-key' }));

vi.mock('../settings-manager', () => ({
  geminiSettings: {
    get: geminiSettingsGetMock,
    update: vi.fn(),
  },
}));

vi.mock('../meimaobing-account', () => ({
  getMeimaobingGatewayPaths: getMeimaobingGatewayPathsMock,
  requireMeimaobingImageAccount: requireMeimaobingImageAccountMock,
  MeimaobingImageGatewayError: class MeimaobingImageGatewayError extends Error {
    readonly code: string;

    constructor(code: string) {
      super('Meimaobing 账户服务暂不可用，请稍后重试');
      this.name = 'MeimaobingImageGatewayError';
      this.code = code;
    }
  },
}));

describe('validateAndEnsureConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMeimaobingGatewayPathsMock.mockReturnValue(gatewayPaths);
  });

  it('checks the Meimaobing account instead of asking for an API key', async () => {
    const { validateAndEnsureConfig } = await import('./auth');
    const config: GeminiConfig = {
      apiKey: '',
      baseUrl: 'https://app.example.test/meimaobing/v1',
      provider: {
        profileId: 'meimaobing-account',
        profileName: 'Meimaobing 图片账户',
        providerType: 'openai-compatible',
        baseUrl: 'https://app.example.test/meimaobing/v1',
        apiKey: '',
        authType: 'custom',
      },
    };

    await expect(validateAndEnsureConfig(config)).resolves.toBe(config);
    expect(getMeimaobingGatewayPathsMock).toHaveBeenCalledWith(config.baseUrl);
    expect(requireMeimaobingImageAccountMock).toHaveBeenCalledTimes(1);
    expect(geminiSettingsGetMock).not.toHaveBeenCalled();
  });

  it('normalizes a non-same-origin managed route to an account error', async () => {
    const { validateAndEnsureConfig } = await import('./auth');
    getMeimaobingGatewayPathsMock.mockReturnValue(null);

    await expect(
      validateAndEnsureConfig({
        apiKey: '',
        baseUrl: 'https://outside.example.test/v1',
        provider: {
          profileId: 'meimaobing-account',
          profileName: 'Meimaobing 图片账户',
          providerType: 'openai-compatible',
          baseUrl: 'https://outside.example.test/v1',
          apiKey: '',
          authType: 'custom',
        },
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });

    expect(requireMeimaobingImageAccountMock).not.toHaveBeenCalled();
    expect(geminiSettingsGetMock).not.toHaveBeenCalled();
  });

  it('recognizes the reserved same-origin route without a provider snapshot', async () => {
    const { validateAndEnsureConfig } = await import('./auth');

    await expect(
      validateAndEnsureConfig({
        apiKey: '',
        baseUrl: 'https://app.example.test/meimaobing/v1',
      })
    ).resolves.toMatchObject({
      baseUrl: 'https://app.example.test/meimaobing/v1',
    });

    expect(requireMeimaobingImageAccountMock).toHaveBeenCalledTimes(1);
    expect(geminiSettingsGetMock).not.toHaveBeenCalled();
  });
});
