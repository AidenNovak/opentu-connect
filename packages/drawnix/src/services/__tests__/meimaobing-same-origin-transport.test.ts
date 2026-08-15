import { describe, expect, it, vi } from 'vitest';
import { providerTransport } from '../provider-routing';
import type { ResolvedProviderContext } from '../provider-routing';

const meimaobingContext: ResolvedProviderContext = {
  profileId: 'meimaobing-account',
  profileName: 'Meimaobing 图片账户',
  providerType: 'openai-compatible',
  baseUrl: '/meimaobing/v1',
  apiKey: '',
  authType: 'custom',
};

describe('Meimaobing same-origin transport', () => {
  it('sends cookie credentials and an idempotency key for paid image posts', () => {
    const prepared = providerTransport.prepareRequest(meimaobingContext, {
      path: '/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(prepared.url).toBe('/meimaobing/v1/images/generations');
    expect(prepared.init.credentials).toBe('include');
    expect(prepared.headers.Authorization).toBeUndefined();
    expect(prepared.headers['Idempotency-Key']).toMatch(/^mbimg-/);
  });

  it('keeps a caller-supplied idempotency key', () => {
    const prepared = providerTransport.prepareRequest(meimaobingContext, {
      path: '/images/edits',
      method: 'POST',
      headers: {
        'Idempotency-Key': 'task-image-1',
      },
    });

    expect(prepared.headers['Idempotency-Key']).toBe('task-image-1');
    expect(prepared.init.credentials).toBe('include');
  });

  it('does not attach an idempotency key to model discovery', () => {
    const prepared = providerTransport.prepareRequest(meimaobingContext, {
      path: '/models',
      method: 'GET',
    });

    expect(prepared.headers['Idempotency-Key']).toBeUndefined();
    expect(prepared.init.credentials).toBe('include');
  });

  it('maps a Meimaobing network failure to account unavailability', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(
      providerTransport.send(meimaobingContext, {
        path: '/images/generations',
        method: 'POST',
        fetcher,
      })
    ).rejects.toMatchObject({
      name: 'MeimaobingImageGatewayError',
      code: 'ACCOUNT_UNAVAILABLE',
    });
  });

  it('does not remap a user abort into account unavailability', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const fetcher = vi.fn(async () => {
      throw abortError;
    });

    await expect(
      providerTransport.send(meimaobingContext, {
        path: '/images/generations',
        method: 'POST',
        fetcher,
      })
    ).rejects.toBe(abortError);
  });
});
