import { describe, expect, it } from 'vitest';

import {
  shouldMirrorToAppShellAliases,
  shouldUseAppShellStrategy,
} from './app-shell-routing';

describe('app-shell-routing', () => {
  it('treats only root shell paths as app shell aliases', () => {
    expect(shouldMirrorToAppShellAliases('/')).toBe(true);
    expect(shouldMirrorToAppShellAliases('/index.html')).toBe(true);
    expect(shouldMirrorToAppShellAliases('/user-manual/index.html')).toBe(
      false
    );
  });

  it('keeps SPA navigations on the app shell', () => {
    expect(shouldUseAppShellStrategy('navigate', '/workspace/abc')).toBe(true);
    expect(shouldUseAppShellStrategy('navigate', '/')).toBe(true);
    expect(shouldUseAppShellStrategy('navigate', '/index.html')).toBe(true);
  });

  it('does not treat explicit html documents as the app shell', () => {
    expect(
      shouldUseAppShellStrategy('navigate', '/user-manual/index.html')
    ).toBe(false);
    expect(
      shouldUseAppShellStrategy('navigate', '/advanced-settings.html')
    ).toBe(false);
  });
});

