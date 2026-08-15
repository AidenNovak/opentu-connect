import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawnixState } from '../hooks/use-drawnix';
import {
  openMeimaobingAccountSettings,
  SETTINGS_PROVIDER_NAV_EVENT,
} from './provider-settings-navigation';

describe('openMeimaobingAccountSettings', () => {
  afterEach(() => {
    delete (
      window as typeof window & {
        __aituPendingProviderNavigationIntent?: unknown;
      }
    ).__aituPendingProviderNavigationIntent;
  });

  it('opens settings with the Meimaobing account selected', () => {
    const setAppState = vi.fn();
    const onNavigate = vi.fn();
    window.addEventListener(SETTINGS_PROVIDER_NAV_EVENT, onNavigate);

    openMeimaobingAccountSettings(setAppState);

    expect(
      (
        window as typeof window & {
          __aituPendingProviderNavigationIntent?: unknown;
        }
      ).__aituPendingProviderNavigationIntent
    ).toEqual({ action: 'select', profileId: 'meimaobing-account' });
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { action: 'select', profileId: 'meimaobing-account' },
      })
    );

    const update = setAppState.mock.calls[0]?.[0] as (
      state: DrawnixState
    ) => DrawnixState;
    expect(update({} as DrawnixState)).toMatchObject({ openSettings: true });

    window.removeEventListener(SETTINGS_PROVIDER_NAV_EVENT, onNavigate);
  });
});
