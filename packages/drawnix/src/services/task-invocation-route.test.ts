import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types/task.types';

const accountProfile = {
  id: 'meimaobing-account',
  name: 'Meimaobing 图片账户',
  enabled: true,
  baseUrl: '/meimaobing/v1',
  apiKey: '',
  authType: 'custom',
  providerType: 'openai-compatible',
};

vi.mock('../utils/settings-manager', () => ({
  createModelRef: (profileId?: string | null, modelId?: string | null) =>
    profileId || modelId
      ? { profileId: profileId || null, modelId: modelId || null }
      : null,
  providerProfilesSettings: {
    get: () => [accountProfile],
  },
  resolveInvocationRoute: vi.fn(),
}));

vi.mock('./provider-routing', () => ({
  resolveInvocationPlanFromRoute: vi.fn(
    (
      _operation: string,
      routeModel?: { profileId?: string; modelId?: string }
    ) =>
      routeModel?.profileId === 'meimaobing-account'
        ? {
            modelRef: {
              profileId: 'meimaobing-account',
              modelId: routeModel.modelId || 'gpt-image-2',
            },
            provider: {
              profileId: 'meimaobing-account',
              providerType: 'openai-compatible',
            },
            binding: {
              id: 'meimaobing-image',
              protocol: 'openai.images.generations',
              requestSchema: 'openai.image.gpt-generation-json',
              responseSchema: 'openai.image.data',
              submitPath: '/images/generations',
            },
          }
        : null
  ),
}));

describe('task invocation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a Meimaobing cookie-session task without an API key', async () => {
    const { assertTaskInvocationRouteAvailable } = await import(
      './task-invocation-route'
    );
    const task = {
      params: { model: 'gpt-image-2' },
      invocationRoute: {
        operation: 'image',
        providerProfileId: 'meimaobing-account',
        modelRef: {
          profileId: 'meimaobing-account',
          modelId: 'gpt-image-2',
        },
        modelId: 'gpt-image-2',
        binding: null,
      },
    } as Pick<Task, 'params' | 'invocationRoute'>;

    expect(() =>
      assertTaskInvocationRouteAvailable('image', task)
    ).not.toThrow();
  });
});
