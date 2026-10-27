import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { store } from './src/server/storage/store.js';
import { getInvestigationIdentityKey } from './src/utils/investigationIdentity.js';
import { validateInvestigationComparison } from './src/utils/investigationComparison.js';
import { db, repositoryManager } from './src/server/repositories/index.js';
import { runRepositoryVerification } from './src/server/tests/repositoryVerification.test.js';
import { indiacos } from './src/server/providers/indiacos.js';
import { tinyfish } from './src/server/providers/tinyfish.js';
import { detectIdentifierKind } from './src/server/providers/identifierDetector.js';
import { Finding, Investigation, RelatedEntityLead, SourceConnector } from './src/types/vendor.js';
import { Vendor, RiskVerdict } from './src/types/domain.js';
import { normalizeCIN, normalizeGSTIN, generateStableId } from './src/server/validation/domainValidators.js';
import { discoveryService } from './src/server/services/discoveryService.js';
import { runDiscoveryOrchestrationTests } from './src/server/tests/discoveryOrchestration.test.js';
import { runRiskFindingValidationTests } from './src/server/tests/riskFindingValidation.test.js';
import { RiskFinding } from './src/types/riskFinding.js';
import { tinyfishStreamingClient, SanitizedStreamEvent } from './src/server/providers/tinyfishStreamingClient.js';
import { entityTracingService, TRACING_DISCLAIMER } from './src/server/services/entityTracingService.js';
import { runTinyFishStreamingTests } from './src/server/tests/tinyfishStreaming.test.js';
import { FICTIONAL_CIN } from './src/server/demo/demoDataset.js';
import { runEntityTracingTests } from './src/server/tests/entityTracing.test.js';
import { crossValidationService } from './src/server/services/crossValidationService.js';
import { getAssessmentDisplayValues, getAssessmentTrend } from './src/utils/assessmentDisplay.js';
import { runCrossValidationTests } from './src/server/tests/crossValidation.test.js';
import { changeDetectionService } from './src/server/services/changeDetectionService.js';
import { runChangeDetectionTests } from './src/server/tests/changeDetection.test.js';
import { runGraphNetworkTests } from './src/server/tests/graphNetwork.test.js';
import { exportService } from './src/server/services/exportService.js';
import { runExportTests } from './src/server/tests/exportService.test.js';
import { investigationFilterService } from './src/server/services/investigationFilterService.js';
import { runFilterTests } from './src/server/tests/investigationFilter.test.js';
import {
  securityService,
  ssrfGuardMiddleware,
  requestSizeLimitMiddleware,
  globalErrorSanitizer,
} from './src/server/security/securityService.js';
import { runSecurityHardeningTests } from './src/server/tests/securityHardening.test.js';

const app = express();
const asyncHandler = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
const PORT = Number(process.env.PORT) || 3000;
const activeInvestigationControllers = new Map<string, AbortController>();
const configuredLimit = (name: string, fallback: number, maximum: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.trunc(parsed), maximum)
    : fallback;
};

function isClientInvestigationSnapshot(value: unknown, expectedId: string): value is Investigation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Investigation>;
  return item.id === expectedId
    && typeof item.targetName === 'string'
    && ['CIN', 'GSTIN', 'PAN', 'DIN', 'NAME'].includes(item.identifierType as string)
    && typeof item.identifierValue === 'string'
    && typeof item.createdAt === 'string'
    && Array.isArray(item.findings)
    && Array.isArray(item.sourcesChecked)
    && Array.isArray(item.relatedLeads)
    && Boolean(item.findingsCount && typeof item.findingsCount === 'object');
}

function findInvestigationSnapshot(id: string, submitted?: unknown): Investigation | undefined {
  // Prefer the server's authoritative copy. Browser-persisted reports are a fallback
  // for development workspaces whose server memory was reset between sessions.
  return store.getInvestigation(id)
    || (isClientInvestigationSnapshot(submitted, id) ? submitted : undefined);
}

app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const carriesSavedReport = /^\/api\/(?:reports\/[^/]+\/export\/(?:pdf|csv)|investigations\/[^/]+\/(?:rerun|trace|graph|assessment)|monitoring\/compare|investigations\/compare)$/.test(req.path);
  requestSizeLimitMiddleware(carriesSavedReport ? 2 * 1024 * 1024 : 51200)(req, res, next);
});


const normalizeDirectoryValue = (value: unknown): string =>
  String(value ?? '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const legacyRiskVerdict = (investigation?: Investigation): RiskVerdict => {
  if (!investigation) return 'UNKNOWN';
  if ((investigation.findingsCount?.materialRisk || 0) > 0) return 'MATERIAL_RISK';
  if ((investigation.findingsCount?.caution || 0) > 0 || (investigation.findingsCount?.requiresReview || 0) > 0) return 'CAUTION';
  if ((investigation.findingsCount?.verifiedClear || 0) > 0) return 'VERIFIED_CLEAR';
  return 'UNKNOWN';
};

/**
 * Combines the older deterministic demo directory with the active repository.
 * Repository records win on duplicates; no vendor count is fabricated.
 */
async function getUnifiedVendorDirectory(query?: string): Promise<Vendor[]> {
  const repositoryVendors: Vendor[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await db.vendors.search(undefined, { page, limit: 100 });
    repositoryVendors.push(...batch.items);
    if (!batch.hasMore) break;
  }

  const legacyInvestigations = store.getAllInvestigations();
  const legacyVendors: Vendor[] = store.getAllVendors().map((legacy) => {
    const related = legacyInvestigations
      .filter((inv) =>
        normalizeDirectoryValue(inv.targetName) === normalizeDirectoryValue(legacy.name) ||
        (legacy.cin && inv.identifierType === 'CIN' && inv.identifierValue.toUpperCase() === legacy.cin.toUpperCase()) ||
        (legacy.gstin && inv.identifierType === 'GSTIN' && inv.identifierValue.toUpperCase() === legacy.gstin.toUpperCase())
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = related[0];
    return {
      id: legacy.id,
      canonicalName: legacy.name,
      inputNames: [legacy.name],
      cin: legacy.cin,
      gstins: legacy.gstin ? [legacy.gstin] : [],
      pan: null,
      companyStatus: 'UNKNOWN',
      registeredAddress: null,
      sourceReference: 'Synthetic demo dataset (fictional entity)',
      firstSeenAt: legacy.addedAt,
      lastCheckedAt: latest?.completedAt || latest?.createdAt || legacy.addedAt,
      latestRiskStatus: legacyRiskVerdict(latest),
    };
  });

  const merged: Vendor[] = [];
  const seen = new Set<string>();
  for (const vendor of [...repositoryVendors, ...legacyVendors]) {
    const keys = [
      vendor.cin ? `cin:${vendor.cin.trim().toUpperCase()}` : '',
      ...vendor.gstins.map((gstin) => `gstin:${gstin.trim().toUpperCase()}`),
      `name:${normalizeDirectoryValue(vendor.canonicalName)}`,
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    merged.push(vendor);
  }

  const needle = normalizeDirectoryValue(query);
  const filtered = needle
    ? merged.filter((vendor) => [
        vendor.canonicalName,
        ...vendor.inputNames,
        vendor.cin,
        ...vendor.gstins,
        vendor.pan,
      ].some((value) => normalizeDirectoryValue(value).includes(needle)))
    : merged;

  return filtered.sort((a, b) => new Date(b.lastCheckedAt).getTime() - new Date(a.lastCheckedAt).getTime());
}

function mapProviderHealthToConnectorStatus(status: string): SourceConnector['status'] {
  if (status === 'LIVE') return 'HEALTHY';
  if (status === 'CONFIGURED') return 'CONFIGURED';
  if (status === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  if (status === 'DEMO_DATA') return 'CONFIGURED';
  return 'DEGRADED';
}

// API: Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'VendorTrace Core Engine',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    storage: repositoryManager.getStorageStatus(),
    connectors: {
      indiacosConfigured: indiacos.isConfigured(),
      tinyfishConfigured: tinyfish.isConfigured(),
    },
  });
});

import { integrationManager } from './src/server/providers/integrationManager.js';
import { runIntegrationTests } from './src/server/tests/integrations.test.js';

// API: Integrations Health (Never leaks secret values, headers, or full env vars)
app.get('/api/health/integrations', (_req: Request, res: Response) => {
  res.json({
    timestamp: new Date().toISOString(),
    integrations: integrationManager.getAllHealth(),
    instructions: integrationManager.getSetupInstructions(),
  });
});

// API: Test Connection for a specific provider
app.post('/api/integrations/test', asyncHandler(async (req: Request, res: Response) => {
  const { providerId, useMock } = req.body;
  if (providerId !== 'indiacos' && providerId !== 'tinyfish') {
    res.status(400).json({ error: 'providerId must be "indiacos" or "tinyfish"' });
    return;
  }

  const result = await integrationManager.testProviderConnection(providerId, Boolean(useMock));
  res.json({
    providerId,
    ...result,
  });
}));

// API: Run full integration verification test suite
app.post('/api/integrations/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runIntegrationTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Integration test suite failed' });
  }
});

import { resolutionService } from './src/server/providers/resolutionService.js';
import { registryCache } from './src/server/providers/cache.js';
import { runIndiacosResolutionTests } from './src/server/tests/indiacosResolution.test.js';

// API: Resolve Vendor by Company Name, CIN/LLPIN, or GSTIN
app.post('/api/integrations/indiacos/resolve', async (req: Request, res: Response) => {
  try {
    const { query, useMock, selectedCandidate, websiteUrl } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query or identifier is required' });
      return;
    }

    if (websiteUrl !== undefined && websiteUrl !== '') {
      try {
        const parsedWebsite = new URL(websiteUrl);
        if (!['http:', 'https:'].includes(parsedWebsite.protocol) || parsedWebsite.username || parsedWebsite.password) throw new Error('invalid');
      } catch {
        res.status(400).json({ error: 'Website URL must be a public HTTP or HTTPS URL.' });
        return;
      }
    }

    const result = await resolutionService.resolveVendor({
      query,
      useMock: Boolean(useMock),
      selectedCandidate,
      websiteUrl: typeof websiteUrl === 'string' ? websiteUrl.trim() : undefined,
    });

    // If successfully resolved, record or sync canonical vendor in repository
    if (result.success && result.profile) {
      const p = result.profile;
      const vendor = await db.vendors.findOrCreateByInput({
        canonicalName: p.canonicalName,
        cin: p.cin || null,
        gstin: p.gstins[0] || null,
        pan: p.pan || null,
        sourceReference: p.sourceUrl || 'IndiaCos Registry Resolution',
      });

      // Update additional fields
      await db.vendors.update(vendor.id, {
        companyStatus: p.companyStatus as any,
        registeredAddress: p.registeredOffice || null,
        lastCheckedAt: p.lastFetchedAt,
      });

      res.json({
        ...result,
        storedVendorId: vendor.id,
      });
      return;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Vendor resolution failed' });
  }
});

// API: IndiaCos Resolution Test Suite
app.post('/api/integrations/indiacos/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runIndiacosResolutionTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Resolution test suite failed' });
  }
});

// API: Registry Cache Statistics
app.get('/api/integrations/indiacos/cache-stats', (_req: Request, res: Response) => {
  res.json(registryCache.getStats());
});

import { tinyfishClient } from './src/server/providers/tinyfishClient.js';
import { redactSecrets } from './src/server/providers/httpClient.js';
import { runTinyFishIntegrationTests } from './src/server/tests/tinyfishTest.test.js';

// API: TinyFish Web Agent Baseline Extraction Test
app.post('/api/integrations/tinyfish/test', async (req: Request, res: Response) => {
  const clientAbortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) clientAbortController.abort();
  });

  try {
    const { url, goal, useMock, mockScenario, timeoutMs } = req.body || {};

    // Validate target URL format if provided
    let validatedUrl = 'https://mca.gov.in';
    if (url !== undefined && url !== null && url !== '') {
      if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        res.status(400).json({
          status: 'FAILED',
          result: null,
          elapsedMs: 0,
          diagnosticMessage: 'Invalid URL. Must be an absolute http:// or https:// web address.',
          isMock: Boolean(useMock),
        });
        return;
      }
      validatedUrl = url.trim();
    }

    if (!useMock) {
      const targetValidation = securityService.validateTargetUrl(validatedUrl);
      if (!targetValidation.isValid) {
        res.status(400).json({
          status: 'FAILED',
          result: null,
          elapsedMs: 0,
          diagnosticMessage: `URL rejected by source safety policy: ${targetValidation.reason}`,
          isMock: false,
        });
        return;
      }
    }

    const result = await tinyfishClient.runBaselineTest({
      url: validatedUrl,
      goal: typeof goal === 'string' && goal.trim().length > 0 ? goal.trim() : undefined,
      useMock: Boolean(useMock),
      mockScenario,
      timeoutMs: typeof timeoutMs === 'number' && timeoutMs > 0 && timeoutMs <= 120000 ? timeoutMs : 90000,
      signal: clientAbortController.signal,
    });

    if (!clientAbortController.signal.aborted) res.json(result);
  } catch (err: any) {
    if (!clientAbortController.signal.aborted) {
      res.status(500).json({
        status: 'FAILED',
        result: null,
        elapsedMs: 0,
        diagnosticMessage: `Server error executing TinyFish test: ${redactSecrets(err.message || String(err))}`,
        isMock: Boolean(req.body?.useMock),
      });
    }
  }
});

// API: TinyFish Integration Test Suite
app.post('/api/integrations/tinyfish/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runTinyFishIntegrationTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'TinyFish test suite failed' });
  }
});

// API: Repository & Persistence Status
app.get('/api/repository/status', (_req: Request, res: Response) => {
  res.json({
    status: repositoryManager.getStorageStatus(),
  });
});

// API: Trigger Synthetic Persistence Verification (CRUD test)
app.post('/api/repository/verify-persistence', async (_req: Request, res: Response) => {
  try {
    const report = await runRepositoryVerification();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Verification test failed' });
  }
});

// API: Source Connectors status; configuration is not presented as a successful health check.
app.get('/api/connectors', (_req: Request, res: Response) => {
  const providerHealth = integrationManager.getAllHealth();
  const connectors = store.getConnectors().map((connector) => {
    const provider = connector.id.startsWith('indiacos_')
      ? providerHealth.indiacos
      : connector.id === 'tinyfish_media'
      ? providerHealth.tinyfish
      : null;
    if (!provider) return connector;
    return {
      ...connector,
      isConfigured: provider.configured,
      status: mapProviderHealthToConnectorStatus(provider.status),
      lastChecked: provider.lastCheckedAt || '',
      latencyMs: provider.lastCheckedAt ? provider.latencyMs : undefined,
      coverageNote: provider.message || connector.coverageNote,
    };
  });
  res.json({ connectors });
});

// API: Workspace stats use the same unified directory as the Vendors page.
app.get('/api/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [vendors, repoInvestigationCount] = await Promise.all([
    getUnifiedVendorDirectory(),
    db.investigations.count(),
  ]);
  const baseStats = store.getStats();
  const connectorHealth = store.getConnectors().map((connector) => {
    const provider = connector.id.startsWith('indiacos_')
      ? integrationManager.getHealth('indiacos')
      : connector.id === 'tinyfish_media'
      ? integrationManager.getHealth('tinyfish')
      : null;
    return provider ? mapProviderHealthToConnectorStatus(provider.status) : connector.status;
  });
  const investigationCount = Math.max(store.getAllInvestigations().length, repoInvestigationCount);

  res.json({
    ...baseStats,
    totalVendorsStored: vendors.length,
    totalTrackedVendors: vendors.length,
    totalInvestigations: investigationCount,
    connectorsActive: connectorHealth.filter((status) => status === 'HEALTHY').length,
    connectorsTotal: connectorHealth.length,
  });
}));

// API: List investigations with pagination
app.get('/api/investigations', asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;

  const paginated = await db.investigations.listRecent({ page, limit });
  const inMemoryAll = store.getAllInvestigations();

  res.json({
    investigations: inMemoryAll.length > 0 ? inMemoryAll : paginated.items,
    pagination: {
      total: inMemoryAll.length || paginated.total,
      page,
      limit,
    },
  });
}));

app.get('/api/investigations/limits', (_req: Request, res: Response) => {
  res.json({
    overallTimeoutMs: configuredLimit('VENDORTRACE_INVESTIGATION_TIMEOUT_MS', 120000, 120000),
    agentTimeoutMs: configuredLimit('VENDORTRACE_AGENT_TIMEOUT_MS', 45000, 120000),
    liveStreamTimeoutMs: configuredLimit('VENDORTRACE_LIVE_STREAM_TIMEOUT_MS', 120000, 120000),
    maxAttempts: configuredLimit('VENDORTRACE_AGENT_MAX_ATTEMPTS', 2, 2),
  });
});

// API: Get investigation by ID
app.get('/api/investigations/:id', asyncHandler(async (req: Request, res: Response) => {
  const inv = store.getInvestigation(req.params.id) || (await db.investigations.findById(req.params.id));
  if (!inv) {
    res.status(404).json({ error: 'Investigation record not found' });
    return;
  }
  res.json(inv);
}));

// API: Delete the latest report and all retained runs for the same target identity.
app.delete('/api/investigations/:id', async (req: Request, res: Response) => {
  try {
    const target = store.getInvestigation(req.params.id) || await db.investigations.findById(req.params.id);
    const identitySource = target || req.body?.identity;
    if (!identitySource || typeof identitySource !== 'object') {
      res.status(404).json({ error: 'Investigation record not found.' });
      return;
    }
    const identityKey = getInvestigationIdentityKey(identitySource);
    const ids = new Set<string>([req.params.id]);
    for (const investigation of store.getAllInvestigations()) {
      if (getInvestigationIdentityKey(investigation) === identityKey) ids.add(investigation.id);
    }

    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const batch = await db.investigations.listRecent({ page, limit: 500 });
      for (const investigation of batch.items) {
        if (getInvestigationIdentityKey(investigation) === identityKey) ids.add(investigation.id);
      }
      hasMore = batch.hasMore;
      page += 1;
    }

    for (const id of ids) {
      const signals = await db.signals.findByInvestigationId(id);
      for (const signal of signals) {
        await db.signals.delete(signal.id);
        for (const evidenceId of signal.evidenceIds) await db.evidence.delete(evidenceId);
      }
      await db.investigations.delete(id);
      store.deleteInvestigation(id);
    }

    res.json({ success: true, deletedIds: [...ids] });
  } catch (error) {
    console.error('Failed to delete investigation history:', error);
    res.status(500).json({ error: 'Report history could not be deleted. Please try again.' });
  }
});

// API: Run or queue new due-diligence investigation with Layer 1 Discovery Engine
app.post('/api/investigations', async (req: Request, res: Response) => {
  let cleanupInvestigation = () => undefined;
  let investigationController: AbortController | null = null;
  let invId: string | null = null;
  try {
  const { targetName, identifierType, identifierValue, gstin: suppliedGSTIN, useMock, mockScenario, clientRunId, freshRun } = req.body;

  if (!targetName || typeof targetName !== 'string' || targetName.trim().length === 0) {
    res.status(400).json({ error: 'Company Name or target entity is required' });
    return;
  }

  const validTypes = ['CIN', 'GSTIN', 'PAN', 'DIN', 'NAME'];
  if (!identifierType || !validTypes.includes(identifierType)) {
    res.status(400).json({ error: `Invalid identifierType. Must be one of: ${validTypes.join(', ')}` });
    return;
  }
  if (clientRunId !== undefined && (typeof clientRunId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientRunId))) {
    res.status(400).json({ error: 'clientRunId must be 8-80 alphanumeric, underscore, or hyphen characters' });
    return;
  }

  const cleanVal = (identifierValue || '').trim().toUpperCase();
  const cleanTargetName = targetName.trim();
  const syntheticNames = /\b(synthetic|fictional|demo vendor|demo entity|placeholder|test entity|sample entity)\b/i.test(cleanTargetName);
  const syntheticIds = /\b(synthetic|fictional|placeholder|dummy|example|test|demo)\b/i.test(cleanVal) ||
    [FICTIONAL_CIN, 'AAA-9999', 'U72900MH2023PTC888888'].includes(cleanVal);
  if (!useMock && (syntheticNames || syntheticIds)) {
    res.status(400).json({ error: 'Live investigation is blocked for synthetic demo targets and placeholder identifiers.' });
    return;
  }
  const runId = clientRunId || generateStableId('inv');
  if (activeInvestigationControllers.has(runId)) {
    res.status(409).json({ error: 'An investigation with this runId is already active' });
    return;
  }
  invId = generateStableId('inv');
  const now = new Date().toISOString();
  const controller = new AbortController();
  investigationController = controller;
  const overallTimeoutMs = Math.max(configuredLimit('VENDORTRACE_INVESTIGATION_TIMEOUT_MS', 120000, 120000), 1000);
  const overallTimer = setTimeout(() => controller.abort('overall_timeout'), overallTimeoutMs);
  activeInvestigationControllers.set(runId, controller);
  cleanupInvestigation = () => {
    clearTimeout(overallTimer);
    activeInvestigationControllers.delete(runId);
    req.off('aborted', abortOnDisconnect);
    res.off('close', abortOnDisconnect);
  };
  const abortOnDisconnect = () => {
    if (!res.writableEnded) {
      controller.abort();
      cleanupInvestigation();
    }
  };
  req.on('aborted', abortOnDisconnect);
  res.on('close', abortOnDisconnect);
  res.on('finish', cleanupInvestigation);

  // Normalize Indian identifiers
  const cin = identifierType === 'CIN' ? normalizeCIN(cleanVal) : null;
  const gstin = identifierType === 'GSTIN' ? normalizeGSTIN(cleanVal) : suppliedGSTIN ? normalizeGSTIN(String(suppliedGSTIN).trim().toUpperCase()) : null;
  if (suppliedGSTIN && !gstin) {
    res.status(400).json({ error: 'The selected GSTIN is invalid. Supply a valid 15-character GSTIN.' });
    return;
  }
  const pan = identifierType === 'PAN' ? cleanVal : null;

  // 1. Persist or retrieve Vendor domain record
  const vendor = await db.vendors.findOrCreateByInput({
    canonicalName: cleanTargetName,
    cin,
    gstin,
    pan,
    sourceReference: 'Procurement Investigation Flow',
  });

  // 2. Execute Layer 1 VendorTrace discovery orchestration across 4 dimensions concurrently
  const discoveryReport = await discoveryService.runDiscovery(
    {
      id: vendor.id,
      canonicalName: cleanTargetName,
      cin,
      gstin,
      pan,
    },
    {
      useMock: Boolean(useMock),
      mockScenario,
      maxConcurrency: 3,
      signal: controller.signal,
      freshRun: Boolean(freshRun),
    }
  );

  // 3. Map normalized RiskFindings to domain Signals & Evidence, and UI format
  const findings: Finding[] = [];
  const relatedLeads: RelatedEntityLead[] = [];
  const checkedSources: string[] = [];

  for (const dim of Object.values(discoveryReport.dimensions)) {
    if (dim.sourcesChecked) {
      checkedSources.push(...dim.sourcesChecked);
    }
  }

  for (const rf of discoveryReport.findings) {
    const evidenceIds: string[] = [];
    for (const ev of rf.evidence) {
      // Unfetched search results can legitimately have no excerpt. Keep them in
      // the report as unavailable evidence, but do not persist them as quoted
      // source records or invent a quote to satisfy the evidence repository.
      if (!ev.snippet?.trim()) continue;
      const savedEv = await db.evidence.save({
        id: '',
        sourceName: ev.sourceName,
        sourceDomain: ev.sourceDomain,
        sourceUrl: ev.url,
        quote: ev.snippet,
        publishedAt: ev.publishedAt,
        capturedAt: ev.capturedAt,
        underlyingSource: ev.underlyingSource,
        sourceType: rf.dimension === 'negative_news' ? 'NewsMedia' : rf.dimension === 'court_litigation' ? 'OfficialRegistry' : 'IndiaCos',
        identityMatchNotes: ev.identityMatchNote,
      });
      evidenceIds.push(savedEv.id);
    }

    const domainDim = rf.dimension === 'company_registry'
      ? 'REGISTRY_STATUS'
      : rf.dimension === 'gst_compliance'
      ? 'TAX_COMPLIANCE'
      : rf.dimension === 'court_litigation'
      ? 'LITIGATION'
      : rf.dimension === 'blacklist_debarment'
      ? 'DEBARMENT'
      : 'ADVERSE_MEDIA';

    const confidenceStatus = rf.confidence === 'multiple_independent_sources'
      ? 'CORROBORATED'
      : rf.confidence === 'conflicting_sources'
      ? 'CONFLICTING_EVIDENCE'
      : 'REQUIRES_HUMAN_REVIEW';

    const savedSignal = await db.signals.save({
      id: '',
      investigationId: invId,
      vendorId: vendor.id,
      dimension: domainDim,
      title: rf.title,
      neutralSummary: rf.neutralSummary,
      severity: rf.severity,
      evidenceIds,
      confidenceStatus,
      firstSeenAt: now,
      lastSeenAt: now,
      lifecycleStatus: 'ACTIVE',
      reviewNote: rf.recommendedReviewAction,
    });

    const isAllegation = rf.evidence.some((e) => e.legalStatus === 'alleged') || (rf.dimension === 'court_litigation' && rf.severity === 3);

    findings.push({
      id: savedSignal.id,
      category: rf.dimension === 'gst_compliance' ? 'TAX' : rf.dimension === 'court_litigation' ? 'LEGAL' : rf.dimension === 'blacklist_debarment' ? 'DEBARMENT' : rf.dimension === 'negative_news' ? 'MEDIA' : 'REGISTRY',
      title: rf.title,
      claim: rf.neutralSummary,
      riskLevel: rf.severity >= 4 ? 'MATERIAL_RISK' : rf.severity === 3 ? 'CAUTION' : 'UNKNOWN',
      verificationStatus: confidenceStatus,
      isAllegation,
      identityMatchStrength: rf.evidence[0]?.identityMatchNote?.toLowerCase().includes('exact') ? 'EXACT' : 'HIGH',
      notesForOfficer: `${rf.severityExplanation} Review Action: ${rf.recommendedReviewAction}`,
      sources: rf.evidence.map((e) => ({
        sourceName: e.sourceName,
        sourceDomain: e.sourceDomain,
        url: e.url,
        searchResultUrl: e.searchResultUrl,
        sourceFetchError: e.sourceFetchError,
        sourceTitle: e.sourceTitle,
        publisher: e.publisher,
        snippet: e.snippet,
        retrievedAt: e.capturedAt,
        provenance: e.underlyingSource,
        matchConfidence: /exact.*(identifier|cin|gstin|pan)/i.test(e.identityMatchNote) ? 'EXACT_IDENTIFIER' : /name-token|name match/i.test(e.identityMatchNote) ? 'FUZZY_NAME_ONLY' : 'NAME_AND_ADDRESS',
        searchQuery: e.searchQuery,
        identityMatchNote: e.identityMatchNote,
        expandedText: e.expandedText,
      })),
    });
  }

  // 4. Execute Layer 2 Related-Entity Tracing starting from source-backed anchors
  const traceResult = controller.signal.aborted
    ? {
        relationships: [],
        anchors: [],
        graph: {
          nodes: [],
          edges: [],
          anchorsUsed: [],
          disclaimer: TRACING_DISCLAIMER,
          stats: {
            totalRelatedEntities: 0,
            totalDirectors: 0,
            strongIdentifierMatches: 0,
            candidateMatches: 0,
            depth: 0,
            maxCandidatesLimit: 0,
          },
        },
      }
    : await entityTracingService.traceRelatedEntities(
    {
      id: vendor.id,
      canonicalName: cleanTargetName,
      cin,
      gstin,
      profile: {
        canonicalName: cleanTargetName,
        cin,
        gstins: gstin ? [gstin] : [],
        companyStatus: 'ACTIVE',
        entityType: 'COMPANY',
        directors: [],
        registeredOffice: null,
        identityMatchMethod: 'EXACT_CIN',
        isCached: false,
        lastFetchedAt: now,
      },
    },
    discoveryReport.findings,
    {
      useMock: Boolean(useMock),
      mockScenario: mockScenario?.includes('TRACING') ? (mockScenario as any) : 'STANDARD',
      maxCandidatesPerAnchor: 10,
      maxDepth: 1,
      signal: controller.signal,
    }
  );

  for (const rel of traceResult.relationships) {
    relatedLeads.push({
      id: rel.id,
      legalName: rel.targetEntityName,
      cin: rel.targetCin,
      relationType: rel.relationshipType as any,
      sharedDirectorName: rel.details.directorName,
      sharedDin: rel.details.din,
      sharedAddress: rel.details.commonAddress,
      companyStatus: rel.lightweightL1Status || 'UNKNOWN',
      leadDisclaimer: rel.leadDisclaimer,
    });
  }

  if (controller.signal.reason === 'overall_timeout' && discoveryReport.terminationReason !== 'TIMEOUT') {
    discoveryReport.status = discoveryReport.findings.length > 0 ? 'partial_failure' : 'failed';
    discoveryReport.coverageStatus = 'PARTIAL';
    discoveryReport.terminationReason = 'TIMEOUT';
    discoveryReport.coverageGaps.push('Overall investigation deadline reached before all investigation stages completed.');
  }

  // 5. Execute Layer 3 Cross-Validation & Deterministic Scoring
  const assessmentReport = await crossValidationService.compileAssessmentReport({
    investigationId: invId,
    vendorId: vendor.id,
    vendorName: cleanTargetName,
    cin,
    gstin,
    pan,
    identityMatchQuality: cin ? 'EXACT_IDENTIFIER' : gstin ? 'EXACT_IDENTIFIER' : 'STRONG_NAME_AND_ADDRESS',
    rawFindings: discoveryReport.findings,
    coverageGaps: discoveryReport.coverageGaps,
    dimensionTaskStates: {
      company_registry: { status: discoveryReport.dimensions.company_registry.status },
      gst_compliance: { status: discoveryReport.dimensions.gst_compliance.status },
      court_litigation: { status: discoveryReport.dimensions.court_litigation.status },
      blacklist_debarment: { status: discoveryReport.dimensions.blacklist_debarment.status },
      negative_news: { status: discoveryReport.dimensions.negative_news.status },
    },
    investigationDate: discoveryReport.startedAt,
    sourcesChecked: checkedSources,
  });

  // 6. Persist Investigation record
  const investigationDomain = await db.investigations.save({
    id: invId,
    vendorId: vendor.id,
    requestedIdentifier: {
      type: identifierType as any,
      // Name-only investigations are valid; persist the name as their non-empty
      // requested identifier so repository validation does not reject the report.
      value: cleanVal || (identifierType === 'NAME' ? cleanTargetName : ''),
    },
    startedAt: discoveryReport.startedAt,
    completedAt: discoveryReport.completedAt,
    status: discoveryReport.status === 'completed'
      ? 'COMPLETED'
      : discoveryReport.status === 'partial_failure'
      ? 'PARTIAL_FAILURE'
      : discoveryReport.status === 'cancelled'
      ? 'CANCELLED'
      : 'FAILED',
    providerStatuses: {
      indiacos: { configured: indiacos.isConfigured(), status: indiacos.isConfigured() ? 'OK' : 'UNAVAILABLE' },
      tinyfish: { configured: tinyfish.isConfigured(), status: tinyfish.isConfigured() ? 'OK' : 'UNAVAILABLE' },
    },
    summary: {
      verdict: discoveryReport.summary.verdict,
      narrative: assessmentReport.briefSummary.text || discoveryReport.summary.narrative,
      totalSignals: discoveryReport.summary.totalSignals,
      corroboratedSignals: discoveryReport.summary.corroboratedSignals,
      reviewNeededSignals: discoveryReport.summary.reviewNeededSignals,
      highSeveritySignals: discoveryReport.summary.highSeveritySignals,
    },
    latestReportReference: `rep_${invId}`,
  });

  const legacyFormat: Investigation = {
    id: investigationDomain.id,
    targetName: cleanTargetName,
    identifierType: identifierType,
    identifierValue: cleanVal,
    status: investigationDomain.status,
    createdAt: discoveryReport.startedAt,
    completedAt: discoveryReport.completedAt || undefined,
    requestedBy: 'Compliance Officer (Session)',
    executionMode: useMock ? 'DEMO' : 'LIVE',
    providerLabels: ['IndiaCos', 'TinyFish'],
    sourcesChecked: checkedSources,
    findingsCount: {
      verifiedClear: findings.filter((f) => f.riskLevel === 'VERIFIED_CLEAR').length,
      caution: findings.filter((f) => f.riskLevel === 'CAUTION').length,
      materialRisk: findings.filter((f) => f.riskLevel === 'MATERIAL_RISK').length,
      requiresReview: findings.filter((f) => f.verificationStatus === 'REQUIRES_HUMAN_REVIEW').length,
    },
    findings,
    normalizedFindings: discoveryReport.findings,
    dimensionResults: discoveryReport.dimensions,
    coverageGaps: discoveryReport.coverageGaps,
    coverageStatus: discoveryReport.coverageStatus,
    terminationReason: discoveryReport.terminationReason,
    totalDurationMs: discoveryReport.totalDurationMs,
    relatedLeads,
    entityGraph: traceResult.graph,
    assessmentReport,
    summaryNarrative: assessmentReport.briefSummary.text || discoveryReport.summary.narrative,
  };

  store.createInvestigation(legacyFormat);
  res.status(201).json(legacyFormat);
  } catch (error: any) {
    investigationController?.abort('investigation_failed');
    cleanupInvestigation();
    if (invId) {
      try {
        const signals = await db.signals.findByInvestigationId(invId);
        for (const signal of signals) {
          await db.signals.delete(signal.id);
          for (const evidenceId of signal.evidenceIds) await db.evidence.delete(evidenceId);
        }
        await db.investigations.delete(invId);
        store.deleteInvestigation(invId);
      } catch (cleanupError) {
        console.error('Failed to clean up incomplete investigation records:', cleanupError);
      }
    }
    const referenceId = `inv_err_${Date.now()}`;
    console.error(`[Investigation ${referenceId}]`, error);
    if (!res.headersSent && !res.destroyed) {
      res.status(500).json({
        error: 'The investigation could not be completed. No complete report was saved. Please retry.',
        referenceId,
      });
    }
  }
});

app.post('/api/investigations/cancel', (req: Request, res: Response) => {
  const { runId } = req.body || {};
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(runId)) {
    res.status(400).json({ error: 'A valid runId is required' });
    return;
  }
  const controller = activeInvestigationControllers.get(runId);
  if (!controller || controller.signal.aborted) {
    res.status(409).json({ success: false, message: 'Investigation is not active or has already terminated.' });
    return;
  }
  controller.abort('operator_cancelled');
  res.json({ success: true, message: 'Cancellation requested; active provider work is stopping.' });
});

// API: GeM/CVC Search + Fetch Evidence Workflow (SSE progress adapter; with SSRF Guard)
app.post('/api/investigations/tinyfish/stream', ssrfGuardMiddleware, async (req: Request, res: Response) => {
  const { url, goal, outputSchema, useMock, mockScenario, timeoutMs } = req.body || {};
  const configuredAgentTimeoutMs = Math.max(configuredLimit('VENDORTRACE_LIVE_STREAM_TIMEOUT_MS', 120000, 120000), 1000);
  const streamController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) streamController.abort();
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: SanitizedStreamEvent) => {
    if (!streamController.signal.aborted && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  try {
    if (!useMock) {
      const runId = `tf_search_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const identifiers = Array.isArray(req.body?.identifiers)
        ? req.body.identifiers.filter((value: unknown): value is string => typeof value === 'string').slice(0, 5)
        : [];
      sendEvent({ type: 'STARTED', runId, timestamp: new Date().toISOString(), isMock: false });
      sendEvent({
        type: 'PROGRESS',
        runId,
        timestamp: new Date().toISOString(),
        message: 'Running Layer 1 discovery only: bounded registry, court, procurement, and adverse-media checks.',
        isMock: false,
      });
      const canonicalName = typeof req.body?.targetName === 'string' && req.body.targetName.trim()
          ? req.body.targetName.trim()
          : 'Target Vendor';
      const detected = identifiers.map((identifier: string) => detectIdentifierKind(identifier));
      const cin = detected.find((identifier: ReturnType<typeof detectIdentifierKind>) => identifier.kind === 'CIN')?.normalizedValue;
      const gstin = detected.find((identifier: ReturnType<typeof detectIdentifierKind>) => identifier.kind === 'GSTIN')?.normalizedValue;
      const pan = detected.find((identifier: ReturnType<typeof detectIdentifierKind>) => identifier.kind === 'PAN')?.normalizedValue;
      const discoveryReport = await discoveryService.runDiscovery({ canonicalName, cin, gstin, pan }, {
        signal: streamController.signal,
        maxConcurrency: 4,
        overallTimeoutMs: configuredAgentTimeoutMs,
        freshRun: true,
      });
      if (!streamController.signal.aborted) {
        sendEvent({
          type: 'COMPLETE',
          runId,
          timestamp: new Date().toISOString(),
          status: 'COMPLETED',
          result: discoveryReport,
          elapsedMs: Date.now() - Number(runId.split('_')[2]),
          isMock: false,
        });
        res.end();
      }
      return;
    }

    await tinyfishStreamingClient.executeStreamingRun(
      {
        url: url || 'https://gem.gov.in',
        goal: goal || 'Audit vendor compliance and debarment status',
        outputSchema,
        timeoutMs: useMock && typeof timeoutMs === 'number' && timeoutMs > 0
          ? Math.min(timeoutMs, configuredAgentTimeoutMs)
          : configuredAgentTimeoutMs,
        signal: streamController.signal,
        useMock: Boolean(useMock),
        mockScenario,
      },
      (ev) => {
        sendEvent(ev);
        if (ev.type === 'COMPLETE' || ev.type === 'ERROR' || ev.type === 'CANCELED') {
          res.end();
        }
      }
    );
  } catch (err: any) {
    if (!streamController.signal.aborted) {
      sendEvent({
        type: 'ERROR',
        runId: 'tf_err_stream',
        timestamp: new Date().toISOString(),
        errorCategory: 'UPSTREAM_5XX',
        errorMessage: tinyfishStreamingClient.sanitizeText(err.message),
        isMock: Boolean(useMock),
      });
      res.end();
    }
  }
});

// API: Cancel active TinyFish automation run
app.post('/api/investigations/tinyfish/cancel', asyncHandler(async (req: Request, res: Response) => {
  const { runId, useMock } = req.body || {};
  if (!runId || typeof runId !== 'string') {
    res.status(400).json({ error: 'runId is required' });
    return;
  }
  const result = await tinyfishStreamingClient.cancelRun(runId, Boolean(useMock));
  res.json(result);
}));

// API: Honest polling fallback for TinyFish run status
app.get('/api/investigations/tinyfish/runs/:id', asyncHandler(async (req: Request, res: Response) => {
  const runId = req.params.id;
  const useMock = req.query.useMock === 'true';
  const statusEvent = await tinyfishStreamingClient.pollRunStatus(runId, useMock);
  res.json(statusEvent);
}));

// API: Layer 2 Related-Entity Tracing on an investigation
app.post('/api/investigations/:id/trace', asyncHandler(async (req: Request, res: Response) => {
  const inv = findInvestigationSnapshot(req.params.id, req.body?.investigation);
  if (!inv) {
    res.status(404).json({ error: 'Investigation not found' });
    return;
  }

  const { maxDepth, maxCandidatesPerAnchor, useMock, mockScenario } = req.body || {};
  const traceResult = await entityTracingService.traceRelatedEntities(
    {
      canonicalName: inv.targetName,
      cin: inv.identifierType === 'CIN' ? inv.identifierValue : null,
      gstin: inv.identifierType === 'GSTIN' ? inv.identifierValue : null,
    },
    inv.normalizedFindings || [],
    {
      maxDepth: maxDepth || 1,
      maxCandidatesPerAnchor: maxCandidatesPerAnchor || 10,
      useMock: Boolean(useMock),
      mockScenario,
    }
  );

  inv.entityGraph = traceResult.graph;
  res.json(traceResult);
}));

// API: Get Entity Graph for an investigation
const getInvestigationGraph = (req: Request, res: Response) => {
  const inv = findInvestigationSnapshot(req.params.id, req.body?.investigation);
  if (!inv) {
    res.status(404).json({ error: 'Investigation not found' });
    return;
  }
  res.json(inv.entityGraph || { nodes: [], edges: [], anchorsUsed: [], disclaimer: TRACING_DISCLAIMER });
};
app.get('/api/investigations/:id/graph', getInvestigationGraph);
app.post('/api/investigations/:id/graph', getInvestigationGraph);

// API: Get Assessment Report (Layer 3) for an investigation
const getInvestigationAssessment = async (req: Request, res: Response) => {
  const inv = findInvestigationSnapshot(req.params.id, req.body?.investigation);
  if (!inv) {
    res.status(404).json({ error: 'Investigation not found' });
    return;
  }

  if (inv.assessmentReport) {
    res.json(inv.assessmentReport);
    return;
  }

  // Compile on the fly if not yet cached
  const report = await crossValidationService.compileAssessmentReport({
    investigationId: inv.id,
    vendorId: `ven_${inv.id}`,
    vendorName: inv.targetName,
    cin: inv.identifierType === 'CIN' ? inv.identifierValue : null,
    gstin: inv.identifierType === 'GSTIN' ? inv.identifierValue : null,
    pan: inv.identifierType === 'PAN' ? inv.identifierValue : null,
    identityMatchQuality: inv.identifierType === 'CIN' || inv.identifierType === 'GSTIN' ? 'EXACT_IDENTIFIER' : 'STRONG_NAME_AND_ADDRESS',
    rawFindings: inv.normalizedFindings || [],
    coverageGaps: inv.coverageGaps || [],
    dimensionTaskStates: inv.dimensionResults || {},
    investigationDate: inv.createdAt,
    sourcesChecked: inv.sourcesChecked || [],
  });

  inv.assessmentReport = report;
  res.json(report);
};
app.get('/api/investigations/:id/assessment', asyncHandler(getInvestigationAssessment));
app.post('/api/investigations/:id/assessment', asyncHandler(getInvestigationAssessment));

// API: Run Layer 3 Cross-Validation & Deterministic Scoring Test Suite
app.post('/api/investigations/cross-validation/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runCrossValidationTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Cross-validation test suite failed' });
  }
});

// API: Run TinyFish Streaming Test Suite
app.post('/api/investigations/streaming/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runTinyFishStreamingTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Streaming test suite failed' });
  }
});

// API: Run Layer 2 Tracing Test Suite
app.post('/api/investigations/tracing/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runEntityTracingTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Tracing test suite failed' });
  }
});

// API: Run Discovery and Validation Test Suite
app.post('/api/investigations/discovery/verify-suite', async (_req: Request, res: Response) => {
  try {
    const valReport = await runRiskFindingValidationTests();
    const orchReport = await runDiscoveryOrchestrationTests();
    res.json({
      success: valReport.success && orchReport.success,
      timestamp: new Date().toISOString(),
      validationSuite: valReport,
      orchestrationSuite: orchReport,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Discovery test suite execution failed' });
  }
});

// API: Re-run Investigation and compute deterministic signal diff
app.post('/api/investigations/:id/rerun', async (req: Request, res: Response) => {
  try {
    const prev = findInvestigationSnapshot(req.params.id, req.body?.baseline);
    if (!prev) {
      res.status(404).json({ error: 'The baseline report is missing from the server and the saved browser copy is unavailable or incomplete. Reload history and retry.' });
      return;
    }

    const { useMock = false, mockScenario, freshRun = false } = req.body || {};
    const newInvId = generateStableId('inv');

    // Run Layer 1 Discovery
    const discoveryReport = await discoveryService.runDiscovery(
      {
        canonicalName: prev.targetName,
        cin: prev.identifierType === 'CIN' ? prev.identifierValue : undefined,
        gstin: prev.identifierType === 'GSTIN' ? prev.identifierValue : undefined,
        pan: prev.identifierType === 'PAN' ? prev.identifierValue : undefined,
      },
      {
        useMock: Boolean(useMock),
        mockScenario,
        freshRun: Boolean(freshRun),
      }
    );

    // Run Layer 2 Entity Tracing
    const traceResult = await entityTracingService.traceRelatedEntities(
      {
        canonicalName: prev.targetName,
        cin: prev.identifierType === 'CIN' ? prev.identifierValue : null,
        gstin: prev.identifierType === 'GSTIN' ? prev.identifierValue : null,
      },
      discoveryReport.findings,
      {
        maxDepth: 1,
        maxCandidatesPerAnchor: 10,
        useMock: Boolean(useMock),
        mockScenario,
      }
    );

    // Run Layer 3 Cross-Validation & Deterministic Scoring
    const assessmentReport = await crossValidationService.compileAssessmentReport({
      investigationId: newInvId,
      vendorId: `ven_${prev.id}`,
      vendorName: prev.targetName,
      cin: prev.identifierType === 'CIN' ? prev.identifierValue : null,
      gstin: prev.identifierType === 'GSTIN' ? prev.identifierValue : null,
      pan: prev.identifierType === 'PAN' ? prev.identifierValue : null,
      identityMatchQuality: prev.identifierType === 'CIN' || prev.identifierType === 'GSTIN' ? 'EXACT_IDENTIFIER' : 'STRONG_NAME_AND_ADDRESS',
      rawFindings: discoveryReport.findings,
      coverageGaps: discoveryReport.coverageGaps,
      dimensionTaskStates: {
        company_registry: { status: discoveryReport.dimensions.company_registry.status },
        gst_compliance: { status: discoveryReport.dimensions.gst_compliance.status },
        court_litigation: { status: discoveryReport.dimensions.court_litigation.status },
        blacklist_debarment: { status: discoveryReport.dimensions.blacklist_debarment.status },
        negative_news: { status: discoveryReport.dimensions.negative_news.status },
      },
      investigationDate: discoveryReport.startedAt,
      sourcesChecked: prev.sourcesChecked,
    });

    // Run Layer 4 Change Detection & Signal Fingerprinting
    const comparisonReport = changeDetectionService.compareInvestigationRuns({
      vendorId: `ven_${prev.id}`,
      vendorName: prev.targetName,
      entityIdentifier: prev.identifierValue || prev.targetName,
      previousInvestigationId: prev.id,
      previousRunDate: prev.createdAt,
      previousFindings: prev.normalizedFindings || [],
      latestInvestigationId: newInvId,
      latestRunDate: discoveryReport.startedAt,
      latestFindings: discoveryReport.findings,
    });

    // Format new investigation
    const findings: Finding[] = discoveryReport.findings.map((rf) => {
      const isAllegation = rf.evidence.some((e) => e.legalStatus === 'alleged') || (rf.dimension === 'court_litigation' && rf.severity === 3);
      const confidenceStatus = rf.confidence === 'multiple_independent_sources' ? 'CORROBORATED' : rf.confidence === 'conflicting_sources' ? 'CONFLICTING_EVIDENCE' : 'REQUIRES_HUMAN_REVIEW';
      return {
        id: rf.id,
        category: rf.dimension === 'gst_compliance' ? 'TAX' : rf.dimension === 'court_litigation' ? 'LEGAL' : rf.dimension === 'blacklist_debarment' ? 'DEBARMENT' : rf.dimension === 'negative_news' ? 'MEDIA' : 'REGISTRY',
        title: rf.title,
        claim: rf.neutralSummary,
        riskLevel: rf.severity >= 4 ? 'MATERIAL_RISK' : rf.severity === 3 ? 'CAUTION' : rf.status === 'no_signal_found_in_checked_sources' ? 'VERIFIED_CLEAR' : 'UNKNOWN',
        verificationStatus: confidenceStatus,
        isAllegation,
        identityMatchStrength: rf.evidence[0]?.identityMatchNote?.toLowerCase().includes('exact') ? 'EXACT' : 'HIGH',
        notesForOfficer: `${rf.severityExplanation} Review Action: ${rf.recommendedReviewAction}`,
        sources: rf.evidence.map((e) => ({
          sourceName: e.sourceName,
          sourceDomain: e.sourceDomain,
          url: e.url,
          snippet: e.snippet,
          retrievedAt: e.capturedAt,
          provenance: e.underlyingSource,
        matchConfidence: /exact.*(identifier|cin|gstin|pan)/i.test(e.identityMatchNote) ? 'EXACT_IDENTIFIER' as const : /name-token|name match/i.test(e.identityMatchNote) ? 'FUZZY_NAME_ONLY' as const : 'NAME_AND_ADDRESS' as const,
        searchQuery: e.searchQuery,
        identityMatchNote: e.identityMatchNote,
        expandedText: e.expandedText,
        })),
      };
    });

    const newInvestigation: Investigation = {
      id: newInvId,
      targetName: prev.targetName,
      identifierType: prev.identifierType,
      identifierValue: prev.identifierValue,
      status: discoveryReport.status === 'completed' ? 'COMPLETED' : 'FAILED',
      createdAt: discoveryReport.startedAt,
      completedAt: discoveryReport.completedAt,
      requestedBy: 'Compliance Officer (Manual Re-check)',
      executionMode: Boolean(req.body?.useMock) ? 'DEMO' : 'LIVE',
      providerLabels: ['IndiaCos', 'TinyFish'],
      sourcesChecked: prev.sourcesChecked,
      findingsCount: {
        verifiedClear: findings.filter((f) => f.riskLevel === 'VERIFIED_CLEAR').length,
        caution: findings.filter((f) => f.riskLevel === 'CAUTION').length,
        materialRisk: findings.filter((f) => f.riskLevel === 'MATERIAL_RISK').length,
        requiresReview: findings.filter((f) => f.verificationStatus === 'REQUIRES_HUMAN_REVIEW').length,
      },
      findings,
      normalizedFindings: discoveryReport.findings,
      dimensionResults: discoveryReport.dimensions,
      coverageGaps: discoveryReport.coverageGaps,
      totalDurationMs: discoveryReport.totalDurationMs,
      relatedLeads: prev.relatedLeads,
      entityGraph: traceResult.graph,
      assessmentReport,
      summaryNarrative: assessmentReport.briefSummary.text || discoveryReport.summary.narrative,
    };

    store.createInvestigation(newInvestigation);

    // Save comparison report in persistent storage
    await db.comparisons.save({
      id: comparisonReport.comparisonId,
      previousRunId: prev.id,
      currentRunId: newInvId,
      newSignalIds: comparisonReport.newSignals.map((s) => s.id),
      changedSignalIds: comparisonReport.changedSignals.map((s) => s.id),
      removedSignalIds: comparisonReport.notObservedSignals.map((s) => s.id),
      unresolvedSignalIds: comparisonReport.unresolvedSignals.map((s) => s.id),
      comparedAt: comparisonReport.comparedAt,
    });

    res.status(201).json({
      investigation: newInvestigation,
      comparison: comparisonReport,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Investigation re-check failed' });
  }
});

// API: Monitoring comparison between two investigation runs (deterministic signal fingerprints)
app.post('/api/monitoring/compare', asyncHandler(async (req: Request, res: Response) => {
  const { previousInvestigationId, latestInvestigationId, previousInvestigation, latestInvestigation } = req.body;

  if (!previousInvestigationId || !latestInvestigationId) {
    res.status(400).json({ error: 'Both previousInvestigationId and latestInvestigationId are required' });
    return;
  }

  const prev = findInvestigationSnapshot(previousInvestigationId, previousInvestigation);
  const curr = findInvestigationSnapshot(latestInvestigationId, latestInvestigation);

  if (!prev || !curr) {
    res.status(404).json({ error: 'One or both investigation records could not be found' });
    return;
  }
  const comparisonError = validateInvestigationComparison(prev, curr);
  if (comparisonError) {
    res.status(comparisonError.status).json({ error: comparisonError.message });
    return;
  }

  const comparison = changeDetectionService.compareInvestigationRuns({
    vendorId: `ven_${prev.id}`,
    vendorName: prev.targetName,
    entityIdentifier: prev.identifierValue || prev.targetName,
    previousInvestigationId: prev.id,
    previousRunDate: prev.createdAt,
    previousFindings: prev.normalizedFindings || [],
    latestInvestigationId: curr.id,
    latestRunDate: curr.createdAt,
    latestFindings: curr.normalizedFindings || [],
  });

  res.json(comparison);
}));

// API: Alias for compare under investigations namespace
app.post('/api/investigations/compare', asyncHandler(async (req: Request, res: Response) => {
  const { previousInvestigationId, latestInvestigationId, previousInvestigation, latestInvestigation } = req.body;
  if (!previousInvestigationId || !latestInvestigationId) {
    res.status(400).json({ error: 'Both previousInvestigationId and latestInvestigationId are required' });
    return;
  }
  const prev = findInvestigationSnapshot(previousInvestigationId, previousInvestigation);
  const curr = findInvestigationSnapshot(latestInvestigationId, latestInvestigation);
  if (!prev || !curr) {
    res.status(404).json({ error: 'One or both investigation records could not be found' });
    return;
  }
  const comparisonError = validateInvestigationComparison(prev, curr);
  if (comparisonError) {
    res.status(comparisonError.status).json({ error: comparisonError.message });
    return;
  }
  const comparison = changeDetectionService.compareInvestigationRuns({
    vendorId: `ven_${prev.id}`,
    vendorName: prev.targetName,
    entityIdentifier: prev.identifierValue || prev.targetName,
    previousInvestigationId: prev.id,
    previousRunDate: prev.createdAt,
    previousFindings: prev.normalizedFindings || [],
    latestInvestigationId: curr.id,
    latestRunDate: curr.createdAt,
    latestFindings: curr.normalizedFindings || [],
  });
  res.json(comparison);
}));

// API: Get Monitoring Frequency Configuration & Notice
app.get('/api/monitoring/config/:vendorId', (req: Request, res: Response) => {
  const config = changeDetectionService.getMonitoringConfig(req.params.vendorId);
  res.json(config);
});

// API: Set Monitoring Frequency Preference (Saves preference with explicit inactive-scheduler notice)
app.post('/api/monitoring/config/:vendorId', (req: Request, res: Response) => {
  const { preference } = req.body || {};
  if (!preference) {
    res.status(400).json({ error: 'preference is required (DAILY | WEEKLY | MONTHLY | MANUAL_ONLY)' });
    return;
  }
  const config = changeDetectionService.setMonitoringPreference(req.params.vendorId, preference);
  res.json(config);
});

// API: Run Phase 3 Change Detection & Network Graph Test Suite
app.post('/api/monitoring/verify-suite', async (_req: Request, res: Response) => {
  try {
    const changeReport = await runChangeDetectionTests();
    const graphReport = await runGraphNetworkTests();
    res.json({
      success: changeReport.success && graphReport.success,
      timestamp: new Date().toISOString(),
      changeDetectionSuite: changeReport,
      graphNetworkSuite: graphReport,
      totalPassed: changeReport.assertionsPassed + graphReport.assertionsPassed,
      totalFailed: changeReport.assertionsFailed + graphReport.assertionsFailed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Monitoring test suite execution failed' });
  }
});

// API: Tracked vendors list with pagination (same source/count as workspace stats).
app.get('/api/vendors', asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  const allVendors = await getUnifiedVendorDirectory(query);
  const offset = (page - 1) * limit;
  const items = allVendors.slice(offset, offset + limit);

  res.json({
    vendors: items,
    pagination: {
      total: allVendors.length,
      page,
      limit,
      hasMore: offset + limit < allVendors.length,
    },
    storageStatus: repositoryManager.getStorageStatus(),
  });
}));

// API: Export Single Due Diligence Report as PDF
const exportPdf = (req: Request, res: Response) => {
  const inv = findInvestigationSnapshot(req.params.id, req.body?.investigation);
  if (!inv) {
    res.status(404).json({ error: 'Investigation record not found for PDF export' });
    return;
  }

  const tenantCheck = securityService.checkTenantAccess({
    requestWorkspaceId: (req.headers['x-workspace-id'] as string) || 'default_ws',
    resourceWorkspaceId: 'default_ws',
  });
  if (!tenantCheck.authorized) {
    res.status(403).json({ error: tenantCheck.reason });
    return;
  }

  try {
    const pdfBytes = exportService.generatePdfReport(inv);
    securityService.logAudit({
      eventType: 'REPORT_EXPORTED_PDF',
      workspaceId: (req.headers['x-workspace-id'] as string) || 'default_ws',
      userId: (req.headers['x-user-id'] as string) || 'session_user',
      targetEntity: inv.targetName,
      details: { reportId: inv.id, byteSize: pdfBytes.length },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="VendorTrace_${inv.id}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'PDF export generation failed' });
  }
};
app.get('/api/reports/:id/export/pdf', exportPdf);
app.post('/api/reports/:id/export/pdf', exportPdf);

// API: Export Evidence Register as CSV
const exportCsv = (req: Request, res: Response) => {
  const inv = findInvestigationSnapshot(req.params.id, req.body?.investigation);
  if (!inv) {
    res.status(404).json({ error: 'Investigation record not found for CSV export' });
    return;
  }

  const tenantCheck = securityService.checkTenantAccess({
    requestWorkspaceId: (req.headers['x-workspace-id'] as string) || 'default_ws',
    resourceWorkspaceId: 'default_ws',
  });
  if (!tenantCheck.authorized) {
    res.status(403).json({ error: tenantCheck.reason });
    return;
  }

  try {
    const csvContent = exportService.generateCsvRegister(inv);
    securityService.logAudit({
      eventType: 'REPORT_EXPORTED_CSV',
      workspaceId: (req.headers['x-workspace-id'] as string) || 'default_ws',
      userId: (req.headers['x-user-id'] as string) || 'session_user',
      targetEntity: inv.targetName,
      details: { reportId: inv.id },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="VendorTrace_Evidence_${inv.id}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'CSV export generation failed' });
  }
};
app.get('/api/reports/:id/export/csv', exportCsv);
app.post('/api/reports/:id/export/csv', exportCsv);

// API: Search and Filter Past Investigations
app.get('/api/investigations/search', (req: Request, res: Response) => {
  const allInv = store.getAllInvestigations();
  const result = investigationFilterService.filterInvestigations(allInv, req.query as any);
  res.json(result);
});

// API: Vendor Profile with Report History & Last Checked Time.
app.get('/api/vendors/:id/profile', asyncHandler(async (req: Request, res: Response) => {
  const vendorId = req.params.id;
  const allInv = store.getAllInvestigations();
  const allVendors = await getUnifiedVendorDirectory();
  const requested = allVendors.find((vendor) =>
    vendor.id === vendorId ||
    (vendor.cin && vendor.cin.toUpperCase() === vendorId.toUpperCase()) ||
    vendor.gstins.some((gstin) => gstin.toUpperCase() === vendorId.toUpperCase()) ||
    normalizeDirectoryValue(vendor.canonicalName) === normalizeDirectoryValue(vendorId)
  );

  const vendorNames = new Set([
    normalizeDirectoryValue(requested?.canonicalName),
    ...(requested?.inputNames || []).map(normalizeDirectoryValue),
  ].filter(Boolean));
  const vendorInvs = allInv.filter((inv) => {
    const nameMatch = vendorNames.has(normalizeDirectoryValue(inv.targetName));
    const identifierMatch = Boolean(
      requested?.cin && inv.identifierType === 'CIN' && inv.identifierValue.toUpperCase() === requested.cin.toUpperCase()
    ) || Boolean(
      requested?.gstins.some((gstin) => inv.identifierType === 'GSTIN' && inv.identifierValue.toUpperCase() === gstin.toUpperCase())
    );
    return nameMatch || identifierMatch || (!requested && (
      inv.id === vendorId ||
      normalizeDirectoryValue(inv.targetName) === normalizeDirectoryValue(vendorId) ||
      inv.identifierValue.toUpperCase() === vendorId.toUpperCase()
    ));
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const latestInv = vendorInvs[0] || null;
  const previousInv = vendorInvs[1] || null;
  const latestAssessment = latestInv?.assessmentReport || null;
  const previousAssessment = previousInv?.assessmentReport || null;

  const profile = {
    vendorId: requested?.id || vendorId,
    vendorName: requested?.canonicalName || latestInv?.targetName || vendorId,
    canonicalIdentifier: requested?.cin
      ? `CIN: ${requested.cin}`
      : requested?.gstins[0]
      ? `GSTIN: ${requested.gstins[0]}`
      : latestInv ? `${latestInv.identifierType}: ${latestInv.identifierValue}` : 'Unverified',
    identifierType: requested?.cin ? 'CIN' : requested?.gstins[0] ? 'GSTIN' : latestInv?.identifierType || null,
    identifierValue: requested?.cin || requested?.gstins[0] || latestInv?.identifierValue || null,
    lastCheckedAt: latestInv?.completedAt || latestInv?.createdAt || requested?.lastCheckedAt || null,
    totalReports: vendorInvs.length,
    latestRiskPriority: latestInv?.assessmentReport?.reviewPriority || (latestInv?.findingsCount.materialRisk ? 'ELEVATED_REVIEW_PRIORITY' : 'STANDARD_PERIODIC_REVIEW'),
    latestRiskScore: getAssessmentDisplayValues(latestAssessment).riskScore,
    trend: getAssessmentTrend(latestAssessment, previousAssessment, vendorInvs.length),
    reportHistory: vendorInvs.map((inv) => ({
      id: inv.id,
      date: inv.completedAt || inv.createdAt,
      status: inv.status,
      reviewPriority: inv.assessmentReport?.reviewPriority || 'STANDARD_PERIODIC_REVIEW',
      riskScore: getAssessmentDisplayValues(inv.assessmentReport).riskScore,
      findingsCount: inv.findingsCount,
    })),
  };

  res.json(profile);
}));

// API: Security Audit Ledger
app.get('/api/security/audit-logs', (req: Request, res: Response) => {
  const workspaceId = (req.headers['x-workspace-id'] as string) || 'default_ws';
  res.json({
    workspaceId,
    logs: securityService.getAuditLogs(workspaceId),
  });
});

// API: Run Security Hardening Verification Suite
app.post('/api/security/verify-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runSecurityHardeningTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Security verification suite failed' });
  }
});

// API: Run Exports & Filter Verification Suite
app.post('/api/exports/verify-suite', async (_req: Request, res: Response) => {
  try {
    const exportReport = await runExportTests();
    const filterReport = await runFilterTests();
    res.json({
      success: exportReport.success && filterReport.success,
      timestamp: new Date().toISOString(),
      exportSuite: exportReport,
      filterSuite: filterReport,
      totalPassed: exportReport.assertionsPassed + filterReport.assertionsPassed,
      totalFailed: exportReport.assertionsFailed + filterReport.assertionsFailed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Export verification suite failed' });
  }
});

// Global Error Sanitizer Middleware (Zero Stack Trace Leakage)
app.use(globalErrorSanitizer);

// Frontend serving & Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VendorTrace Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[VendorTrace Persistence] Active Adapter: ${repositoryManager.getStorageStatus().activeAdapterName} (Durable: ${repositoryManager.getStorageStatus().isDurable})`);
  });
}

startServer().catch((err) => {
  console.error('[VendorTrace Server] Startup failed:', err);
  process.exit(1);
});
