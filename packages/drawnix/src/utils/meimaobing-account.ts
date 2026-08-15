import {
  getConfiguredMeimaobingImageGatewayUrl,
  MEIMAOBING_IMAGE_GATEWAY_API_PATH,
} from './managed-image-provider-profiles';

export type MeimaobingAccountStatus =
  | 'unknown'
  | 'loading'
  | 'signed-out'
  | 'ready'
  | 'unavailable';

export interface MeimaobingAccountSnapshot {
  status: MeimaobingAccountStatus;
  authenticated: boolean;
  account: {
    displayName: string | null;
    email: string | null;
  } | null;
  wallet: {
    currency: 'USD';
    availableMicrousd: number | null;
    reservedMicrousd: number | null;
  } | null;
  topUpUrl: string | null;
  errorCode: string | null;
}

export interface MeimaobingGatewayPaths {
  apiBaseUrl: string;
  accountUrl: string;
  loginUrl: string;
  logoutUrl: string;
}

export type MeimaobingGatewayErrorCode =
  | 'SIGN_IN_REQUIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'ACCOUNT_UNAVAILABLE'
  | 'REQUEST_PENDING'
  | 'IMAGE_REQUEST_REJECTED';

function isGatewayErrorCode(value: unknown): value is MeimaobingGatewayErrorCode {
  return (
    value === 'SIGN_IN_REQUIRED' ||
    value === 'INSUFFICIENT_BALANCE' ||
    value === 'ACCOUNT_UNAVAILABLE' ||
    value === 'REQUEST_PENDING' ||
    value === 'IMAGE_REQUEST_REJECTED'
  );
}

const EMPTY_SNAPSHOT: MeimaobingAccountSnapshot = {
  status: 'unknown',
  authenticated: false,
  account: null,
  wallet: null,
  topUpUrl: null,
  errorCode: null,
};

const GATEWAY_ERROR_MESSAGES: Record<MeimaobingGatewayErrorCode, string> = {
  SIGN_IN_REQUIRED: '请先在设置中登录 Meimaobing 账户',
  INSUFFICIENT_BALANCE: 'Meimaobing 账户余额不足，请充值后重试',
  ACCOUNT_UNAVAILABLE: 'Meimaobing 账户服务暂不可用，请稍后重试',
  REQUEST_PENDING: '该图片请求正在处理中，请勿重复提交',
  IMAGE_REQUEST_REJECTED: '图片请求未被 Meimaobing 账户接受',
};

function currentBrowserOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin;
  return origin && origin !== 'null' ? origin : null;
}

function isSafeTopUpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeMicrousd(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function normalizeAccountSnapshot(payload: unknown): MeimaobingAccountSnapshot {
  const value = payload as {
    authenticated?: unknown;
    account?: {
      subject?: unknown;
      display_name?: unknown;
      email?: unknown;
    };
    wallet?: {
      currency?: unknown;
      available_microusd?: unknown;
      reserved_microusd?: unknown;
    };
    top_up_url?: unknown;
  };

  if (value?.authenticated !== true) {
    return {
      ...EMPTY_SNAPSHOT,
      status: 'signed-out',
    };
  }

  const account = value.account;
  const wallet = value.wallet;
  return {
    status: 'ready',
    authenticated: true,
    // The UI never receives or renders the opaque OIDC `sub`; it is an
    // internal wallet key only. The login email is the customer identity.
    account:
      account && typeof account.email === 'string' && account.email.trim()
        ? {
            displayName:
              typeof account.display_name === 'string' && account.display_name.trim()
                ? account.display_name.trim()
                : null,
            email: account.email.trim().toLowerCase(),
          }
        : null,
    wallet:
      wallet && typeof wallet === 'object'
        ? {
            currency: 'USD',
            availableMicrousd: normalizeMicrousd(wallet.available_microusd),
            reservedMicrousd: normalizeMicrousd(wallet.reserved_microusd),
          }
        : null,
    topUpUrl: isSafeTopUpUrl(value.top_up_url) ? value.top_up_url : null,
    errorCode: null,
  };
}

async function readGatewayErrorCode(response: Response): Promise<string | null> {
  const payload = await response.json().catch(() => null);
  const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
  return isGatewayErrorCode(code) ? code : null;
}

function cloneSnapshot(
  snapshot: MeimaobingAccountSnapshot
): MeimaobingAccountSnapshot {
  return {
    ...snapshot,
    account: snapshot.account ? { ...snapshot.account } : null,
    wallet: snapshot.wallet ? { ...snapshot.wallet } : null,
  };
}

export function getMeimaobingGatewayPaths(
  configuredApiBaseUrl = getConfiguredMeimaobingImageGatewayUrl()
): MeimaobingGatewayPaths | null {
  const browserOrigin = currentBrowserOrigin();
  if (!configuredApiBaseUrl || !browserOrigin) return null;

  try {
    const apiBaseUrl = new URL(configuredApiBaseUrl, browserOrigin);
    if (
      apiBaseUrl.origin !== browserOrigin ||
      apiBaseUrl.pathname.replace(/\/+$/, '') !== MEIMAOBING_IMAGE_GATEWAY_API_PATH ||
      apiBaseUrl.search ||
      apiBaseUrl.hash
    ) {
      return null;
    }

    return {
      apiBaseUrl: apiBaseUrl.toString().replace(/\/+$/, ''),
      accountUrl: new URL('/meimaobing/account', browserOrigin).toString(),
      loginUrl: new URL('/auth/meimaobing/login', browserOrigin).toString(),
      logoutUrl: new URL('/auth/meimaobing/logout', browserOrigin).toString(),
    };
  } catch {
    return null;
  }
}

export function normalizeMeimaobingReturnTo(
  value: unknown,
  fallback = '/'
): string {
  const browserOrigin = currentBrowserOrigin();
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    !browserOrigin
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(value, browserOrigin);
    return resolved.origin === browserOrigin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export class MeimaobingImageGatewayError extends Error {
  readonly code: MeimaobingGatewayErrorCode;
  readonly topUpUrl: string | null;

  constructor(code: MeimaobingGatewayErrorCode, topUpUrl: string | null = null) {
    super(GATEWAY_ERROR_MESSAGES[code]);
    this.name = 'MeimaobingImageGatewayError';
    this.code = code;
    this.topUpUrl = topUpUrl;
  }
}

export function getMeimaobingImageGatewayError(
  payload: unknown
): MeimaobingImageGatewayError | null {
  const error = (payload as {
    error?: { code?: unknown; top_up_url?: unknown };
  } | null)?.error;
  const code = error?.code;
  if (!isGatewayErrorCode(code)) {
    return null;
  }
  return new MeimaobingImageGatewayError(
    code,
    isSafeTopUpUrl(error?.top_up_url) ? error.top_up_url : null
  );
}

export function getMeimaobingAccountReadinessError(
  snapshot: MeimaobingAccountSnapshot
): MeimaobingImageGatewayError {
  if (snapshot.status === 'signed-out') {
    return new MeimaobingImageGatewayError('SIGN_IN_REQUIRED');
  }

  return new MeimaobingImageGatewayError(
    snapshot.errorCode && isGatewayErrorCode(snapshot.errorCode)
      ? snapshot.errorCode
      : 'ACCOUNT_UNAVAILABLE'
  );
}

export interface MeimaobingAccount {
  getCachedSnapshot(): MeimaobingAccountSnapshot;
  getSnapshot(): Promise<MeimaobingAccountSnapshot>;
  refresh(): Promise<MeimaobingAccountSnapshot>;
  beginSignIn(returnTo?: string): string | null;
  signOut(): Promise<MeimaobingAccountSnapshot>;
  subscribe(listener: (snapshot: MeimaobingAccountSnapshot) => void): () => void;
}

export interface CreateMeimaobingAccountOptions {
  fetcher?: typeof fetch;
  getGatewayPaths?: () => MeimaobingGatewayPaths | null;
  getCurrentPath?: () => string;
  navigate?: (url: string) => void;
}

class MeimaobingAccountStore implements MeimaobingAccount {
  private readonly fetcher: typeof fetch;
  private readonly getGatewayPaths: () => MeimaobingGatewayPaths | null;
  private readonly getCurrentPath: () => string;
  private readonly navigate: (url: string) => void;
  private readonly listeners = new Set<
    (snapshot: MeimaobingAccountSnapshot) => void
  >();
  private snapshot: MeimaobingAccountSnapshot;
  private pendingRefresh: Promise<MeimaobingAccountSnapshot> | null = null;

  constructor(options: CreateMeimaobingAccountOptions = {}) {
    this.fetcher = options.fetcher || ((input, init) => fetch(input, init));
    this.getGatewayPaths = options.getGatewayPaths || getMeimaobingGatewayPaths;
    this.getCurrentPath =
      options.getCurrentPath ||
      (() =>
        typeof window === 'undefined'
          ? '/'
          : `${window.location.pathname}${window.location.search}${window.location.hash}`);
    this.navigate =
      options.navigate ||
      ((url) => {
        window.location.assign(url);
      });
    this.snapshot = this.getGatewayPaths()
      ? cloneSnapshot(EMPTY_SNAPSHOT)
      : {
          ...EMPTY_SNAPSHOT,
          status: 'unavailable',
          errorCode: 'ACCOUNT_UNAVAILABLE',
        };
  }

  getCachedSnapshot(): MeimaobingAccountSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  getSnapshot(): Promise<MeimaobingAccountSnapshot> {
    return this.refresh();
  }

  subscribe(
    listener: (snapshot: MeimaobingAccountSnapshot) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  beginSignIn(returnTo = this.getCurrentPath()): string | null {
    const paths = this.getGatewayPaths();
    if (!paths) {
      this.setSnapshot({
        ...EMPTY_SNAPSHOT,
        status: 'unavailable',
        errorCode: 'ACCOUNT_UNAVAILABLE',
      });
      return null;
    }

    const loginUrl = new URL(paths.loginUrl);
    loginUrl.searchParams.set(
      'return_to',
      normalizeMeimaobingReturnTo(returnTo, '/')
    );
    const destination = loginUrl.toString();
    this.navigate(destination);
    return destination;
  }

  async refresh(): Promise<MeimaobingAccountSnapshot> {
    if (this.pendingRefresh) return this.pendingRefresh;
    const paths = this.getGatewayPaths();
    if (!paths) {
      this.setSnapshot({
        ...EMPTY_SNAPSHOT,
        status: 'unavailable',
        errorCode: 'ACCOUNT_UNAVAILABLE',
      });
      return this.getCachedSnapshot();
    }

    this.setSnapshot({
      ...this.snapshot,
      status: 'loading',
      errorCode: null,
    });
    this.pendingRefresh = this.fetcher(paths.accountUrl, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (response.status === 401) {
          this.setSnapshot({
            ...EMPTY_SNAPSHOT,
            status: 'signed-out',
            errorCode:
              (await readGatewayErrorCode(response)) || 'SIGN_IN_REQUIRED',
          });
          return this.getCachedSnapshot();
        }
        if (!response.ok) {
          this.setSnapshot({
            ...EMPTY_SNAPSHOT,
            status: 'unavailable',
            errorCode:
              (await readGatewayErrorCode(response)) || 'ACCOUNT_UNAVAILABLE',
          });
          return this.getCachedSnapshot();
        }

        this.setSnapshot(normalizeAccountSnapshot(await response.json()));
        return this.getCachedSnapshot();
      })
      .catch(() => {
        this.setSnapshot({
          ...EMPTY_SNAPSHOT,
          status: 'unavailable',
          errorCode: 'ACCOUNT_UNAVAILABLE',
        });
        return this.getCachedSnapshot();
      })
      .finally(() => {
        this.pendingRefresh = null;
      });

    return this.pendingRefresh;
  }

  async signOut(): Promise<MeimaobingAccountSnapshot> {
    const paths = this.getGatewayPaths();
    if (!paths) {
      this.setSnapshot({
        ...EMPTY_SNAPSHOT,
        status: 'unavailable',
        errorCode: 'ACCOUNT_UNAVAILABLE',
      });
      return this.getCachedSnapshot();
    }

    try {
      const response = await this.fetcher(paths.logoutUrl, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        this.setSnapshot({
          ...EMPTY_SNAPSHOT,
          status: 'unavailable',
          errorCode:
            (await readGatewayErrorCode(response)) || 'ACCOUNT_UNAVAILABLE',
        });
        return this.getCachedSnapshot();
      }
      this.setSnapshot({ ...EMPTY_SNAPSHOT, status: 'signed-out' });
      return this.getCachedSnapshot();
    } catch {
      this.setSnapshot({
        ...EMPTY_SNAPSHOT,
        status: 'unavailable',
        errorCode: 'ACCOUNT_UNAVAILABLE',
      });
      return this.getCachedSnapshot();
    }
  }

  private setSnapshot(snapshot: MeimaobingAccountSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    const nextSnapshot = this.getCachedSnapshot();
    this.listeners.forEach((listener) => listener(nextSnapshot));
  }
}

export function createMeimaobingAccount(
  options: CreateMeimaobingAccountOptions = {}
): MeimaobingAccount {
  return new MeimaobingAccountStore(options);
}

export const meimaobingAccount = createMeimaobingAccount();

/**
 * Confirm the browser session before a managed image request can create a
 * payable invocation. This keeps account failures out of the API-key flow.
 */
export async function requireMeimaobingImageAccount(
  account: Pick<MeimaobingAccount, 'refresh'> = meimaobingAccount
): Promise<MeimaobingAccountSnapshot> {
  const snapshot = await account.refresh();
  if (snapshot.authenticated && snapshot.status === 'ready') {
    return snapshot;
  }
  throw getMeimaobingAccountReadinessError(snapshot);
}
