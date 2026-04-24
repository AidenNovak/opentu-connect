import { describe, expect, it } from 'vitest';

import {
  shouldUseCDNFirstPreload,
  shouldMirrorToAppShellAliases,
  shouldUseOriginFirstPreload,
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

  it('keeps only root shell and release metadata on origin-first preload', () => {
    expect(shouldUseOriginFirstPreload('/')).toBe(true);
    expect(shouldUseOriginFirstPreload('/index.html')).toBe(true);
    expect(shouldUseOriginFirstPreload('/version.json')).toBe(true);
    expect(shouldUseOriginFirstPreload('/manifest.json')).toBe(true);
    expect(shouldUseOriginFirstPreload('/sw.js')).toBe(true);
    expect(shouldUseOriginFirstPreload('/precache-manifest.json')).toBe(true);
    expect(shouldUseOriginFirstPreload('/idle-prefetch-manifest.json')).toBe(
      true
    );
  });

  it('prefers CDN for manifest-known static assets during preload', () => {
    expect(shouldUseCDNFirstPreload('/assets/index-abc123.js')).toBe(true);
    expect(shouldUseCDNFirstPreload('/icons/android-chrome-192x192.png')).toBe(
      true
    );
    expect(shouldUseCDNFirstPreload('/user-manual/index.html')).toBe(true);
  });
});
