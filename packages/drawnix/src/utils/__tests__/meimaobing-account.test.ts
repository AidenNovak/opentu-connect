import { describe, expect, it, vi } from 'vitest';
import {
  createMeimaobingAccount,
  ensureMeimaobingImageRouteReady,
  getMeimaobingGatewayPaths,
  getMissingInvocationCredentialsError,
  requireMeimaobingImageAccount,
  type MeimaobingGatewayPaths,
} from '../meimaobing-account';

const gatewayPaths: MeimaobingGatewayPaths = {
  apiBaseUrl: 'https://drawnix.example.test/meimaobing/v1',
  accountUrl: 'https://drawnix.example.test/meimaobing/account',
  loginUrl: 'https://drawnix.example.test/auth/meimaobing/login',
  logoutUrl: 'https://drawnix.example.test/auth/meimaobing/logout',
};

describe('MeimaobingAccount', () => {
  it('calls the browser fetch implementation without rebinding its receiver', async () => {
    const nativeLikeFetch = vi.fn(function (
      this: unknown,
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) {
      if (this !== undefined) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            authenticated: true,
            account: {
              subject: 'opaque-subject-that-must-not-reach-the-ui',
              display_name: '测试昵称',
              email: 'manual-account@example.test',
            },
            wallet: { available_microusd: 1_000_000 },
          })
        )
      );
    });
    vi.stubGlobal('fetch', nativeLikeFetch);

    try {
      const account = createMeimaobingAccount({
        getGatewayPaths: () => gatewayPaths,
      });

      await expect(account.refresh()).resolves.toMatchObject({
        status: 'ready',
        authenticated: true,
        account: {
          displayName: '测试昵称',
          email: 'manual-account@example.test',
        },
      });
      expect(nativeLikeFetch).toHaveBeenCalledWith(gatewayPaths.accountUrl, {
        credentials: 'include',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats an expired gateway session as a sign-in state', async () => {
    const fetcher: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'SIGN_IN_REQUIRED' } }), {
        status: 401,
      })
    );
    const account = createMeimaobingAccount({
      fetcher,
      getGatewayPaths: () => gatewayPaths,
    });

    await expect(account.refresh()).resolves.toMatchObject({
      status: 'signed-out',
      authenticated: false,
      errorCode: 'SIGN_IN_REQUIRED',
    });
    expect(fetcher).toHaveBeenCalledWith(gatewayPaths.accountUrl, {
      credentials: 'include',
    });
  });

  it('redacts an unexpected gateway failure as an unavailable account service', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: 'GATEWAY_NOT_CONFIGURED' } }),
        { status: 503 }
      );
    const account = createMeimaobingAccount({
      fetcher,
      getGatewayPaths: () => gatewayPaths,
    });

    await expect(account.refresh()).resolves.toMatchObject({
      status: 'unavailable',
      authenticated: false,
      errorCode: 'ACCOUNT_UNAVAILABLE',
    });
  });

  it('starts OIDC with an internal return path only', () => {
    const navigate = vi.fn();
    const account = createMeimaobingAccount({
      getGatewayPaths: () => gatewayPaths,
      navigate,
    });

    const destination = account.beginSignIn('https://attacker.example.test');

    expect(destination).toBe(
      'https://drawnix.example.test/auth/meimaobing/login?return_to=%2F'
    );
    expect(navigate).toHaveBeenCalledWith(destination);
  });

  it('turns an unavailable account snapshot into an account error', async () => {
    await expect(
      requireMeimaobingImageAccount({
        refresh: async () => ({
          status: 'unavailable',
          authenticated: false,
          account: null,
          wallet: null,
          topUpUrl: null,
          errorCode: 'ACCOUNT_UNAVAILABLE',
        }),
      })
    ).rejects.toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
      message: 'Meimaobing 账户服务暂不可用，请稍后重试',
    });
  });

  it('rejects a gateway API base on another origin', () => {
    expect(
      getMeimaobingGatewayPaths('https://api.example.test/meimaobing/v1')
    ).toBeNull();
  });

  it('rejects a cookie-less custom Meimaobing URL without an API key', async () => {
    await expect(
      ensureMeimaobingImageRouteReady({
        profileId: 'meimaobing-account',
        apiKey: '',
        baseUrl: 'https://custom.example.test/v1',
      })
    ).rejects.toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });
  });

  it('skips login when a custom Meimaobing URL already has an API key', async () => {
    const refresh = vi.fn(async () => ({
      status: 'signed-out' as const,
      authenticated: false,
      account: null,
      wallet: null,
      topUpUrl: null,
      errorCode: 'SIGN_IN_REQUIRED' as const,
    }));

    await expect(
      ensureMeimaobingImageRouteReady(
        {
          profileId: 'meimaobing-account',
          apiKey: 'sk-user',
          baseUrl: 'https://custom.example.test/v1',
        },
        { refresh }
      )
    ).resolves.toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still requires login for the same-origin gateway when an API key is stored', async () => {
    await expect(
      ensureMeimaobingImageRouteReady(
        {
          profileId: 'meimaobing-account',
          apiKey: 'sk-user',
          baseUrl: '/meimaobing/v1',
        },
        {
          refresh: async () => ({
            status: 'signed-out',
            authenticated: false,
            account: null,
            wallet: null,
            topUpUrl: null,
            errorCode: 'SIGN_IN_REQUIRED',
          }),
        }
      )
    ).rejects.toMatchObject({
      code: 'SIGN_IN_REQUIRED',
    });
  });

  it('requires login for a cookie-session Meimaobing route', async () => {
    await expect(
      ensureMeimaobingImageRouteReady(
        {
          profileId: 'meimaobing-account',
          apiKey: '',
          baseUrl: '/meimaobing/v1',
        },
        {
          refresh: async () => ({
            status: 'signed-out',
            authenticated: false,
            account: null,
            wallet: null,
            topUpUrl: null,
            errorCode: 'SIGN_IN_REQUIRED',
          }),
        }
      )
    ).rejects.toMatchObject({
      code: 'SIGN_IN_REQUIRED',
    });
  });

  it('describes a Meimaobing credential gap without calling it a missing API key', () => {
    expect(
      getMissingInvocationCredentialsError({
        profileId: 'meimaobing-account',
        baseUrl: '/meimaobing/v1',
      })
    ).toEqual({
      code: 'MEIMAOBING_ACCOUNT_NOT_READY',
      message: '请先在设置中登录 Meimaobing 账户',
    });
    expect(
      getMissingInvocationCredentialsError({
        profileId: 'legacy-default',
        baseUrl: 'https://api.tu-zi.com/v1',
      })
    ).toEqual({
      code: 'NO_API_KEY',
      message: '未配置 API Key',
    });
  });
});
