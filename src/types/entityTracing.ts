/**
 * Layer 2 Entity Tracing & Corporate Relationship Graph Contracts
 * Defines anchor extraction, relationship strengths, and graph structures.
 * Strictly enforces zero-guilt-by-association and anti-fabrication policies.
 */

export type AnchorType = 'CIN' | 'GSTIN' | 'DIN' | 'DIRECTOR_NAME' | 'REGISTERED_ADDRESS';

export type RelationshipStrength =
  | 'strong_identifier'        // Exact CIN, DIN, or permanent tax identifier match
  | 'registry_link'            // Verified official RoC/MCA21 or GST filing link
  | 'same_address_candidate'   // Shared registered office lead (candidate match, NOT proof of control)
  | 'same_name_candidate'      // Same director name without verified DIN (lead only; never merged)
  | 'unverified';              // Provisional registry candidate

export type EntityRelationType =
  | 'SHARED_DIRECTOR'
  | 'SHARED_ADDRESS'
  | 'LINKED_GST_CIN'
  | 'PARENT_SUBSIDIARY'
  | 'OTHER';

export interface EntityAnchor {
  id: string;
  type: AnchorType;
  value: string;
  label: string;
  sourceFindingId?: string;
  provenance: string;
}

export interface EntityRelationship {
  id: string; // Stable ID, e.g. "rel_..."
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  targetCin: string | null;
  relationshipType: EntityRelationType;
  matchMethod: string;
  strength: RelationshipStrength;
  evidenceIds: string[];
  sourceUrls: string[];
  provenance: string;
  details: {
    din?: string;
    directorName?: string;
    commonAddress?: string;
    designation?: string;
    appointmentDate?: string;
    notes?: string;
  };
  lightweightL1Status?: 'CLEAN' | 'CAUTION' | 'MATERIAL_RISK' | 'UNKNOWN';
  lightweightL1Note?: string;
  leadDisclaimer: string;
  createdAt: string;
}

export interface EntityGraphNode {
  id: string;
  name: string;
  nodeType: 'PRIMARY_VENDOR' | 'RELATED_COMPANY' | 'DIRECTOR' | 'REGISTERED_ADDRESS';
  cin?: string | null;
  din?: string | null;
  companyStatus?: string;
  matchConfidence: string;
  provenance: string;
  lightweightReviewStatus?: string;
  lightweightReviewNote?: string;
}

export interface EntityGraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: EntityRelationType;
  strength: RelationshipStrength;
  label: string;
  evidenceIds: string[];
  sourceUrls: string[];
  provenance: string;
  disclaimer: string;
}

export interface EntityGraph {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  anchorsUsed: EntityAnchor[];
  disclaimer: string;
  stats: {
    totalRelatedEntities: number;
    totalDirectors: number;
    strongIdentifierMatches: number;
    candidateMatches: number;
    depth: number;
    maxCandidatesLimit: number;
  };
}

export interface EntityTracingOptions {
  maxDepth?: number; // Maximum depth (Strictly 1 for hackathon MVP)
  maxCandidatesPerAnchor?: number; // Configurable limit (default: 10)
  runLightweightL1?: boolean;
  signal?: AbortSignal;
  useMock?: boolean;
  mockScenario?:
    | 'STANDARD'
    | 'SHARED_ADDRESS'
    | 'SAME_NAME_NO_DIN'
    | 'EXACT_DIN'
    | 'DUPLICATE_ENTITIES'
    | 'NO_ANCHORS'
    | 'LIMIT_EXCEEDED';
}
