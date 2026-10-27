import { loadWorkspace, updateWorkspace } from './localStore.js';
import type { StorageLike } from './localStore.js';

export interface SavedProviderProbe {
  status: string;
  lastCheckedAt: string;
  latencyMs?: number;
  errorCategory?: string | null;
  upstreamRequestId?: string | null;
}

export function readSavedSettings(storage?: StorageLike): Record<string, any> {
  const saved = loadWorkspace(storage).preferences.settings;
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, any> : {};
}

export function saveSettings(patch: Record<string, unknown>, storage?: StorageLike): boolean {
  return updateWorkspace((workspace) => {
    const current = workspace.preferences.settings;
    const settings = current && typeof current === 'object' && !Array.isArray(current)
      ? current as Record<string, unknown>
      : {};
    return {
      ...workspace,
      preferences: {
        ...workspace.preferences,
        settings: { ...settings, ...patch },
      },
    };
  }, storage);
}

export function sanitizeSavedPublicUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}
