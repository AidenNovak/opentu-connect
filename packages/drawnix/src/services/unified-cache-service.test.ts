// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sw-channel/client', () => ({
  swChannelClient: {
    isInitialized: () => true,
    setEventHandlers: vi.fn(),
    publish: vi.fn(),
  },
}));

import {
  UNIFIED_BLOB_STORE_NAME,
  UNIFIED_DB_NAME,
  unifiedCacheService,
} from './unified-cache-service';

function deleteStoredBlob(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UNIFIED_DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(UNIFIED_BLOB_STORE_NAME, 'readwrite');
      transaction.objectStore(UNIFIED_BLOB_STORE_NAME).delete(url);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UnifiedCacheService insecure LAN fallback', () => {
  it('persists and reads asset-library media when Cache Storage is unavailable', async () => {
    vi.stubGlobal('caches', undefined);
    const blob = new Blob(['local-image'], { type: 'image/png' });
    const assetUrl = '/asset-library/content-local-test.png';

    const cached = await unifiedCacheService.cacheMediaFromBlob(
      assetUrl,
      blob,
      'image',
      { contentHash: 'local-test' }
    );
    const restored = await unifiedCacheService.getCachedBlob(
      `http://192.168.50.225:7200${assetUrl}`
    );

    expect(cached).toBe(assetUrl);
    expect(restored?.type).toBe('image/png');
    expect(await restored?.text()).toBe('local-image');
  });

  it('falls back when Cache Storage exists but rejects access', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('caches', {
      open: vi.fn().mockRejectedValue(new Error('SecurityError')),
    });
    const blob = new Blob(['rejected-cache'], { type: 'image/png' });
    const assetUrl = '/asset-library/content-rejected-cache.png';

    await unifiedCacheService.cacheMediaFromBlob(assetUrl, blob, 'image', {
      contentHash: 'rejected-cache',
    });
    const restored = await unifiedCacheService.getCachedBlob(assetUrl);

    expect(await restored?.text()).toBe('rejected-cache');
  });

  it('repairs legacy metadata when the persisted Blob is missing', async () => {
    vi.stubGlobal('caches', undefined);
    const blob = new Blob(['repair-local-image'], { type: 'image/png' });
    const first = await unifiedCacheService.cacheLocalMediaByContent(
      blob,
      'image'
    );

    await deleteStoredBlob(first.url);
    expect(await unifiedCacheService.getCachedBlob(first.url)).toBeNull();

    const repaired = await unifiedCacheService.cacheLocalMediaByContent(
      blob,
      'image'
    );
    const restored = await unifiedCacheService.getCachedBlob(repaired.url);

    expect(repaired.url).toBe(first.url);
    expect(repaired.reused).toBe(false);
    expect(await restored?.text()).toBe('repair-local-image');
  });
});
