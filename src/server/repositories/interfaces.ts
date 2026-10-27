/**
 * Repository Interfaces for VendorTrace Data Access Layer
 * Supports pluggable backends (Firestore / Development In-Memory)
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

export interface IVendorRepository {
  findById(id: string): Promise<Vendor | null>;
  findByCIN(cin: string): Promise<Vendor | null>;
  findByGSTIN(gstin: string): Promise<Vendor | null>;
  findOrCreateByInput(params: {
    canonicalName: string;
    cin?: string | null;
    gstin?: string | null;
    pan?: string | null;
    sourceReference: string;
  }): Promise<Vendor>;
  search(query?: string, pagination?: PaginationParams): Promise<PaginatedResult<Vendor>>;
  save(vendor: Vendor): Promise<Vendor>;
  update(id: string, updates: Partial<Vendor>): Promise<Vendor>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IInvestigationRepository {
  findById(id: string): Promise<Investigation | null>;
  findByVendorId(vendorId: string, pagination?: PaginationParams): Promise<PaginatedResult<Investigation>>;
  findLatestByVendorId(vendorId: string): Promise<Investigation | null>;
  listRecent(pagination?: PaginationParams): Promise<PaginatedResult<Investigation>>;
  save(investigation: Investigation): Promise<Investigation>;
  update(id: string, updates: Partial<Investigation>): Promise<Investigation>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface ISignalRepository {
  findById(id: string): Promise<Signal | null>;
  findByInvestigationId(investigationId: string): Promise<Signal[]>;
  findByVendorId(vendorId: string): Promise<Signal[]>;
  save(signal: Signal): Promise<Signal>;
  saveBatch(signals: Signal[]): Promise<Signal[]>;
  update(id: string, updates: Partial<Signal>): Promise<Signal>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IEvidenceRepository {
  findById(id: string): Promise<Evidence | null>;
  findByIds(ids: string[]): Promise<Evidence[]>;
  save(evidence: Evidence): Promise<Evidence>;
  saveBatch(evidenceList: Evidence[]): Promise<Evidence[]>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IRelationshipRepository {
  findById(id: string): Promise<Relationship | null>;
  findByEntityId(entityId: string): Promise<Relationship[]>;
  save(relationship: Relationship): Promise<Relationship>;
  saveBatch(relationships: Relationship[]): Promise<Relationship[]>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IRunComparisonRepository {
  findById(id: string): Promise<RunComparison | null>;
  findByRunIds(previousRunId: string, currentRunId: string): Promise<RunComparison | null>;
  save(comparison: RunComparison): Promise<RunComparison>;
  delete(id: string): Promise<boolean>;
}

export interface IUnitOfWork {
  vendors: IVendorRepository;
  investigations: IInvestigationRepository;
  signals: ISignalRepository;
  evidence: IEvidenceRepository;
  relationships: IRelationshipRepository;
  comparisons: IRunComparisonRepository;
  getStorageMode(): {
    mode: 'FIRESTORE' | 'DEVELOPMENT_IN_MEMORY_NON_DURABLE';
    isDurable: boolean;
    activeAdapterName: string;
    warning?: string;
  };
  clearAllForTesting?(): Promise<void>;
}
