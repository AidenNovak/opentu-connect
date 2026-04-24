function isRootPathname(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html';
}

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
