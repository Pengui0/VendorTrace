import { clearWorkspace, emptyWorkspace, loadWorkspace, migrateWorkspace, saveWorkspace, STORAGE_KEY, STORAGE_VERSION, StorageLike, updateWorkspace } from '../../persistence/localStore.js';
import { readSavedSettings, sanitizeSavedPublicUrl, saveSettings } from '../../persistence/settingsPersistence.js';

export async function runLocalStoragePersistenceTests() {
  let passed = 0;
  let failed = 0;
  const details: string[] = [];
  const assert = (condition: boolean, message: string) => { if (condition) { passed++; details.push(`[PASS] ${message}`); } else { failed++; details.push(`[FAIL] ${message}`); } };
  class MemoryStorage implements StorageLike {
    value: string | null = null;
    getItem() { return this.value; }
    setItem(_key: string, value: string) { this.value = value; }
    removeItem() { this.value = null; }
  }
  const storage = new MemoryStorage();
  const investigation = { id: 'inv-1', targetName: 'Example Vendor', identifierType: 'CIN', identifierValue: 'CIN-1', status: 'COMPLETED', createdAt: '2026-01-01', findings: [{ id: 'finding-1', sources: [{ url: 'https://example.test', snippet: 'Evidence excerpt', searchQuery: 'Example Vendor', retrievedAt: '2026-01-01', provenance: 'test' }] }], coverageGaps: ['Registry unavailable'], findingsCount: { verifiedClear: 0, caution: 1, materialRisk: 0, requiresReview: 1 }, relatedLeads: [] } as any;
  const snapshot = { ...emptyWorkspace(), investigations: [investigation] };
  assert(saveWorkspace(snapshot, storage), 'initial save succeeds');
  assert(loadWorkspace(storage).investigations[0].findings[0].sources[0].snippet === 'Evidence excerpt', 'refresh-style hydration preserves full report evidence');
  const updated = { ...loadWorkspace(storage), searchHistory: ['Example Vendor'], vendors: [{ id: 'vendor-1' }] as any[], comparisons: [{ comparisonId: 'comparison-1' }] as any[], monitoringConfigs: { vendor: { preference: 'WEEKLY' } as any }, preferences: { reviewDecision: 'accepted' } };
  saveWorkspace(updated, storage);
  const afterUpdate = loadWorkspace(storage);
  assert(afterUpdate.investigations.length === 1 && afterUpdate.searchHistory[0] === 'Example Vendor', 'update preserves existing investigations and saves workspace history');
  assert(afterUpdate.vendors.length === 1 && afterUpdate.comparisons.length === 1 && afterUpdate.monitoringConfigs.vendor.preference === 'WEEKLY' && afterUpdate.preferences.reviewDecision === 'accepted', 'vendor, monitoring comparison, preferences and review decisions rehydrate');
  const settingsStorage = new MemoryStorage();
  saveWorkspace({ ...emptyWorkspace(), investigations: [investigation], preferences: { executionMode: 'LIVE' } }, settingsStorage);
  saveSettings({ tinyfishTestUrl: sanitizeSavedPublicUrl('https://user:secret@example.com/check?token=private#section'), tinyfishSuiteReport: { success: true, assertionsPassed: 15 } }, settingsStorage);
  const restoredSettings = readSavedSettings(settingsStorage);
  assert(restoredSettings.tinyfishSuiteReport?.assertionsPassed === 15 && loadWorkspace(settingsStorage).investigations.length === 1, 'verification outputs survive settings hydration without dropping reports');
  assert(restoredSettings.tinyfishTestUrl === 'https://example.com/check' && loadWorkspace(settingsStorage).preferences.executionMode === 'LIVE', 'test URL persistence strips credentials and query data while preserving other preferences');
  const v0 = { ...emptyWorkspace(), investigations: [investigation] };
  assert(migrateWorkspace(v0).investigations[0].coverageGaps?.[0] === 'Registry unavailable', 'unversioned schema migrates without dropping records');
  storage.value = '{broken';
  assert(loadWorkspace(storage).investigations.length === 0 && storage.value === '{broken', 'malformed storage is not deleted or overwritten');
  storage.value = JSON.stringify({ version: STORAGE_VERSION + 1, data: snapshot });
  let rejected = false; try { migrateWorkspace(JSON.parse(storage.value)); } catch { rejected = true; }
  assert(rejected && storage.value.includes('version'), 'unknown schema version is preserved and rejected safely');
  storage.value = JSON.stringify({ version: STORAGE_VERSION, data: snapshot });
  storage.setItem = () => { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error; };
  assert(!saveWorkspace(snapshot, storage) && storage.value.includes('inv-1'), 'quota failure leaves the previously saved data untouched');
  storage.setItem = (_key, value) => { storage.value = value; };
  clearWorkspace(storage);
  assert(storage.value === null, 'explicit clear removes only the workspace key');
  return { assertionsPassed: passed, assertionsFailed: failed, details };
}
