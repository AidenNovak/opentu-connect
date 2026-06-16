import { describe, expect, it, vi } from 'vitest';

describe('tuzi-api-endpoints', () => {
  it('解析 tuzi-api 状态接口中的站点列表，并过滤非上游站点', async () => {
    vi.resetModules();

    const { parseTuziApiAddressList, TUZI_API_FALLBACK_ENDPOINTS } =
      await import('../provider-routing/tuzi-api-endpoints');

    const endpoints = parseTuziApiAddressList([
      {
        name: '主站点',
        url: 'https://api.tu-zi.com/v1',
        description: '主站点',
      },
      {
        name: '不可信站点',
        url: 'https://example.com',
        description: '应被过滤',
      },
      {
        url: 'https://apisz.ourzhishi.top/',
      },
    ]);

    expect(endpoints).toEqual([
      {
        name: '主站点',
        url: 'https://api.tu-zi.com',
        description: '主站点',
      },
      {
        name: '深圳地址（无前端）',
        url: 'https://apisz.ourzhishi.top',
        description: '深圳地址',
      },
    ]);
    expect(endpoints.length).toBeLessThan(TUZI_API_FALLBACK_ENDPOINTS.length);
  });

  it('获取站点来源失败时，baseUrl 列表回退到内置 tuzi-api 站点', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const { loadTuziApiEndpointBaseUrls, TUZI_API_FALLBACK_ENDPOINTS } =
      await import('../provider-routing/tuzi-api-endpoints');

    await expect(loadTuziApiEndpointBaseUrls()).resolves.toEqual(
      TUZI_API_FALLBACK_ENDPOINTS.map((endpoint) =>
        endpoint.url.replace(/\/+$/, '')
      )
    );
  });
});
