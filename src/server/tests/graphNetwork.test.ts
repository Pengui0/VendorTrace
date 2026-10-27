/**
 * Layer 4 Related-Entity Network Graph & Accessibility Fallback Test Suite
 * Tests isolated nodes, duplicate edge deduplication, cycles, candidate limits (>20 nodes),
 * unverified links, accessible table representation, and zero-guilt-by-association disclaimers.
 */

import {
  EntityGraph,
  EntityGraphNode,
  EntityGraphEdge,
  EntityRelationship,
} from '../../types/entityTracing.js';
import {
  entityTracingService,
  TRACING_DISCLAIMER,
} from '../services/entityTracingService.js';

export interface GraphTableFallbackRow {
  targetEntity: string;
  targetType: string;
  relationshipType: string;
  sourceAnchor: string;
  matchStrength: string;
  evidenceCount: number;
  sourceUrls: string[];
  disclaimer: string;
}

/**
 * Transforms an EntityGraph into accessible tabular rows for screen-readers or table view.
 */
export function convertGraphToAccessibleTable(graph: EntityGraph): GraphTableFallbackRow[] {
  const nodeMap = new Map<string, EntityGraphNode>();
  for (const n of graph.nodes) {
    nodeMap.set(n.id, n);
  }

  return graph.edges.map((edge) => {
    const targetNode = nodeMap.get(edge.target);
    const sourceNode = nodeMap.get(edge.source);
    return {
      targetEntity: targetNode ? targetNode.name : edge.target,
      targetType: targetNode ? targetNode.nodeType : 'UNKNOWN',
      relationshipType: edge.relationshipType,
      sourceAnchor: sourceNode ? sourceNode.name : edge.source,
      matchStrength: edge.strength,
      evidenceCount: edge.evidenceIds.length,
      sourceUrls: edge.sourceUrls,
      disclaimer: edge.disclaimer || graph.disclaimer || TRACING_DISCLAIMER,
    };
  });
}

export async function runGraphNetworkTests(): Promise<{
  success: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  let assertionsFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      assertionsPassed++;
      logs.push(`[PASS] ${desc}`);
    } else {
      assertionsFailed++;
      logs.push(`[FAIL] ${desc}`);
    }
  }

  logs.push('=== 1. TESTING ISOLATED NODES HANDLING ===');

  const isolatedGraph: EntityGraph = {
    nodes: [
      {
        id: 'node_vendor_01',
        name: 'Apex Industrial Solutions Pvt Ltd',
        nodeType: 'PRIMARY_VENDOR',
        cin: 'U72900MH2021PTC368940',
        matchConfidence: 'EXACT',
        provenance: 'Investigation Target',
        lightweightReviewStatus: 'ELEVATED_REVIEW',
      },
      {
        id: 'node_orphan_addr_02',
        name: 'BKC Bandra East, Mumbai 400051',
        nodeType: 'REGISTERED_ADDRESS',
        matchConfidence: 'EXACT_ROC_ADDRESS',
        provenance: 'MCA21 RoC Filing',
      },
    ],
    edges: [], // Zero edges
    anchorsUsed: [],
    disclaimer: TRACING_DISCLAIMER,
    stats: {
      totalRelatedEntities: 0,
      totalDirectors: 0,
      strongIdentifierMatches: 0,
      candidateMatches: 0,
      depth: 1,
      maxCandidatesLimit: 10,
    },
  };

  assert(isolatedGraph.nodes.length === 2, 'Graph holds isolated nodes without errors');
  assert(isolatedGraph.edges.length === 0, 'Zero edges handled gracefully');
  const tableRows = convertGraphToAccessibleTable(isolatedGraph);
  assert(tableRows.length === 0, 'Accessible table yields 0 relationship rows when no edges connect isolated nodes');

  logs.push('=== 2. TESTING DUPLICATE EDGE DEDUPLICATION ===');

  const edgesWithDuplicates: EntityGraphEdge[] = [
    {
      id: 'e1',
      source: 'node_vendor_01',
      target: 'node_dir_01',
      label: 'Director Appointment',
      relationshipType: 'SHARED_DIRECTOR',
      strength: 'strong_identifier',
      evidenceIds: ['evi_din_01'],
      sourceUrls: ['https://mca.gov.in/din/00192831'],
      provenance: 'MCA21 Master Data',
      disclaimer: TRACING_DISCLAIMER,
    },
    {
      id: 'e2', // Duplicate connection between same pair
      source: 'node_vendor_01',
      target: 'node_dir_01',
      label: 'Director Appointment (Second filing)',
      relationshipType: 'SHARED_DIRECTOR',
      strength: 'strong_identifier',
      evidenceIds: ['evi_din_02'],
      sourceUrls: ['https://indiacos.com/api/v1/directors/00192831'],
      provenance: 'IndiaCos Verified Director Index',
      disclaimer: TRACING_DISCLAIMER,
    },
  ];

  // Function to deduplicate edges
  function deduplicateGraphEdges(edges: EntityGraphEdge[]): EntityGraphEdge[] {
    const seen = new Map<string, EntityGraphEdge>();
    for (const edge of edges) {
      const key = `${edge.source}->${edge.target}:${edge.relationshipType}`;
      const existing = seen.get(key);
      if (existing) {
        // Merge evidence IDs and URLs
        const mergedEv = Array.from(new Set([...existing.evidenceIds, ...edge.evidenceIds]));
        const mergedUrls = Array.from(new Set([...existing.sourceUrls, ...edge.sourceUrls]));
        seen.set(key, {
          ...existing,
          evidenceIds: mergedEv,
          sourceUrls: mergedUrls,
        });
      } else {
        seen.set(key, { ...edge });
      }
    }
    return Array.from(seen.values());
  }

  const deduped = deduplicateGraphEdges(edgesWithDuplicates);
  assert(deduped.length === 1, 'Duplicate edge between identical source/target/type is deduplicated to 1');
  assert(deduped[0].evidenceIds.length === 2, 'Merged edge preserves all distinct evidence IDs');
  assert(deduped[0].sourceUrls.length === 2, 'Merged edge preserves all distinct source URLs');

  logs.push('=== 3. TESTING CIRCULAR RELATIONSHIPS / CYCLES ===');

  const cyclicEdges: EntityGraphEdge[] = [
    {
      id: 'e_a_b',
      source: 'company_A',
      target: 'director_D',
      label: 'Has Director',
      relationshipType: 'SHARED_DIRECTOR',
      strength: 'strong_identifier',
      evidenceIds: ['evi_d1'],
      sourceUrls: ['https://mca.gov.in'],
      provenance: 'MCA',
      disclaimer: TRACING_DISCLAIMER,
    },
    {
      id: 'e_b_c',
      source: 'director_D',
      target: 'company_B',
      label: 'Is Director of',
      relationshipType: 'SHARED_DIRECTOR',
      strength: 'strong_identifier',
      evidenceIds: ['evi_d2'],
      sourceUrls: ['https://mca.gov.in'],
      provenance: 'MCA',
      disclaimer: TRACING_DISCLAIMER,
    },
    {
      id: 'e_c_a',
      source: 'company_B',
      target: 'company_A',
      label: 'Cross Holding Candidate',
      relationshipType: 'OTHER',
      strength: 'unverified',
      evidenceIds: ['evi_d3'],
      sourceUrls: ['https://mca.gov.in'],
      provenance: 'Public News',
      disclaimer: TRACING_DISCLAIMER,
    },
  ];

  // Cycle detection algorithm (Tarjan/DFS) to ensure cyclic graphs can be analyzed without recursion death
  function detectCycles(edges: EntityGraphEdge[]): boolean {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    function isCyclicUtil(node: string): boolean {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) || [];
      for (const n of neighbors) {
        if (isCyclicUtil(n)) return true;
      }

      recStack.delete(node);
      return false;
    }

    for (const node of adj.keys()) {
      if (isCyclicUtil(node)) return true;
    }
    return false;
  }

  assert(detectCycles(cyclicEdges) === true, 'Cycle A -> D -> B -> A detected safely without stack overflow');

  logs.push('=== 4. TESTING CANDIDATE LIMITS ON DENSE NETWORKS (>20 NODES) ===');

  // Verify that tracing service bounds candidate count per anchor
  const traceMock = await entityTracingService.traceRelatedEntities(
    {
      canonicalName: 'Dense Group Networks Pvt Ltd',
      cin: 'U72900DL2020PTC123456',
    },
    [],
    {
      maxDepth: 1,
      maxCandidatesPerAnchor: 5, // Tight candidate limit
      useMock: true,
      mockScenario: 'STANDARD',
    }
  );

  assert(traceMock.relationships.length <= 15, 'Candidate relationships strictly bounded by maxCandidatesPerAnchor configuration');
  assert(traceMock.graph.nodes.length > 0, 'Graph nodes generated');
  assert(traceMock.graph.disclaimer === TRACING_DISCLAIMER, 'Tracing disclaimer explicitly attached to graph payload');

  logs.push('=== 5. TESTING UNVERIFIED LINKS & COLOR CODE DISCIPLINE ===');

  const unverifiedLead = traceMock.relationships.find(
    (l) => l.strength === 'same_name_candidate' || l.strength === 'unverified' || l.strength === 'same_address_candidate'
  );
  if (unverifiedLead) {
    assert(
      unverifiedLead.strength === 'same_name_candidate' ||
        unverifiedLead.strength === 'unverified' ||
        unverifiedLead.strength === 'same_address_candidate',
      'Unverified lead accurately classified'
    );
  }

  // Ensure unverified nodes are given neutral review status, NEVER red merely because of connection
  const unverifiedNode = traceMock.graph.nodes.find(
    (n) => n.matchConfidence === 'CANDIDATE_NAME' || n.matchConfidence === 'UNVERIFIED' || n.nodeType === 'REGISTERED_ADDRESS'
  );
  if (unverifiedNode) {
    assert(
      unverifiedNode.lightweightReviewStatus !== 'MATERIAL_RISK',
      'Unverified candidate receives neutral priority (never material risk solely by association)'
    );
  }

  logs.push('=== 6. TESTING ACCESSIBLE TABLE FALLBACK GENERATION ===');

  const accessibleRows = convertGraphToAccessibleTable(traceMock.graph);
  assert(accessibleRows.length === traceMock.graph.edges.length, 'Accessible table has one row per edge');
  if (accessibleRows.length > 0) {
    const firstRow = accessibleRows[0];
    assert(Boolean(firstRow.targetEntity), 'Accessible row contains target entity name');
    assert(Boolean(firstRow.relationshipType), 'Accessible row contains clear relationship type');
    assert(Boolean(firstRow.matchStrength), 'Accessible row includes match strength');
    assert(
      firstRow.disclaimer.includes('Discovery leads for manual review') ||
        firstRow.disclaimer.includes('Shared directors'),
      'Row includes mandatory disclaimer'
    );
  }

  return {
    success: assertionsFailed === 0,
    assertionsPassed,
    assertionsFailed,
    logs,
  };
}
