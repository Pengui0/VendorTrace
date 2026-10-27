/**
 * Explicitly Labelled Development-Only In-Memory Repository Adapter
 *
 * IMPORTANT COMPLIANCE NOTICE:
 * This adapter is NON-DURABLE. It stores entities in server process memory for local
 * development, iteration, and unit testing. It DOES NOT claim durability and DOES NOT
 * use browser localStorage as a production database.
 */

import {
  Vendor,
  Investigation,
  Signal,
  Evidence,
  Relationship,
  RunComparison,
  PaginationParams,
  PaginatedResult,
} from '../../types/domain.js';
import {
  IVendorRepository,
  IInvestigationRepository,
  ISignalRepository,
  IEvidenceRepository,
  IRelationshipRepository,
  IRunComparisonRepository,
  IUnitOfWork,
} from './interfaces.js';
import {
  validateVendor,
  validateInvestigation,
  validateSignal,
  validateEvidence,
  validateRelationship,
  validateRunComparison,
} from '../validation/domainValidators.js';

function paginateArray<T>(items: T[], params?: PaginationParams): PaginatedResult<T> {
  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = params?.offset ?? (page - 1) * limit;
  const paginated = items.slice(offset, offset + limit);

  return {
    items: paginated,
    total: items.length,
    page,
    limit,
    hasMore: offset + limit < items.length,
  };
}

class InMemoryVendorRepository implements IVendorRepository {
  private store = new Map<string, Vendor>();

  async findById(id: string): Promise<Vendor | null> {
    return this.store.get(id) || null;
  }

  async findByCIN(cin: string): Promise<Vendor | null> {
    const clean = cin.trim().toUpperCase();
    for (const v of this.store.values()) {
      if (v.cin && v.cin.toUpperCase() === clean) return v;
    }
    return null;
  }

  async findByGSTIN(gstin: string): Promise<Vendor | null> {
    const clean = gstin.trim().toUpperCase();
    for (const v of this.store.values()) {
      if (v.gstins.some((g) => g.toUpperCase() === clean)) return v;
    }
    return null;
  }

  async findOrCreateByInput(params: {
    canonicalName: string;
    cin?: string | null;
    gstin?: string | null;
    pan?: string | null;
    sourceReference: string;
  }): Promise<Vendor> {
    // 1. Check by CIN if given
    if (params.cin) {
      const byCin = await this.findByCIN(params.cin);
      if (byCin) {
        // Update input names if new
        if (!byCin.inputNames.includes(params.canonicalName)) {
          byCin.inputNames.push(params.canonicalName);
          byCin.lastCheckedAt = new Date().toISOString();
          this.store.set(byCin.id, byCin);
        }
        return byCin;
      }
    }

    // 2. Check by GSTIN if given
    if (params.gstin) {
      const byGstin = await this.findByGSTIN(params.gstin);
      if (byGstin) return byGstin;
    }

    // 3. Check by exact canonical name
    for (const v of this.store.values()) {
      if (v.canonicalName.toLowerCase() === params.canonicalName.trim().toLowerCase()) {
        if (params.cin && !v.cin) v.cin = params.cin;
        if (params.gstin && !v.gstins.includes(params.gstin)) v.gstins.push(params.gstin);
        v.lastCheckedAt = new Date().toISOString();
        this.store.set(v.id, v);
        return v;
      }
    }

    // 4. Create new validated Vendor
    const newVendor = validateVendor({
      canonicalName: params.canonicalName,
      inputNames: [params.canonicalName],
      cin: params.cin || null,
      gstins: params.gstin ? [params.gstin] : [],
      pan: params.pan || null,
      sourceReference: params.sourceReference,
      latestRiskStatus: 'UNKNOWN',
    });

    this.store.set(newVendor.id, newVendor);
    return newVendor;
  }

  async search(query?: string, pagination?: PaginationParams): Promise<PaginatedResult<Vendor>> {
    let items = Array.from(this.store.values()).sort(
      (a, b) => new Date(b.lastCheckedAt).getTime() - new Date(a.lastCheckedAt).getTime()
    );

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (v) =>
          v.canonicalName.toLowerCase().includes(q) ||
          (v.cin && v.cin.toLowerCase().includes(q)) ||
          v.gstins.some((g) => g.toLowerCase().includes(q)) ||
          v.inputNames.some((n) => n.toLowerCase().includes(q))
      );
    }

    return paginateArray(items, pagination);
  }

  async save(vendor: Vendor): Promise<Vendor> {
    const validated = validateVendor(vendor);
    this.store.set(validated.id, validated);
    return validated;
  }

  async update(id: string, updates: Partial<Vendor>): Promise<Vendor> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Vendor not found with ID: ${id}`);
    const updated = validateVendor({ ...existing, ...updates, id });
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }
}

class InMemoryInvestigationRepository implements IInvestigationRepository {
  private store = new Map<string, Investigation>();

  async findById(id: string): Promise<Investigation | null> {
    return this.store.get(id) || null;
  }

  async findByVendorId(vendorId: string, pagination?: PaginationParams): Promise<PaginatedResult<Investigation>> {
    const items = Array.from(this.store.values())
      .filter((inv) => inv.vendorId === vendorId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return paginateArray(items, pagination);
  }

  async findLatestByVendorId(vendorId: string): Promise<Investigation | null> {
    const items = Array.from(this.store.values())
      .filter((inv) => inv.vendorId === vendorId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return items[0] || null;
  }

  async listRecent(pagination?: PaginationParams): Promise<PaginatedResult<Investigation>> {
    const items = Array.from(this.store.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    return paginateArray(items, pagination);
  }

  async save(investigation: Investigation): Promise<Investigation> {
    const validated = validateInvestigation(investigation);
    this.store.set(validated.id, validated);
    return validated;
  }

  async update(id: string, updates: Partial<Investigation>): Promise<Investigation> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Investigation not found with ID: ${id}`);
    const updated = validateInvestigation({ ...existing, ...updates, id });
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }
}

class InMemorySignalRepository implements ISignalRepository {
  private store = new Map<string, Signal>();

  async findById(id: string): Promise<Signal | null> {
    return this.store.get(id) || null;
  }

  async findByInvestigationId(investigationId: string): Promise<Signal[]> {
    return Array.from(this.store.values()).filter((s) => s.investigationId === investigationId);
  }

  async findByVendorId(vendorId: string): Promise<Signal[]> {
    return Array.from(this.store.values()).filter((s) => s.vendorId === vendorId);
  }

  async save(signal: Signal): Promise<Signal> {
    const validated = validateSignal(signal);
    this.store.set(validated.id, validated);
    return validated;
  }

  async saveBatch(signals: Signal[]): Promise<Signal[]> {
    const result: Signal[] = [];
    for (const s of signals) {
      result.push(await this.save(s));
    }
    return result;
  }

  async update(id: string, updates: Partial<Signal>): Promise<Signal> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Signal not found with ID: ${id}`);
    const updated = validateSignal({ ...existing, ...updates, id });
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }
}

class InMemoryEvidenceRepository implements IEvidenceRepository {
  private store = new Map<string, Evidence>();

  async findById(id: string): Promise<Evidence | null> {
    return this.store.get(id) || null;
  }

  async findByIds(ids: string[]): Promise<Evidence[]> {
    const res: Evidence[] = [];
    for (const id of ids) {
      const e = this.store.get(id);
      if (e) res.push(e);
    }
    return res;
  }

  async save(evidence: Evidence): Promise<Evidence> {
    const validated = validateEvidence(evidence);
    this.store.set(validated.id, validated);
    return validated;
  }

  async saveBatch(evidenceList: Evidence[]): Promise<Evidence[]> {
    const res: Evidence[] = [];
    for (const e of evidenceList) {
      res.push(await this.save(e));
    }
    return res;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }
}

class InMemoryRelationshipRepository implements IRelationshipRepository {
  private store = new Map<string, Relationship>();

  async findById(id: string): Promise<Relationship | null> {
    return this.store.get(id) || null;
  }

  async findByEntityId(entityId: string): Promise<Relationship[]> {
    return Array.from(this.store.values()).filter(
      (r) => r.sourceEntityId === entityId || r.targetEntityId === entityId
    );
  }

  async save(relationship: Relationship): Promise<Relationship> {
    const validated = validateRelationship(relationship);
    this.store.set(validated.id, validated);
    return validated;
  }

  async saveBatch(relationships: Relationship[]): Promise<Relationship[]> {
    const res: Relationship[] = [];
    for (const r of relationships) {
      res.push(await this.save(r));
    }
    return res;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }
}

class InMemoryRunComparisonRepository implements IRunComparisonRepository {
  private store = new Map<string, RunComparison>();

  async findById(id: string): Promise<RunComparison | null> {
    return this.store.get(id) || null;
  }

  async findByRunIds(previousRunId: string, currentRunId: string): Promise<RunComparison | null> {
    for (const cmp of this.store.values()) {
      if (cmp.previousRunId === previousRunId && cmp.currentRunId === currentRunId) {
        return cmp;
      }
    }
    return null;
  }

  async save(comparison: RunComparison): Promise<RunComparison> {
    const validated = validateRunComparison(comparison);
    this.store.set(validated.id, validated);
    return validated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  clear() {
    this.store.clear();
  }
}

export class DevInMemoryUnitOfWork implements IUnitOfWork {
  public readonly vendors = new InMemoryVendorRepository();
  public readonly investigations = new InMemoryInvestigationRepository();
  public readonly signals = new InMemorySignalRepository();
  public readonly evidence = new InMemoryEvidenceRepository();
  public readonly relationships = new InMemoryRelationshipRepository();
  public readonly comparisons = new InMemoryRunComparisonRepository();

  public getStorageMode() {
    return {
      mode: 'DEVELOPMENT_IN_MEMORY_NON_DURABLE' as const,
      isDurable: false,
      activeAdapterName: 'DevInMemoryRepositoryAdapter',
      warning:
        'DEVELOPMENT NOTICE: This data is residing in non-durable server process memory. Data will reset on server restart. For persistent production storage, provision Google Cloud Firestore.',
    };
  }

  public async clearAllForTesting(): Promise<void> {
    this.vendors.clear();
    this.investigations.clear();
    this.signals.clear();
    this.evidence.clear();
    this.relationships.clear();
    this.comparisons.clear();
  }
}
