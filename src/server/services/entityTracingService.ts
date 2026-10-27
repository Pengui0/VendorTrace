/**
 * Layer 2 Related-Entity Tracing Service
 * Discovers lawfully linked corporate entities via Director DINs, MCA21 Filings, and Registered Offices.
 * Enforces Zero-Guilt-by-Association, Bounded Depth (Max 1), and Anchor Provenance.
 */

import {
  EntityAnchor,
  EntityRelationship,
  EntityGraph,
  EntityGraphNode,
  EntityGraphEdge,
  EntityTracingOptions,
  RelationshipStrength,
} from '../../types/entityTracing.js';
import { generateStableId } from '../validation/domainValidators.js';
import { indiacos } from '../providers/indiacos.js';
import { tinyfish } from '../providers/tinyfish.js';
import { ResolvedCompanyProfile } from '../providers/types.js';
import { RiskFinding } from '../../types/riskFinding.js';

export const TRACING_DISCLAIMER =
  'Discovery leads for manual review: Shared directors or registered offices indicate public registry links or candidate leads, not proof of control, common liability, or misconduct.';

export class EntityTracingService {
  /**
   * Extracts concrete anchors from source-backed findings and vendor profile.
   */
  public extractAnchors(
    vendor: {
      canonicalName: string;
      cin?: string | null;
      gstin?: string | null;
      profile?: ResolvedCompanyProfile | null;
    },
    findings: RiskFinding[] = []
  ): EntityAnchor[] {
    const anchors: EntityAnchor[] = [];
    const seen = new Set<string>();

    // 1. Anchor: Exact CIN
    const cin = vendor.cin || vendor.profile?.cin;
    if (cin && !seen.has(`CIN:${cin}`)) {
      seen.add(`CIN:${cin}`);
      anchors.push({
        id: `anc_cin_${cin}`,
        type: 'CIN',
        value: cin.toUpperCase(),
        label: `Corporate Identification Number: ${cin}`,
        provenance: 'Ministry of Corporate Affairs (MCA21 Master Data)',
      });
    }

    // 2. Anchor: Linked GSTIN
    const gstins = vendor.profile?.gstins || (vendor.gstin ? [vendor.gstin] : []);
    for (const gst of gstins) {
      if (gst && !seen.has(`GSTIN:${gst}`)) {
        seen.add(`GSTIN:${gst}`);
        anchors.push({
          id: `anc_gst_${gst}`,
          type: 'GSTIN',
          value: gst.toUpperCase(),
          label: `GST Registration: ${gst}`,
          provenance: 'Goods & Services Tax Network (GSTN)',
        });
      }
    }

    // 3. Anchor: Directors with DINs (or clearly attributed names)
    const directors = vendor.profile?.directors || [];
    for (const dir of directors) {
      if (dir.din && !seen.has(`DIN:${dir.din}`)) {
        seen.add(`DIN:${dir.din}`);
        anchors.push({
          id: `anc_din_${dir.din}`,
          type: 'DIN',
          value: dir.din,
          label: `Director DIN ${dir.din}: ${dir.name}`,
          provenance: 'MCA21 Signatory Details',
        });
      } else if (dir.name && !seen.has(`DIR_NAME:${dir.name.toUpperCase()}`)) {
        seen.add(`DIR_NAME:${dir.name.toUpperCase()}`);
        anchors.push({
          id: `anc_name_${Math.random().toString(36).substring(2, 6)}`,
          type: 'DIRECTOR_NAME',
          value: dir.name.trim(),
          label: `Signatory Name: ${dir.name}`,
          provenance: 'MCA21 Filing Record',
        });
      }
    }

    // 4. Anchor: Registered Office Address
    const address = vendor.profile?.registeredOffice;
    if (address && address.trim().length > 10 && !seen.has(`ADDR:${address.trim().toUpperCase()}`)) {
      seen.add(`ADDR:${address.trim().toUpperCase()}`);
      anchors.push({
        id: `anc_addr_${Math.random().toString(36).substring(2, 6)}`,
        type: 'REGISTERED_ADDRESS',
        value: address.trim(),
        label: `Registered Office: ${address}`,
        provenance: 'RoC Registered Office Address Record',
      });
    }

    return anchors;
  }

  /**
   * Executes Layer 2 Entity Tracing with depth 1 limit and bounded candidate counts.
   */
  public async traceRelatedEntities(
    vendor: {
      id?: string;
      canonicalName: string;
      cin?: string | null;
      gstin?: string | null;
      profile?: ResolvedCompanyProfile | null;
    },
    findings: RiskFinding[] = [],
    options: EntityTracingOptions = {}
  ): Promise<{
    relationships: EntityRelationship[];
    graph: EntityGraph;
    anchors: EntityAnchor[];
  }> {
    const vendorId = vendor.id || generateStableId('ven');
    const maxDepth = Math.min(options.maxDepth || 1, 1); // Strictly depth 1
    const maxCandidatesPerAnchor = options.maxCandidatesPerAnchor || 10;
    const useMock = Boolean(options.useMock);
    const scenario = options.mockScenario || 'STANDARD';

    // 1. Extract Anchors
    let anchors: EntityAnchor[] = [];
    if (scenario !== 'NO_ANCHORS') {
      anchors = this.extractAnchors(vendor, findings);
    }

    if (anchors.length === 0) {
      const emptyGraph: EntityGraph = {
        nodes: [
          {
            id: vendorId,
            name: vendor.canonicalName,
            nodeType: 'PRIMARY_VENDOR',
            cin: vendor.cin || null,
            matchConfidence: 'EXACT',
            provenance: 'Investigation Target',
          },
        ],
        edges: [],
        anchorsUsed: [],
        disclaimer: TRACING_DISCLAIMER,
        stats: {
          totalRelatedEntities: 0,
          totalDirectors: 0,
          strongIdentifierMatches: 0,
          candidateMatches: 0,
          depth: maxDepth,
          maxCandidatesLimit: maxCandidatesPerAnchor,
        },
      };

      return {
        relationships: [],
        graph: emptyGraph,
        anchors: [],
      };
    }

    // 2. Resolve Relationships per anchor
    let relationships: EntityRelationship[] = [];

    if (useMock) {
      relationships = this.generateMockRelationships(vendor, vendorId, anchors, scenario, maxCandidatesPerAnchor);
    } else {
      relationships = await this.discoverLiveRelationships(vendor, vendorId, anchors, maxCandidatesPerAnchor, options.signal);
    }

    // 3. Deduplicate duplicate target companies
    const seenTargetCins = new Set<string>();
    const seenTargetNames = new Set<string>();
    const deduplicatedRelationships: EntityRelationship[] = [];

    for (const rel of relationships) {
      const cinKey = rel.targetCin ? rel.targetCin.toUpperCase() : null;
      const nameKey = rel.targetEntityName.toUpperCase().trim();

      if (cinKey && seenTargetCins.has(cinKey)) continue;
      if (!cinKey && seenTargetNames.has(nameKey)) continue;

      if (cinKey) seenTargetCins.add(cinKey);
      seenTargetNames.add(nameKey);
      deduplicatedRelationships.push(rel);
    }

    // 4. Construct Stable Graph
    const graph = this.buildEntityGraph(vendor, vendorId, anchors, deduplicatedRelationships, maxDepth, maxCandidatesPerAnchor);

    return {
      relationships: deduplicatedRelationships,
      graph,
      anchors,
    };
  }

  /**
   * Generates deterministic relationships for mock/test scenarios.
   */
  private generateMockRelationships(
    vendor: { canonicalName: string; cin?: string | null },
    vendorId: string,
    anchors: EntityAnchor[],
    scenario: string,
    maxLimit: number
  ): EntityRelationship[] {
    const list: EntityRelationship[] = [];
    const now = new Date().toISOString();

    if (scenario === 'EXACT_DIN' || scenario === 'STANDARD') {
      const dinAnchor = anchors.find((a) => a.type === 'DIN') || { value: '99999999', label: 'Aarav Patel (Fictional Director)' };
      list.push({
        id: generateStableId('rel'),
        sourceEntityId: vendorId,
        sourceEntityName: vendor.canonicalName,
        targetEntityId: 'ven_rel_synthetic_company_1',
        targetEntityName: 'Nova Horizon Logistics Private Limited (SYNTHETIC DEMO)',
        targetCin: 'U99999XX2024PTC999998',
        relationshipType: 'SHARED_DIRECTOR',
        matchMethod: 'EXACT_DIN',
        strength: 'strong_identifier',
        evidenceIds: ['evi_din_00000001'],
        sourceUrls: ['https://mca-fixture.vendortrace.invalid/director/99999999'],
        provenance: 'Synthetic IndiaCos/MCA21 relationship fixture',
        details: {
          din: dinAnchor.value,
          directorName: 'Aarav Patel (Fictional Director)',
          designation: 'Chairman & Director',
          appointmentDate: '2024-01-12',
          notes: 'Synthetic relationship fixture illustrating a registry-record link; no real-world directorship is being asserted.',
        },
        lightweightL1Status: 'UNKNOWN',
        lightweightL1Note: 'Synthetic relationship fixture only; a separate Layer 1 risk scan has not been run.',
        leadDisclaimer: TRACING_DISCLAIMER,
        createdAt: now,
      });

      list.push({
        id: generateStableId('rel'),
        sourceEntityId: vendorId,
        sourceEntityName: vendor.canonicalName,
        targetEntityId: 'ven_rel_synthetic_company_2',
        targetEntityName: 'Cedarline Energy Services Limited (SYNTHETIC DEMO)',
        targetCin: 'U99999XX2024PTC999997',
        relationshipType: 'SHARED_DIRECTOR',
        matchMethod: 'EXACT_DIN',
        strength: 'strong_identifier',
        evidenceIds: ['evi_din_00000001'],
        sourceUrls: ['https://mca-fixture.vendortrace.invalid/director/99999999'],
        provenance: 'Synthetic IndiaCos/MCA21 relationship fixture',
        details: {
          din: dinAnchor.value,
          directorName: 'Aarav Patel (Fictional Director)',
          designation: 'Director',
          appointmentDate: '2024-02-23',
          notes: 'Synthetic directorship fixture. A real registry record is not being asserted.',
        },
        lightweightL1Status: 'UNKNOWN',
        lightweightL1Note: 'Synthetic relationship fixture only; a separate Layer 1 risk scan has not been run.',
        leadDisclaimer: TRACING_DISCLAIMER,
        createdAt: now,
      });
    }

    if (scenario === 'SHARED_ADDRESS' || scenario === 'STANDARD') {
      const addr = '99 Fictional Demo Avenue, Test City, XX 000000';
      list.push({
        id: generateStableId('rel'),
        sourceEntityId: vendorId,
        sourceEntityName: vendor.canonicalName,
        targetEntityId: 'ven_rel_synthetic_address_company',
        targetEntityName: 'Orchid Shared Office Services Limited (SYNTHETIC DEMO)',
        targetCin: 'U99999XX2024PTC999996',
        relationshipType: 'SHARED_ADDRESS',
        matchMethod: 'REGISTERED_OFFICE_STRING_MATCH',
        strength: 'same_address_candidate',
        evidenceIds: ['evi_addr_mca'],
        sourceUrls: ['https://mca-fixture.vendortrace.invalid/company/U99999XX2024PTC999996'],
        provenance: 'Synthetic RoC registered-office fixture',
        details: {
          commonAddress: addr,
          notes: 'Synthetic shared-address fixture. No real registered-office relationship is being asserted.',
        },
        lightweightL1Status: 'UNKNOWN',
        lightweightL1Note: 'Synthetic shared-address fixture only; a separate Layer 1 risk scan has not been run.',
        leadDisclaimer: TRACING_DISCLAIMER,
        createdAt: now,
      });
    }

    if (scenario === 'SAME_NAME_NO_DIN') {
      // Unverified same name without DIN -> must be classified as same_name_candidate (NOT merged)
      list.push({
        id: generateStableId('rel'),
        sourceEntityId: vendorId,
        sourceEntityName: vendor.canonicalName,
        targetEntityId: 'ven_rel_apex_logistics',
        targetEntityName: 'Apex Horizon Logistics Services Private Limited (SYNTHETIC DEMO)',
        targetCin: 'U99999XX2024PTC999995',
        relationshipType: 'SHARED_DIRECTOR',
        matchMethod: 'UNVERIFIED_DIRECTOR_NAME_MATCH',
        strength: 'same_name_candidate',
        evidenceIds: ['evi_name_match_01'],
        sourceUrls: ['https://mca-fixture.vendortrace.invalid/company/U99999XX2024PTC999995'],
        provenance: 'Synthetic Company Registry Fixture',
        details: {
          directorName: 'Kiran Demo (Fictional Director)',
          notes: 'Director name match only. No matching 8-digit Director Identification Number (DIN) confirmed.',
        },
        lightweightL1Status: 'UNKNOWN',
        lightweightL1Note: 'Related-entity review: Similar director name cannot be confirmed without DIN verification.',
        leadDisclaimer: 'Unverified name match: Individuals with common Indian names must not be conflated without DIN proof.',
        createdAt: now,
      });
    }

    if (scenario === 'DUPLICATE_ENTITIES') {
      // Intentionally insert duplicated records to test deduplication
      const duplicateRel: EntityRelationship = {
        id: generateStableId('rel'),
        sourceEntityId: vendorId,
        sourceEntityName: vendor.canonicalName,
        targetEntityId: 'ven_rel_synthetic_company_1',
        targetEntityName: 'Nova Horizon Logistics Private Limited (SYNTHETIC DEMO)',
        targetCin: 'U99999XX2024PTC999998',
        relationshipType: 'SHARED_DIRECTOR',
        matchMethod: 'EXACT_DIN',
        strength: 'strong_identifier',
        evidenceIds: ['evi_din_00000001'],
        sourceUrls: ['https://mca-fixture.vendortrace.invalid/director/99999999'],
        provenance: 'Synthetic IndiaCos/MCA21 relationship fixture',
        details: {
          din: '00000001',
          directorName: 'Aarav Patel (Fictional Director)',
        },
        lightweightL1Status: 'UNKNOWN',
        leadDisclaimer: TRACING_DISCLAIMER,
        createdAt: now,
      };
      list.push(duplicateRel, duplicateRel);
    }

    if (scenario === 'LIMIT_EXCEEDED') {
      // Create 15 items to test boundary truncation at maxCandidatesPerAnchor
      for (let i = 1; i <= 15; i++) {
        list.push({
          id: generateStableId('rel'),
          sourceEntityId: vendorId,
          sourceEntityName: vendor.canonicalName,
          targetEntityId: `ven_rel_candidate_${i}`,
          targetEntityName: `Synthetic Related Company ${i} Limited (SYNTHETIC DEMO)`,
          targetCin: `U99999XX2024PTC${String(999900 + i).padStart(6, '0')}`,
          relationshipType: 'SHARED_DIRECTOR',
          matchMethod: 'EXACT_DIN',
          strength: 'strong_identifier',
          evidenceIds: [`evi_${i}`],
          sourceUrls: ['https://mca-fixture.vendortrace.invalid/'],
          provenance: 'Synthetic registry fixture',
          details: {
            din: '00000001',
          },
          lightweightL1Status: 'UNKNOWN',
          leadDisclaimer: TRACING_DISCLAIMER,
          createdAt: now,
        });
      }
    }

    // Apply configurable limit per anchor
    return list.slice(0, maxLimit);
  }

  /**
   * Executes live lookups across IndiaCos / TinyFish endpoints.
   */
  private async discoverLiveRelationships(
    vendor: { canonicalName: string; cin?: string | null; profile?: ResolvedCompanyProfile | null },
    vendorId: string,
    anchors: EntityAnchor[],
    maxLimit: number,
    signal?: AbortSignal
  ): Promise<EntityRelationship[]> {
    const list: EntityRelationship[] = [];
    const now = new Date().toISOString();

    for (const anchor of anchors) {
      if (signal?.aborted) break;
      if (list.length >= maxLimit) break;

      if (anchor.type === 'DIN' && indiacos.isConfigured()) {
        try {
          const dinRes = await indiacos.lookupByDIN(anchor.value, { signal, timeoutMs: 45000 });
          if (dinRes.success && dinRes.profile) {
            const companies = dinRes.profile.associatedCompanies || [];
            for (const comp of companies) {
              if (list.length >= maxLimit) break;
              if (comp.cin && vendor.cin && comp.cin.toUpperCase() === vendor.cin.toUpperCase()) continue;

              // Only a registry-record DIN link is a strong match. IndiaCos also returns
              // name-match links, which are discovery leads and must never be upgraded.
              const isRecordLink = comp.linkageMethod === 'record';
              const isNameMatch = comp.linkageMethod === 'name_match';
              const strength: RelationshipStrength = isRecordLink
                ? 'strong_identifier'
                : isNameMatch
                ? 'same_name_candidate'
                : 'unverified';
              const sourceUrls = comp.sourceUrl
                ? [comp.sourceUrl]
                : dinRes.profile.sourceUrl
                ? [dinRes.profile.sourceUrl]
                : [];

              list.push({
                id: generateStableId('rel'),
                sourceEntityId: vendorId,
                sourceEntityName: vendor.canonicalName,
                targetEntityId: `ven_rel_${comp.cin}`,
                targetEntityName: comp.name,
                targetCin: comp.cin,
                relationshipType: 'SHARED_DIRECTOR',
                matchMethod: isRecordLink
                  ? 'EXACT_DIN_RECORD_LINK'
                  : isNameMatch
                  ? 'NAME_MATCH_FROM_DIRECTOR_RESULTS'
                  : 'DIRECTOR_LINKAGE_UNSPECIFIED',
                strength,
                evidenceIds: [`evi_din_${anchor.value}`],
                sourceUrls,
                provenance: 'IndiaCos Director API (MCA21 Registry)',
                details: {
                  din: anchor.value,
                  directorName: anchor.label.split(':')[1]?.trim() || dinRes.profile.canonicalName || 'Director',
                  designation: comp.designation,
                  appointmentDate: comp.appointmentDate,
                  notes: isRecordLink
                    ? 'IndiaCos marks this directorship as linked by a registry record; the related company still requires its own risk checks.'
                    : isNameMatch
                    ? 'IndiaCos marks this directorship as a name match, not a confirmed registry link. Verify the identity before relying on this relationship.'
                    : 'The provider did not expose the linkage method. Treat this as an unverified lead.' ,
                },
                lightweightL1Status: 'UNKNOWN',
                lightweightL1Note: 'Related entity discovered; a separate lightweight L1 risk scan has not yet been completed. Do not interpret this relationship as a risk finding.',
                leadDisclaimer: TRACING_DISCLAIMER,
                createdAt: now,
              });
            }
          }
        } catch {
          // Gracefully continue to the next anchor on provider error; absence of a result is not a clean result.
        }
      } else if (anchor.type === 'REGISTERED_ADDRESS' && indiacos.isConfigured()) {
        try {
          const addressRes = await indiacos.searchBusinessesAtAddress(anchor.value, { signal, timeoutMs: 45000 });
          for (const candidate of addressRes.candidates) {
            if (list.length >= maxLimit) break;
            if (candidate.identifierType !== 'CIN') continue;
            const candidateCin = candidate.identifierValue.toUpperCase();
            if (vendor.cin && candidateCin === vendor.cin.toUpperCase()) continue;

            list.push({
              id: generateStableId('rel'),
              sourceEntityId: vendorId,
              sourceEntityName: vendor.canonicalName,
              targetEntityId: `ven_rel_${candidateCin}`,
              targetEntityName: candidate.canonicalName,
              targetCin: candidateCin,
              relationshipType: 'SHARED_ADDRESS',
              matchMethod: 'SHARED_ADDRESS_ID',
              strength: 'same_address_candidate',
              evidenceIds: [`evi_address_${anchor.id}`],
              sourceUrls: [candidate.sourceUrl || addressRes.sourceUrl].filter((url): url is string => Boolean(url)),
              provenance: 'IndiaCos Address Search and Office Registry',
              details: {
                commonAddress: addressRes.addressLabel || anchor.value,
                notes: 'Shared registered-address lead only. It does not establish common ownership, control, liability, or misconduct.',
              },
              lightweightL1Status: 'UNKNOWN',
              lightweightL1Note: 'Related entity discovered by shared address; a separate lightweight L1 risk scan has not yet been completed.',
              leadDisclaimer: TRACING_DISCLAIMER,
              createdAt: now,
            });
          }
        } catch {
          // Address search is best-effort. Provider failures must not become negative findings.
        }
      }
    }

    return list.slice(0, maxLimit);
  }

  /**
   * Builds the EntityGraph node and edge contracts with provenance and disclaimers.
   */
  private buildEntityGraph(
    vendor: { canonicalName: string; cin?: string | null },
    vendorId: string,
    anchors: EntityAnchor[],
    relationships: EntityRelationship[],
    depth: number,
    maxLimit: number
  ): EntityGraph {
    const nodes: EntityGraphNode[] = [];
    const edges: EntityGraphEdge[] = [];
    const seenNodeIds = new Set<string>();

    // 1. Primary Vendor Node
    nodes.push({
      id: vendorId,
      name: vendor.canonicalName,
      nodeType: 'PRIMARY_VENDOR',
      cin: vendor.cin || null,
      matchConfidence: 'EXACT',
      provenance: 'Investigation Target (Canonical Profile)',
      lightweightReviewStatus: 'VERIFIED',
    });
    seenNodeIds.add(vendorId);

    let strongMatches = 0;
    let candidateMatches = 0;
    const seenDirectors = new Set<string>();

    for (const rel of relationships) {
      if (rel.strength === 'strong_identifier' || rel.strength === 'registry_link') {
        strongMatches++;
      } else {
        candidateMatches++;
      }

      // Add Director / Intermediate Node if available
      let intermediateId: string | null = null;
      if (rel.details.din) {
        intermediateId = `node_din_${rel.details.din}`;
        if (!seenNodeIds.has(intermediateId)) {
          seenNodeIds.add(intermediateId);
          seenDirectors.add(rel.details.din);
          nodes.push({
            id: intermediateId,
            name: rel.details.directorName || `Director DIN ${rel.details.din}`,
            nodeType: 'DIRECTOR',
            din: rel.details.din,
            matchConfidence: 'EXACT_DIN',
            provenance: 'Ministry of Corporate Affairs Signatory Register',
          });

          // Edge: Primary -> Director
          edges.push({
            id: generateStableId('rel'),
            source: vendorId,
            target: intermediateId,
            relationshipType: 'SHARED_DIRECTOR',
            strength: 'strong_identifier',
            label: `Director (${rel.details.designation || 'Signatory'})`,
            evidenceIds: rel.evidenceIds,
            sourceUrls: rel.sourceUrls,
            provenance: rel.provenance,
            disclaimer: TRACING_DISCLAIMER,
          });
        }
      }

      // Add Target Company Node
      const targetNodeId = rel.targetEntityId;
      if (!seenNodeIds.has(targetNodeId)) {
        seenNodeIds.add(targetNodeId);
        nodes.push({
          id: targetNodeId,
          name: rel.targetEntityName,
          nodeType: 'RELATED_COMPANY',
          cin: rel.targetCin,
          matchConfidence: rel.strength === 'strong_identifier' ? 'HIGH' : 'PROBABLE',
          provenance: rel.provenance,
          lightweightReviewStatus: rel.lightweightL1Status || 'UNKNOWN',
          lightweightReviewNote: rel.lightweightL1Note,
        });
      }

      // Edge: Connecting to Target Company
      edges.push({
        id: rel.id,
        source: intermediateId || vendorId,
        target: targetNodeId,
        relationshipType: rel.relationshipType,
        strength: rel.strength,
        label: rel.strength === 'strong_identifier'
          ? `Directorship (DIN ${rel.details.din || 'Verified'})`
          : rel.strength === 'same_address_candidate'
          ? 'Common Registered Address Lead'
          : 'Candidate Director Name Match',
        evidenceIds: rel.evidenceIds,
        sourceUrls: rel.sourceUrls,
        provenance: rel.provenance,
        disclaimer: rel.leadDisclaimer,
      });
    }

    return {
      nodes,
      edges,
      anchorsUsed: anchors,
      disclaimer: TRACING_DISCLAIMER,
      stats: {
        totalRelatedEntities: relationships.length,
        totalDirectors: seenDirectors.size,
        strongIdentifierMatches: strongMatches,
        candidateMatches,
        depth,
        maxCandidatesLimit: maxLimit,
      },
    };
  }
}

export const entityTracingService = new EntityTracingService();
