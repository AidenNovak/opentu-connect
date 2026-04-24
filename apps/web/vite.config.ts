/// <reference types='vitest' />
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { visualizer } from 'rollup-plugin-visualizer';

// Read version from public/version.json
const versionPath = path.resolve(__dirname, 'public/version.json');
let appVersion = '0.0.0';

try {
  if (fs.existsSync(versionPath)) {
    const versionContent = fs.readFileSync(versionPath, 'utf-8');
    const versionJson = JSON.parse(versionContent);
    appVersion = versionJson.version || '0.0.0';
    console.log(`[Vite] Loaded version from version.json: ${appVersion}`);
  } else {
    console.warn('[Vite] version.json not found at', versionPath);
  }
} catch (e) {
  console.error('[Vite] Failed to read version.json', e);
}

const IDLE_PREFETCH_GROUPS = [
  'ai-chat',
  'tool-windows',
  'diagram-engines',
  'office-data',
  'external-skills',
  'runtime-static-assets',
  'offline-static-assets',
] as const;

const IDLE_PREFETCH_DEFAULTS = [
  'tool-windows',
  'runtime-static-assets',
] as const;

type IdlePrefetchGroup = (typeof IDLE_PREFETCH_GROUPS)[number];

type ManifestEntry = { url: string; revision: string };

const STATIC_SCAN_EXCLUDED_DIRS = new Set([
  'product_showcase',
  'help_tooltips',
  'sw-debug',
]);

const STATIC_SCAN_EXCLUDED_PATTERNS = [
  /stats\.html$/,
  /\.map$/,
  /precache-manifest\.json$/,
  /idle-prefetch-manifest\.json$/,
  /sw\.js$/,
  /sw-debug\.html$/,
  /changelog\.json$/,
  /version\.json$/,
];

const PRECACHE_EXTENSIONS = new Set(['.js', '.css', '.json', '.svg', '.ico']);
const POST_BOOT_PREFETCH_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.wasm',
  '.txt',
  '.md',
]);
const PRECACHE_ALWAYS_INCLUDE = new Set([
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
]);

function createRevision(fullPath: string): string {
  const content = fs.readFileSync(fullPath);
  return crypto
    .createHash('md5')
    .update(new Uint8Array(content))
    .digest('hex')
    .substring(0, 8);
}

function shouldExcludeStaticScanUrl(url: string): boolean {
  return STATIC_SCAN_EXCLUDED_PATTERNS.some((pattern) => pattern.test(url));
}

function isRuntimeStaticAssetUrl(url: string): boolean {
  // 仅覆盖构建产物中的运行时附属资源，避免把手册截图等大文件带进默认 idle 预取。
  return url.startsWith('/assets/');
}

function collectStaticEntries(
  outDir: string,
  shouldInclude: (url: string, ext: string) => boolean
): ManifestEntry[] {
  const manifest: ManifestEntry[] = [];

  function scanDir(dir: string, base = '') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(base, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!STATIC_SCAN_EXCLUDED_DIRS.has(entry.name)) {
          scanDir(fullPath, relativePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const url = '/' + relativePath;

      if (shouldExcludeStaticScanUrl(url) || !shouldInclude(url, ext)) {
        continue;
      }

      manifest.push({
        url,
        revision: createRevision(fullPath),
      });
    }
  }

  scanDir(outDir);
  manifest.sort((a, b) => a.url.localeCompare(b.url));
  return manifest;
}

function normalizePathForChunking(id: string): string {
  return id.replace(/\\/g, '/');
}

function resolveIdlePrefetchGroup(id: string): IdlePrefetchGroup | undefined {
  const normalizedId = normalizePathForChunking(id);

  if (
    normalizedId.includes('/packages/drawnix/src/components/startup/DrawnixDeferredRuntime.tsx') ||
    normalizedId.includes('/packages/drawnix/src/components/startup/DeferredMediaLibraryModal.tsx') ||
    normalizedId.includes('/packages/drawnix/src/components/startup/DeferredSyncSettings.tsx') ||
    normalizedId.includes('/packages/drawnix/src/services/asset-integration-service') ||
    normalizedId.includes('/packages/drawnix/src/services/font-manager-service') ||
    normalizedId.includes('/packages/drawnix/src/utils/model-pricing-service') ||
    normalizedId.includes('/packages/drawnix/src/hooks/useTaskStorage') ||
    normalizedId.includes('/packages/drawnix/src/hooks/useTaskExecutor') ||
    normalizedId.includes('/packages/drawnix/src/hooks/useAutoInsertToCanvas') ||
    normalizedId.includes('/packages/drawnix/src/hooks/useImageGenerationAnchorSync') ||
    normalizedId.includes('/packages/drawnix/src/hooks/useBeforeUnload') ||
    normalizedId.includes('/packages/drawnix/src/hooks/useProviderProfiles') ||
    normalizedId.includes('/packages/drawnix/src/components/toolbox-drawer/') ||
    normalizedId.includes('/packages/drawnix/src/components/project-drawer/') ||
    normalizedId.includes('/packages/drawnix/src/components/toolbar/minimized-tools-bar/') ||
    normalizedId.includes('/packages/drawnix/src/services/tool-window-service') ||
    normalizedId.includes('/packages/drawnix/src/tools/') ||
    normalizedId.includes('/packages/drawnix/src/components/backup-restore/') ||
    normalizedId.includes('/packages/drawnix/src/components/performance-panel/') ||
    normalizedId.includes('/packages/drawnix/src/components/version-update/') ||
    normalizedId.includes('/packages/drawnix/src/components/command-palette/') ||
    normalizedId.includes('/packages/drawnix/src/components/canvas-search/')
  ) {
    return 'tool-windows';
  }

  if (
    normalizedId.includes('/packages/drawnix/src/generated/external-skills-bundle.json')
  ) {
    return 'external-skills';
  }

  return undefined;
}

/**
 * Vite 插件：生成 precache-manifest.json
 * 在构建完成后扫描输出目录，生成需要预缓存的静态资源清单
 */
function precacheManifestPlugin(): Plugin {
  return {
    name: 'precache-manifest',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const outDir = path.resolve(__dirname, '../../dist/apps/web');
        const manifest = collectStaticEntries(
          outDir,
          (url, ext) =>
            PRECACHE_ALWAYS_INCLUDE.has(url) ||
            (ext !== '.html' && PRECACHE_EXTENSIONS.has(ext))
        );

        // 写入 manifest 文件
        const manifestPath = path.join(outDir, 'precache-manifest.json');
        const manifestContent = {
          version: appVersion,
          timestamp: new Date().toISOString(),
          files: manifest,
        };

        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifestContent, null, 2)
        );
        console.log(
          `[Precache] Generated manifest with ${manifest.length} files`
        );
      },
    },
  };
}

function idlePrefetchManifestPlugin(): Plugin {
  return {
    name: 'idle-prefetch-manifest',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const outDir = path.resolve(__dirname, '../../dist/apps/web');
        const assetsDir = path.join(outDir, 'assets');
        const precacheManifestPath = path.join(outDir, 'precache-manifest.json');
        const groups = Object.fromEntries(
          IDLE_PREFETCH_GROUPS.map((group) => [
            group,
            [] as Array<{ url: string; revision: string }>,
          ])
        ) as Record<
          IdlePrefetchGroup,
          Array<{ url: string; revision: string }>
        >;
        const precachedUrls = new Set<string>();

        if (fs.existsSync(precacheManifestPath)) {
          try {
            const precacheManifest = JSON.parse(
              fs.readFileSync(precacheManifestPath, 'utf8')
            ) as { files?: Array<{ url?: string }> };
            for (const entry of precacheManifest.files || []) {
              if (typeof entry.url === 'string' && entry.url.length > 0) {
                precachedUrls.add(entry.url);
              }
            }
          } catch (error) {
            console.warn(
              '[IdlePrefetch] Failed to read precache-manifest.json:',
              error
            );
          }
        }

        if (fs.existsSync(assetsDir)) {
          const files = fs.readdirSync(assetsDir);
          for (const group of IDLE_PREFETCH_GROUPS) {
            if (group === 'offline-static-assets') {
              continue;
            }
            const groupFiles = files.filter((file) => {
              const lower = file.toLowerCase();
              return (
                lower.startsWith(`${group}-`) &&
                (lower.endsWith('.js') || lower.endsWith('.css'))
              );
            });

            for (const file of groupFiles) {
              const fullPath = path.join(assetsDir, file);
              const content = fs.readFileSync(fullPath);
              const revision = crypto
                .createHash('md5')
                .update(new Uint8Array(content))
                .digest('hex')
                .substring(0, 8);
              groups[group].push({
                url: `/assets/${file}`,
                revision,
              });
            }
          }
        }

        groups['runtime-static-assets'] = collectStaticEntries(
          outDir,
          (url, ext) =>
            !precachedUrls.has(url) &&
            ext !== '.html' &&
            POST_BOOT_PREFETCH_EXTENSIONS.has(ext) &&
            isRuntimeStaticAssetUrl(url)
        );

        const runtimeStaticUrls = new Set(
          groups['runtime-static-assets'].map((entry) => entry.url)
        );

        groups['offline-static-assets'] = collectStaticEntries(
          outDir,
          (url, ext) =>
            !precachedUrls.has(url) &&
            !runtimeStaticUrls.has(url) &&
            ext !== '.html' &&
            POST_BOOT_PREFETCH_EXTENSIONS.has(ext)
        );

        const manifestPath = path.join(outDir, 'idle-prefetch-manifest.json');
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(
            {
              version: appVersion,
              timestamp: new Date().toISOString(),
              defaults: [...IDLE_PREFETCH_DEFAULTS],
              groups,
            },
            null,
            2
          )
        );
        console.log('[IdlePrefetch] Generated idle-prefetch-manifest.json');
      },
    },
  };
}

function deferEntryAssetsPlugin(): Plugin {
  return {
    name: 'defer-entry-assets',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const outDir = path.resolve(__dirname, '../../dist/apps/web');
        const indexHtmlPath = path.join(outDir, 'index.html');

        if (!fs.existsSync(indexHtmlPath)) {
          return;
        }

        const html = fs.readFileSync(indexHtmlPath, 'utf8');
        const deferredTags: string[] = [];
        const assetTagPattern =
          /^[ \t]*(<script\b[^>]*type="module"[^>]*src="\.\/assets\/[^"]+"[^>]*><\/script>|<link\b[^>]*rel="stylesheet"[^>]*href="\.\/assets\/[^"]+"[^>]*>)\s*$/gm;

        const strippedHtml = html.replace(assetTagPattern, (match, tag) => {
          deferredTags.push(tag.trim());
          return '';
        });

        if (deferredTags.length === 0) {
          return;
        }

        const injection = `  ${deferredTags.join('\n  ')}\n`;
        const nextHtml = strippedHtml.replace('</body>', `${injection}</body>`);

        fs.writeFileSync(indexHtmlPath, nextHtml);
        console.log(
          `[EntryAssets] Deferred ${deferredTags.length} entry asset tag(s) to body end`
        );
      },
    },
  };
}

function rewriteEntryAssetsToCDNPlugin(): Plugin {
  return {
    name: 'rewrite-entry-assets-to-cdn',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const outDir = path.resolve(__dirname, '../../dist/apps/web');
        const indexHtmlPath = path.join(outDir, 'index.html');

        if (!fs.existsSync(indexHtmlPath)) {
          return;
        }

        const html = fs.readFileSync(indexHtmlPath, 'utf8');
        const cdnBaseUrl = `https://cdn.jsdelivr.net/npm/aitu-app@${appVersion}`;
        let rewrittenCount = 0;

        const rewriteAssetUrl = (localPath: string) => {
          const [pathname, suffix = ''] = localPath.split(/([?#].*)/, 2);
          return `${cdnBaseUrl}/${pathname.replace(/^\.\//, '')}${suffix}`;
        };

        const rewriteManagedLinkTag = (
          beforeHref: string,
          localHref: string,
          afterHref: string
        ) => {
          const hasSelfClosingSlash = /\/\s*$/.test(afterHref);
          const normalizedAfterHref = afterHref.replace(/\/\s*$/, '');
          rewrittenCount += 1;
          return `<link${beforeHref}href="${rewriteAssetUrl(
            localHref
          )}" data-local-href="${localHref}" data-cdn-fallback-managed="1"${normalizedAfterHref} onerror="window.__OPENTU_BOOT_ASSET_FALLBACK__&&window.__OPENTU_BOOT_ASSET_FALLBACK__(this)"${
            hasSelfClosingSlash ? ' /' : ''
          }>`;
        };

        let nextHtml = html.replace(
          /<script\b([^>]*\btype="module"[^>]*)\bsrc="(\.\/assets\/[^"]+)"([^>]*)><\/script>/g,
          (_match, beforeSrc, localSrc, afterSrc) => {
            rewrittenCount += 1;
            return `<script${beforeSrc}src="${rewriteAssetUrl(
              localSrc
            )}" data-local-src="${localSrc}" data-cdn-fallback-managed="1"${afterSrc} onerror="window.__OPENTU_BOOT_ASSET_FALLBACK__&&window.__OPENTU_BOOT_ASSET_FALLBACK__(this)"></script>`;
          }
        );

        nextHtml = nextHtml.replace(
          /<link\b([^>]*\brel="stylesheet"[^>]*)\bhref="(\.\/assets\/[^"]+)"([^>]*)>/g,
          (_match, beforeHref, localHref, afterHref) =>
            rewriteManagedLinkTag(beforeHref, localHref, afterHref)
        );

        nextHtml = nextHtml.replace(
          /<link\b([^>]*\brel="(?:manifest|icon|apple-touch-icon)"[^>]*)\bhref="(\.\/[^"]+)"([^>]*)>/g,
          (_match, beforeHref, localHref, afterHref) =>
            rewriteManagedLinkTag(beforeHref, localHref, afterHref)
        );

        if (rewrittenCount === 0) {
          return;
        }

        fs.writeFileSync(indexHtmlPath, nextHtml);
        console.log(
          `[EntryAssets] Rewrote ${rewrittenCount} entry asset tag(s) to prefer CDN`
        );
      },
    },
  };
}

function rewriteManifestAssetsToCDNPlugin(): Plugin {
  return {
    name: 'rewrite-manifest-assets-to-cdn',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const outDir = path.resolve(__dirname, '../../dist/apps/web');
        const manifestPath = path.join(outDir, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
          return;
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const cdnBaseUrl = `https://cdn.jsdelivr.net/npm/aitu-app@${appVersion}`;
        let rewrittenCount = 0;

        const rewriteManifestAssetUrl = (assetUrl: string) => {
          if (
            typeof assetUrl !== 'string' ||
            !assetUrl ||
            /^https?:\/\//.test(assetUrl)
          ) {
            return assetUrl;
          }

          rewrittenCount += 1;
          return `${cdnBaseUrl}/${assetUrl.replace(/^\.\//, '')}`;
        };

        if (Array.isArray(manifest.icons)) {
          manifest.icons = manifest.icons.map((icon: Record<string, unknown>) => ({
            ...icon,
            src: rewriteManifestAssetUrl(String(icon.src || '')),
          }));
        }

        if (Array.isArray(manifest.shortcuts)) {
          manifest.shortcuts = manifest.shortcuts.map(
            (shortcut: Record<string, unknown>) => ({
              ...shortcut,
              icons: Array.isArray(shortcut.icons)
                ? shortcut.icons.map((icon: Record<string, unknown>) => ({
                    ...icon,
                    src: rewriteManifestAssetUrl(String(icon.src || '')),
                  }))
                : shortcut.icons,
            })
          );
        }

        if (rewrittenCount === 0) {
          return;
        }

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        console.log(
          `[ManifestAssets] Rewrote ${rewrittenCount} manifest asset url(s) to prefer CDN`
        );
      },
    },
  };
}

// 检测是否在 watch 模式下运行（命令行包含 --watch）
const isWatchMode = process.argv.includes('--watch');

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',

  // 使用相对路径，源站始终可用，CDN 加速由 SW 层处理
  // SW 的 handleStaticRequest: cache → CDN → 源站回退
  base: process.env.VITE_BASE_URL || './',

  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    __APP_VERSION__: JSON.stringify(appVersion),
    // Vue feature flags - @milkdown/crepe 内部使用了 Vue，需要定义这些编译时标志
    __VUE_OPTIONS_API__: JSON.stringify(false),
    __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
  },

  server: {
    port: 7200,
    host: 'localhost',
    headers: {
      'Content-Security-Policy':
        "upgrade-insecure-requests; default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://wiki.tu-zi.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss: data:; frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
    headers: {
      'Content-Security-Policy':
        "upgrade-insecure-requests; default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://wiki.tu-zi.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss: data:; frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
    },
  },

  plugins: [
    react(),
    nxViteTsPaths(),
    visualizer({
      open: false,
      filename: path.resolve(__dirname, '../../dist/apps/web/stats.html'),
      gzipSize: true,
      brotliSize: true,
    }),
    deferEntryAssetsPlugin(),
    rewriteEntryAssetsToCDNPlugin(),
    rewriteManifestAssetsToCDNPlugin(),
    precacheManifestPlugin(),
    idlePrefetchManifestPlugin(),
  ],

  resolve: {
    dedupe: ['react', 'react-dom'],
  },

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../dist/apps/web',
    // watch 模式下不清空输出目录，避免 index.html 丢失导致 serve 失败
    emptyOutDir: !isWatchMode,
    reportCompressedSize: true,
    // 首屏只注入壳层资源，懒加载分组改由运行时按需拉取/空闲预取。
    modulePreload: false,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveIdlePrefetchGroup(id);
        },
      },
    },
  },
});
