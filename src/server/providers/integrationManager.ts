/**
 * Central Server-Side Integration Manager for TinyFish and IndiaCos
 * Strictly isolates keys, provides safe health probes, and guarantees zero credential leakage.
 */

import { indiacos } from './indiacos.js';
import { tinyfish } from './tinyfish.js';
import { MockCompanyRegistryProvider, MockWebInvestigationProvider } from './mockAdapters.js';
import {
  IntegrationHealth,
  ProviderTestResult,
} from './types.js';

export interface ProviderSetupInstruction {
  providerId: 'indiacos' | 'tinyfish';
  providerName: string;
  environmentKey: string;
  docsUrl: string;
  summary: string;
  steps: string[];
}

export class IntegrationManager {
  private lastProbeResults = new Map<string, { result: ProviderTestResult; checkedAt: string }>();
  private mockIndiacos = new MockCompanyRegistryProvider();
  private mockTinyfish = new MockWebInvestigationProvider();

  public getSetupInstructions(): Record<'indiacos' | 'tinyfish', ProviderSetupInstruction> {
    return {
      indiacos: {
        providerId: 'indiacos',
        providerName: 'IndiaCos Corporate & Tax Registry',
        environmentKey: 'INDIACOS_API_KEY',
        docsUrl: 'https://indiacos.com/api/docs',
        summary: 'Enables real-time queries for MCA21 company master records, active GSTN tax registrations, and Director DIN histories.',
        steps: [
          'Create an account or obtain an API key at indiacos.com/api/docs.',
          'Add INDIACOS_API_KEY to your server environment or deployment secrets manager.',
          'Save secrets. The server-side integration layer will detect the key without exposing it to the browser.',
        ],
      },
      tinyfish: {
        providerId: 'tinyfish',
        providerName: 'TinyFish Web Agent & Adverse Media',
        environmentKey: 'TINYFISH_API_KEY',
        docsUrl: 'https://docs.tinyfish.ai/',
        summary: 'Enables agentic web research, national business press extraction, and regulatory tribunal monitoring.',
        steps: [
          'Generate your API token from the TinyFish console at tinyfish.ai.',
          'Add TINYFISH_API_KEY to your server environment or deployment secrets manager.',
          'Save secrets. TinyFish requests will authenticate using the official X-API-Key header.',
        ],
      },
    };
  }

  public getHealth(providerId: 'indiacos' | 'tinyfish'): IntegrationHealth {
    const isIndiacos = providerId === 'indiacos';
    const provider = isIndiacos ? indiacos : tinyfish;
    const isConfigured = provider.isConfigured();
    const lastProbe = this.lastProbeResults.get(providerId);
    const lastTest = lastProbe?.result;
    const status = !isConfigured
      ? 'NOT_CONFIGURED'
      : lastTest?.status || 'CONFIGURED';

    return {
      providerId,
      providerName: provider.name,
      configured: isConfigured,
      status,
      lastCheckedAt: lastProbe?.checkedAt || null,
      errorCategory: lastTest?.errorCategory || null,
      upstreamRequestId: lastTest?.upstreamRequestId || null,
      latencyMs: lastTest?.latencyMs,
      message: !isConfigured
        ? `${isIndiacos ? 'INDIACOS_API_KEY' : 'TINYFISH_API_KEY'} is missing in server environment secrets.`
        : lastTest?.message || 'API key is configured. No live connectivity probe has run yet.',
      isMock: false,
      maskedKeySnippet: isConfigured ? 'Present in server secrets (••••••••)' : 'Not configured',
    };
  }

  public getAllHealth(): Record<'indiacos' | 'tinyfish', IntegrationHealth> {
    return {
      indiacos: this.getHealth('indiacos'),
      tinyfish: this.getHealth('tinyfish'),
    };
  }

  public async testProviderConnection(
    providerId: 'indiacos' | 'tinyfish',
    useMock = false
  ): Promise<ProviderTestResult> {
    if (useMock) {
      const mockProvider = providerId === 'indiacos' ? this.mockIndiacos : this.mockTinyfish;
      // Demo tests are deliberately isolated from live connector health.
      return await mockProvider.testConnection();
    }

    const liveProvider = providerId === 'indiacos' ? indiacos : tinyfish;
    const result = await liveProvider.testConnection();
    this.lastProbeResults.set(providerId, { result, checkedAt: new Date().toISOString() });
    return result;
  }

  public getMockIndiacos(): MockCompanyRegistryProvider {
    return this.mockIndiacos;
  }

  public getMockTinyfish(): MockWebInvestigationProvider {
    return this.mockTinyfish;
  }
}

export const integrationManager = new IntegrationManager();
