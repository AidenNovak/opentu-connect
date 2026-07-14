import {
  providerTransport,
  type ProviderTransportRequest,
  type ResolvedProviderContext,
} from '../provider-routing';
import {
  resolveInvocationRoute,
  type ModelRef,
  type ResolvedInvocationRoute,
} from '../../utils/settings-manager';
import type { ModelType } from '../../constants/model-config';
import { IMAGE_GENERATION_TIMEOUT_MS } from '../../constants/TASK_CONSTANTS';
import { resolveInvocationPlanFromRoute } from '../provider-routing';
import type { AdapterContext } from './types';
import { emitImageRequestIdDebugLog } from '../media-api/request-id-debug';

interface AdapterContextRouteOptions {
  bindingId?: string | null;
  preferredRequestSchema?: string | readonly string[] | null;
}

export const getAdapterContextFromSettings = (
  routeType: ModelType,
  modelId?: string | ModelRef | null,
  options: AdapterContextRouteOptions = {}
): AdapterContext => {
  const plan = resolveInvocationPlanFromRoute(routeType, modelId, options);
  if (plan) {
    return {
      baseUrl: plan.provider.baseUrl,
      operation: routeType,
      apiKey: plan.provider.apiKey,
      authType: plan.provider.authType,
      extraHeaders: plan.provider.extraHeaders,
      provider: plan.provider,
      binding: plan.binding,
    };
  }

  const route: ResolvedInvocationRoute = resolveInvocationRoute(
    routeType,
    modelId
  );
  return {
    baseUrl: route.baseUrl,
    operation: routeType,
    apiKey: route.apiKey,
    authType: 'bearer',
    provider: null,
    binding: null,
  };
};

export function buildProviderContextFromAdapterContext(
  context: AdapterContext,
  baseUrlOverride?: string
): ResolvedProviderContext {
  if (context.provider) {
    return {
      ...context.provider,
      baseUrl: baseUrlOverride || context.provider.baseUrl,
    };
  }

  return {
    profileId: 'runtime',
    profileName: 'Runtime',
    providerType: 'custom',
    baseUrl: baseUrlOverride || context.baseUrl,
    apiKey: context.apiKey || '',
    authType: context.authType || 'bearer',
    extraHeaders: context.extraHeaders,
  };
}

export function sendAdapterRequest(
  context: AdapterContext,
  request: ProviderTransportRequest,
  baseUrlOverride?: string
): Promise<Response> {
  const timeoutMs =
    request.timeoutMs ??
    (context.operation === 'image' ? IMAGE_GENERATION_TIMEOUT_MS : undefined);

  // 图片操作自动附带 X-Request-Id，用于超时时通过 /log/get-request 找回结果。
  // 若 caller 已显式传入 requestId 则复用，避免重复生成。
  let requestId = request.requestId;
  if (!requestId && context.operation === 'image') {
    requestId = generateRequestId();
  }

  if (requestId && context.operation === 'image') {
    emitImageRequestIdDebugLog(requestId, {
      endpoint: request.path,
      source: 'sendAdapterRequest',
    });
  }

  if (requestId && context.onRequestSent) {
    try {
      context.onRequestSent({ requestId });
    } catch (err) {
      // 回调异常不影响主流程
      console.debug('[sendAdapterRequest] onRequestSent callback error:', err);
    }
  }

  return providerTransport.send(
    buildProviderContextFromAdapterContext(context, baseUrlOverride),
    {
      ...request,
      requestId,
      timeoutMs,
      fetcher: context.fetcher || request.fetcher,
    }
  );
}

function generateRequestId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  // 极端兜底（老环境）：时间戳 + 随机
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
