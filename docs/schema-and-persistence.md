# VendorTrace — Domain Schema & Persistence Architecture

## 1. Overview
VendorTrace enforces a typed repository layer that isolates storage mechanics from business logic. The system operates under strict data integrity invariants:
* **Zero-Fabrication Rule**: Absences of records or unconfigured connectors are never translated into positive risk clearance.
* **Stable IDs & ISO Timestamps**: All entities carry predictable, domain-prefixed IDs (`ven_`, `inv_`, `sig_`, `evi_`, `rel_`, `cmp_`) and strict ISO 8601 timestamps.
* **Storage Transparency**: The application explicitly reports whether it is operating on the **Development-Only In-Memory Adapter (Non-Durable)** or persistent **Google Cloud Firestore**.

---

## 2. Entity Schemas

### 2.1 Vendor (`ven_*`)
Represents an Indian corporate entity under procurement or compliance due diligence.
```typescript
interface Vendor {
  id: string;                      // Stable ID (e.g. ven_1792857000_abc12)
  canonicalName: string;           // Registered legal name in MCA21/RoC
  inputNames: string[];            // Deduplicated list of aliases/query names
  cin: string | null;              // 21-character Corporate Identification Number
  gstins: string[];                // List of registered Goods & Services Tax IDs
  pan: string | null;              // 10-character Permanent Account Number (if returned/needed)
  companyStatus: CompanyStatus;    // ACTIVE, STRIKE_OFF, UNDER_LIQUIDATION, DORMANT, etc.
  registeredAddress: string | null;// Official RoC registered office address
  sourceReference: string;         // e.g. "MCA21 Registry via IndiaCos"
  firstSeenAt: string;             // ISO 8601
  lastCheckedAt: string;            // ISO 8601
  latestRiskStatus: RiskVerdict;   // VERIFIED_CLEAR, CAUTION, MATERIAL_RISK, UNKNOWN
}
```

### 2.2 Investigation (`inv_*`)
An immutable audit run capturing the due diligence evaluation across external registry connectors.
```typescript
interface Investigation {
  id: string;                      // Stable ID (e.g. inv_1792857000_mno78)
  vendorId: string;                // Foreign key -> Vendor.id
  requestedIdentifier: {
    type: 'CIN' | 'GSTIN' | 'PAN' | 'DIN' | 'NAME';
    value: string;
  };
  startedAt: string;               // ISO 8601
  completedAt: string | null;      // ISO 8601
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  providerStatuses: Record<string, ProviderHealth>;
  summary: {
    verdict: RiskVerdict;
    narrative: string;
    totalSignals: number;
    corroboratedSignals: number;
    reviewNeededSignals: number;
    highSeveritySignals: number;
  };
  latestReportReference: string | null;
}
```

### 2.3 Evidence (`evi_*`)
Individual verified evidence items with provenance and source URLs.
```typescript
interface Evidence {
  id: string;                      // Stable ID (e.g. evi_1792857000_xyz89)
  sourceName: string;              // e.g. "MCA21 RoC Filing"
  sourceDomain: string;            // e.g. "mca.gov.in"
  sourceUrl: string | null;        // Full URL or null if private registry
  quote: string;                   // Exact quoted snippet or registry field
  publishedAt: string | null;      // Publication timestamp if available
  capturedAt: string;              // Timestamp when retrieved
  underlyingSource: string;        // Specific document/filing provenance
  sourceType: SourceType;          // IndiaCos, TinyFish, OfficialRegistry, NewsMedia
  identityMatchNotes: string;      // Match confidence basis (e.g. Exact CIN match)
}
```

### 2.4 Signal (`sig_*`)
Evaluated compliance or risk signals categorized by dimension and severity.
```typescript
interface Signal {
  id: string;                      // Stable ID (e.g. sig_1792857000_ijk34)
  investigationId: string;         // Foreign key -> Investigation.id
  vendorId: string;                // Foreign key -> Vendor.id
  dimension: SignalDimension;      // REGISTRY_STATUS, TAX_COMPLIANCE, LITIGATION, DEBARMENT, ADVERSE_MEDIA, GOVERNANCE
  title: string;                   // Brief title
  neutralSummary: string;          // Objective fact summary
  severity: 1 | 2 | 3 | 4 | 5;     // 1 = Info, 3 = Caution, 5 = Critical
  evidenceIds: string[];           // Array of Evidence.id
  confidenceStatus: Confidence;    // CORROBORATED (>=2 sources), REQUIRES_HUMAN_REVIEW (1 source), CONFLICTING, UNRESOLVED
  firstSeenAt: string;             // ISO 8601
  lastSeenAt: string;              // ISO 8601
  lifecycleStatus: Lifecycle;      // ACTIVE, RESOLVED, DISMISSED, MONITORING
  reviewNote: string | null;       // Compliance officer audit comment
}
```

### 2.5 Relationship (`rel_*`)
Lawful corporate linkages discovered via directors, shared addresses, or corporate hierarchies.
```typescript
interface Relationship {
  id: string;                      // Stable ID (e.g. rel_1792857000_rst56)
  sourceEntityId: string;          // Entity 1
  targetEntityId: string;          // Entity 2
  relationshipType: RelType;       // SHARED_DIRECTOR, SHARED_ADDRESS, LINKED_GST_CIN, PARENT_SUBSIDIARY
  evidenceIds: string[];           // Underlying proof
  matchStrength: MatchStrength;    // EXACT_IDENTIFIER, STRONG_NAME_AND_ADDRESS, PROBABLE, WEAK
  firstSeenAt: string;
  details?: {
    directorName?: string;
    din?: string;
    commonAddress?: string;
    notes?: string;
  };
}
```

### 2.6 RunComparison (`cmp_*`)
Audit delta between two distinct investigation runs.
```typescript
interface RunComparison {
  id: string;                      // Stable ID (e.g. cmp_1792857000_uvw90)
  previousRunId: string;           // Baseline run
  currentRunId: string;            // Comparison run
  newSignalIds: string[];          // Newly flagged signals
  changedSignalIds: string[];      // Signals with severity or status change
  removedSignalIds: string[];      // Signals resolved or removed
  unresolvedSignalIds: string[];   // Signals still requiring human review
  comparedAt: string;              // ISO 8601
}
```

---

## 3. Storage Adapters & Durability

| Adapter | Status | Durability | Intended Use |
|---|---|---|---|
| `DevInMemoryRepositoryAdapter` | **Active** | Non-Durable (In-Memory) | Local development, rapid unit testing, PR validation |
| `FirestoreRepositoryAdapter` | Ready for Provisioning | Durable Cloud Storage | Enterprise production, multi-tenant persistence |

---

## 4. Privacy & Governance Guarantees
* **No Secret Storage**: API keys (`INDIACOS_API_KEY`, `TINYFISH_API_KEY`) are NEVER stored in the repository or returned in database queries.
* **No Unnecessary Personal Data**: Director DINs and registry names are captured exclusively in lawful corporate context; personal contact details, residential addresses, and personal emails are redacted.
