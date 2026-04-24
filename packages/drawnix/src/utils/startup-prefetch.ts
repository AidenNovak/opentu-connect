export type IdlePrefetchGroup =
  | 'ai-chat'
  | 'tool-windows'
  | 'diagram-engines'
  | 'office-data'
  | 'external-skills'
  | 'offline-static-assets';

interface IdlePrefetchMessage {
  type: 'SW_PREFETCH_GROUPS';
  groups: IdlePrefetchGroup[];
}

const requestedGroups = new Set<IdlePrefetchGroup>();

function canUseConnectionForPrefetch(): boolean {
  const connection =
    typeof navigator !== 'undefined'
      ? (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }
        ).connection
      : undefined;

  if (!connection) {
    return true;
  }

  if (connection.saveData) {
    return false;
  }

  return (
    connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g'
  );
}

export function requestServiceWorkerIdlePrefetch(
  groups: IdlePrefetchGroup[]
): void {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    groups.length === 0 ||
    !canUseConnectionForPrefetch()
  ) {
    return;
  }

  const pendingGroups = groups.filter((group) => {
    if (requestedGroups.has(group)) {
      return false;
    }
    requestedGroups.add(group);
    return true;
  });

  if (pendingGroups.length === 0) {
    return;
  }

  const message: IdlePrefetchMessage = {
    type: 'SW_PREFETCH_GROUPS',
    groups: pendingGroups,
  };

  const postMessage = () => {
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage(message);
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage(message);
      })
      .catch(() => {
        pendingGroups.forEach((group) => requestedGroups.delete(group));
      });
  };

  const idleCallback = (
    window as Window & {
      requestIdleCallback?: (
        callback: (deadline: IdleDeadline) => void,
        options?: { timeout: number }
      ) => number;
    }
  ).requestIdleCallback;

  if (typeof idleCallback === 'function') {
    idleCallback(() => postMessage(), { timeout: 1500 });
  } else {
    window.setTimeout(postMessage, 400);
  }
}
