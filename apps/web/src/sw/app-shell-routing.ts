function isRootPathname(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html';
}

const ORIGIN_FIRST_PRELOAD_SUFFIXES = [
  '/version.json',
  '/manifest.json',
  '/sw.js',
  '/precache-manifest.json',
  '/idle-prefetch-manifest.json',
] as const;

export function shouldUseAppShellStrategy(
  requestMode: string,
  pathname: string
): boolean {
  // 只有根壳页走 SPA fallback；目录下的 index.html 属于真实静态文档。
  if (isRootPathname(pathname)) {
    return true;
  }

  return requestMode === 'navigate' && !pathname.endsWith('.html');
}

export function shouldMirrorToAppShellAliases(pathname: string): boolean {
  return isRootPathname(pathname);
}

export function shouldUseOriginFirstPreload(pathname: string): boolean {
  if (isRootPathname(pathname)) {
    return true;
  }

  return ORIGIN_FIRST_PRELOAD_SUFFIXES.some((suffix) =>
    pathname.endsWith(suffix)
  );
}

export function shouldUseCDNFirstPreload(pathname: string): boolean {
  return !shouldUseOriginFirstPreload(pathname);
}
