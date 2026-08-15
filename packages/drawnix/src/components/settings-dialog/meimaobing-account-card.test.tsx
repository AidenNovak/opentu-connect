import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeimaobingAccountSnapshot } from '../../utils/meimaobing-account';
import {
  canManageMeimaobingModels,
  formatMicrousd,
  getMeimaobingAccountStatusLabel,
  getMeimaobingSettingsModelEmptyHint,
  MeimaobingAccountCard,
} from './meimaobing-account-card';

const signedOut: MeimaobingAccountSnapshot = {
  status: 'signed-out',
  authenticated: false,
  account: null,
  wallet: null,
  topUpUrl: null,
  errorCode: null,
};

const ready: MeimaobingAccountSnapshot = {
  status: 'ready',
  authenticated: true,
  account: {
    displayName: '测试昵称',
    email: 'manual-account@example.test',
  },
  wallet: {
    currency: 'USD',
    availableMicrousd: 2_500_000,
    reservedMicrousd: 250_000,
  },
  topUpUrl: 'https://store.example.test/recharge',
  errorCode: null,
};

afterEach(() => {
  cleanup();
});

describe('Meimaobing account settings helpers', () => {
  it('formats wallet microusd for the account card', () => {
    expect(formatMicrousd(2_500_000)).toMatch(/^\$2[.,]50$/);
    expect(formatMicrousd(null)).toBe('余额暂不可用');
  });

  it('labels signed-out and ready snapshots', () => {
    expect(getMeimaobingAccountStatusLabel(signedOut)).toBe('尚未登录');
    expect(getMeimaobingAccountStatusLabel(ready)).toBe(
      'manual-account@example.test'
    );
  });

  it('treats login, or a custom-URL API key, as enough to manage models', () => {
    expect(canManageMeimaobingModels(signedOut, '', '/meimaobing/v1')).toBe(
      false
    );
    expect(
      canManageMeimaobingModels(signedOut, 'sk-user', '/meimaobing/v1')
    ).toBe(false);
    expect(
      canManageMeimaobingModels(
        signedOut,
        'sk-user',
        'https://custom.example.test/v1'
      )
    ).toBe(true);
    expect(canManageMeimaobingModels(ready, '', '/meimaobing/v1')).toBe(true);
  });

  it('asks for login before model discovery when the account is empty', () => {
    expect(getMeimaobingSettingsModelEmptyHint(signedOut, false)).toBe(
      '默认同域登录后即可获取图片模型。自定义 API 地址时才使用填写的 API Key。'
    );
  });
});

describe('MeimaobingAccountCard', () => {
  it('signs in from the default logged-out card', () => {
    const onSignIn = vi.fn();
    render(
      <MeimaobingAccountCard
        snapshot={signedOut}
        isSignOutPending={false}
        onSignIn={onSignIn}
        onRefresh={() => undefined}
        onSignOut={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '登录 Meimaobing' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('可用余额')).toBeNull();
  });

  it('shows balance, top-up, and sign-out after login', () => {
    const onSignOut = vi.fn();
    render(
      <MeimaobingAccountCard
        snapshot={ready}
        isSignOutPending={false}
        onSignIn={() => undefined}
        onRefresh={() => undefined}
        onSignOut={onSignOut}
      />
    );

    expect(screen.getByText('测试昵称')).toBeTruthy();
    expect(screen.getByText(/^\$2[.,]50$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '充值' }).getAttribute('href')).toBe(
      'https://store.example.test/recharge'
    );
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
