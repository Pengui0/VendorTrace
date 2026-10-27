import type { Investigation } from '../types/vendor.js';
import type { Vendor } from '../types/domain.js';
import type { MonitoringConfig, RunComparisonReport } from '../types/monitoringDiff.js';

export const STORAGE_KEY = 'vendortrace.workspace';
export const STORAGE_VERSION = 1;
let storageReadError: string | null = null;
export const getStorageReadError = () => storageReadError;

export interface WorkspaceSnapshot {
  investigations: Investigation[];
  vendors: Vendor[];
  comparisons: RunComparisonReport[];
  monitoringConfigs: Record<string, MonitoringConfig>;
  preferences: Record<string, unknown>;
  searchHistory: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const emptyWorkspace = (): WorkspaceSnapshot => ({
  investigations: [], vendors: [], comparisons: [], monitoringConfigs: {}, preferences: {}, searchHistory: [],
});

function validWorkspace(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkspaceSnapshot>;
  return Array.isArray(v.investigations) && v.investigations.every((i) => !!i && typeof i.id === 'string' && typeof i.targetName === 'string')
    && Array.isArray(v.vendors) && Array.isArray(v.comparisons)
    && !!v.monitoringConfigs && typeof v.monitoringConfigs === 'object'
    && !!v.preferences && typeof v.preferences === 'object' && Array.isArray(v.searchHistory);
}

export function migrateWorkspace(raw: unknown): WorkspaceSnapshot {
  if (!raw || typeof raw !== 'object') return emptyWorkspace();
  const envelope = raw as { version?: unknown; data?: unknown };
  if (envelope.version === STORAGE_VERSION && validWorkspace(envelope.data)) return envelope.data;
  // v0 migration accepts the early unversioned snapshot without discarding records.
  if (envelope.version === undefined && validWorkspace(raw)) return raw;
  throw new Error('Unsupported or malformed VendorTrace storage. Existing data was left untouched.');
}

export function loadWorkspace(storage?: StorageLike): WorkspaceSnapshot {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return emptyWorkspace();
  const serialized = target.getItem(STORAGE_KEY);
  if (!serialized) return emptyWorkspace();
  try { return migrateWorkspace(JSON.parse(serialized)); }
  catch (error) {
    storageReadError = error instanceof Error ? error.message : 'Unable to read saved workspace.';
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vendortrace-storage-error', { detail: storageReadError }));
    return emptyWorkspace();
  }
}

export function saveWorkspace(snapshot: WorkspaceSnapshot, storage?: StorageLike): boolean {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return false;
  try {
    const existing = target.getItem(STORAGE_KEY);
    if (existing) {
      try { migrateWorkspace(JSON.parse(existing)); }
      catch (error) {
        storageReadError = error instanceof Error ? error.message : 'Saved workspace data is malformed and was preserved.';
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vendortrace-storage-error', { detail: storageReadError }));
        return false;
      }
    }
    target.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data: snapshot }));
    return true;
  } catch (error) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vendortrace-storage-error', {
      detail: error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        ? 'Local storage is full. Export a workspace backup and free browser storage before continuing.'
        : 'Workspace changes could not be saved to this browser.',
    }));
    return false;
  }
}

export function updateWorkspace(update: (current: WorkspaceSnapshot) => WorkspaceSnapshot, storage?: StorageLike): boolean {
  return saveWorkspace(update(loadWorkspace(storage)), storage);
}

export function exportWorkspaceBackup(storage?: StorageLike): void {
  const snapshot = loadWorkspace(storage);
  const blob = new Blob([JSON.stringify({ version: STORAGE_VERSION, data: snapshot }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `vendortrace-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url);
}

export function clearWorkspace(storage?: StorageLike): void {
  (storage ?? window.localStorage).removeItem(STORAGE_KEY);
}
