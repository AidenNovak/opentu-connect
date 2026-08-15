import { describe, expect, it, vi } from 'vitest';
import {
  createMeimaobingAccount,
  getMeimaobingGatewayPaths,
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
});
