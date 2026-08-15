import { LogIn, LogOut, RefreshCw, WalletCards } from 'lucide-react';
import { HoverTip } from '../shared/hover';
import type { MeimaobingAccountSnapshot } from '../../utils/meimaobing-account';
import { usesMeimaobingCookieSession } from '../../utils/managed-image-provider-profiles';

export function formatMicrousd(value: number | null | undefined): string {
  if (typeof value !== 'number') return '余额暂不可用';
  return `$${(value / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export function getMeimaobingAccountStatusLabel(
  snapshot: MeimaobingAccountSnapshot
): string {
  if (snapshot.status === 'loading') return '正在读取账户';
  if (snapshot.status === 'ready') return snapshot.account?.email || '已登录';
  if (snapshot.status === 'signed-out') {
    return snapshot.errorCode === 'SIGN_IN_REQUIRED'
      ? '登录状态已失效'
      : '尚未登录';
  }
  return '账户服务暂不可用';
}

export function canManageMeimaobingModels(
  snapshot: Pick<MeimaobingAccountSnapshot, 'authenticated'>,
  apiKey: string,
  baseUrl?: string | null
): boolean {
  if (snapshot.authenticated) {
    return true;
  }
  return (
    Boolean(apiKey.trim()) &&
    !usesMeimaobingCookieSession('meimaobing-account', baseUrl)
  );
}

export function getMeimaobingSettingsModelEmptyHint(
  snapshot: MeimaobingAccountSnapshot,
  hasApiKey: boolean,
  baseUrl?: string | null
): string {
  if (canManageMeimaobingModels(snapshot, hasApiKey ? 'present' : '', baseUrl)) {
    return '还没有已添加的模型';
  }
  if (snapshot.status === 'unavailable') {
    return 'Meimaobing 账户服务暂不可用，请稍后重试。';
  }
  return '默认同域登录后即可获取图片模型。自定义 API 地址时才使用填写的 API Key。';
}

interface MeimaobingAccountCardProps {
  snapshot: MeimaobingAccountSnapshot;
  isSignOutPending: boolean;
  onSignIn: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
}

export function MeimaobingAccountCard({
  snapshot,
  isSignOutPending,
  onSignIn,
  onRefresh,
  onSignOut,
}: MeimaobingAccountCardProps) {
  const isLoading = snapshot.status === 'loading';

  return (
    <div className="settings-dialog__field settings-dialog__field--full">
      <div className="settings-dialog__account-card">
        <div className="settings-dialog__account-header">
          <div className="settings-dialog__account-identity">
            <WalletCards size={20} aria-hidden="true" />
            <div>
              <strong>
                {snapshot.authenticated
                  ? snapshot.account?.displayName ||
                    snapshot.account?.email ||
                    'Meimaobing 账户'
                  : 'Meimaobing 账户'}
              </strong>
              <span aria-live="polite">
                {getMeimaobingAccountStatusLabel(snapshot)}
              </span>
            </div>
          </div>
          <HoverTip content="刷新账户状态" showArrow={false} theme="light">
            <button
              type="button"
              className="settings-dialog__account-icon-button"
              aria-label="刷新账户状态"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                size={16}
                className={
                  isLoading ? 'settings-dialog__button-spinner' : undefined
                }
              />
            </button>
          </HoverTip>
        </div>

        {snapshot.authenticated ? (
          <>
            <div className="settings-dialog__account-balance">
              <span>可用余额</span>
              <strong>{formatMicrousd(snapshot.wallet?.availableMicrousd)}</strong>
              {typeof snapshot.wallet?.reservedMicrousd === 'number' ? (
                <span>冻结 {formatMicrousd(snapshot.wallet.reservedMicrousd)}</span>
              ) : null}
            </div>
            <div className="settings-dialog__account-actions">
              {snapshot.topUpUrl ? (
                <a
                  className="settings-dialog__button settings-dialog__button--fetch"
                  href={snapshot.topUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WalletCards size={15} aria-hidden="true" />
                  充值
                </a>
              ) : null}
              <button
                type="button"
                className="settings-dialog__ghost-button"
                onClick={onSignOut}
                disabled={isSignOutPending}
              >
                <LogOut size={15} />
                {isSignOutPending ? '退出中' : '退出登录'}
              </button>
            </div>
          </>
        ) : snapshot.status === 'signed-out' || snapshot.status === 'unknown' ? (
          <button
            type="button"
            className="settings-dialog__button settings-dialog__button--fetch"
            onClick={onSignIn}
          >
            <LogIn size={15} />
            登录 Meimaobing
          </button>
        ) : snapshot.status === 'loading' ? (
          <div className="settings-dialog__account-unavailable">
            <span>正在读取账户</span>
          </div>
        ) : (
          <div className="settings-dialog__account-unavailable">
            <span>Meimaobing 账户服务暂不可用，请稍后重试</span>
            <button
              type="button"
              className="settings-dialog__ghost-button"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw size={15} />
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
