import type { DrawnixState } from '../hooks/use-drawnix';
import { MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID } from './managed-image-provider-profiles';

export const SETTINGS_PROVIDER_NAV_EVENT = 'aitu:settings:provider-nav';

export type ProviderSettingsIntent =
  | { action: 'select'; profileId: string }
  | { action: 'create' };

type DrawnixStateSetter = (
  appState: DrawnixState | ((previous: DrawnixState) => DrawnixState)
) => void;

/**
 * Settings reads this intent when it opens, so the target works even though
 * its event listener is not mounted yet.
 */
export function openProviderSettings(
  setAppState: DrawnixStateSetter,
  intent: ProviderSettingsIntent
): void {
  if (typeof window !== 'undefined') {
    (
      window as typeof window & {
        __aituPendingProviderNavigationIntent?: ProviderSettingsIntent;
      }
    ).__aituPendingProviderNavigationIntent = intent;
    window.dispatchEvent(
      new CustomEvent<ProviderSettingsIntent>(SETTINGS_PROVIDER_NAV_EVENT, {
        detail: intent,
      })
    );
  }

  setAppState((previous) => ({ ...previous, openSettings: true }));
}

export function openMeimaobingAccountSettings(
  setAppState: DrawnixStateSetter
): void {
  openProviderSettings(setAppState, {
    action: 'select',
    profileId: MEIMAOBING_ACCOUNT_PROVIDER_PROFILE_ID,
  });
}
