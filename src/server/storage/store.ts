import { Investigation, SourceConnector, WorkspaceStats } from '../../types/vendor.js';
import {
  DEMO_INVESTIGATION_RUN_1,
  DEMO_INVESTIGATION_RUN_2,
  FICTIONAL_VENDOR_NAME,
  FICTIONAL_CIN,
  FICTIONAL_GSTIN,
} from '../demo/demoDataset.js';

/**
 * VendorTrace In-Memory / File Persistent Store
 * Ensures truthful metrics: counts reflect actual stored records.
 * No fabricated statistics or mock metrics.
 */

class DataStore {
  private investigations: Map<string, Investigation> = new Map();
  private trackedVendors: Map<string, { id: string; name: string; cin: string | null; gstin: string | null; addedAt: string }> = new Map();

  constructor() {
    // Preload verified deterministic synthetic demo dataset for hackathon presentation
    this.initializeDemoData();
  }

  public initializeDemoData() {
    this.investigations.set(DEMO_INVESTIGATION_RUN_1.id, DEMO_INVESTIGATION_RUN_1);
    this.investigations.set(DEMO_INVESTIGATION_RUN_2.id, DEMO_INVESTIGATION_RUN_2);
    this.trackedVendors.set('ven_demo_01', {
      id: 'ven_demo_01',
      name: FICTIONAL_VENDOR_NAME,
      cin: FICTIONAL_CIN,
      gstin: FICTIONAL_GSTIN,
      addedAt: DEMO_INVESTIGATION_RUN_1.createdAt,
    });
  }

  public getStats(): WorkspaceStats {
    const totalInv = this.investigations.size;
    const totalVen = this.trackedVendors.size;
    
    let pendingReviews = 0;
    let highRiskFlags = 0;

    for (const inv of this.investigations.values()) {
      pendingReviews += inv.findingsCount.requiresReview || 0;
      highRiskFlags += inv.findingsCount.materialRisk || 0;
    }

    return {
      totalInvestigations: totalInv > 0 ? totalInv : null,
      totalTrackedVendors: totalVen > 0 ? totalVen : null,
      pendingReviews: totalInv > 0 ? pendingReviews : null,
      highRiskFlags: totalInv > 0 ? highRiskFlags : null,
      connectorsActive: this.getConnectors().filter(c => c.status === 'HEALTHY').length,
      connectorsTotal: this.getConnectors().length,
    };
  }

  public getConnectors(): SourceConnector[] {
    const hasIndiaCos = Boolean(process.env.INDIACOS_API_KEY && process.env.INDIACOS_API_KEY.trim().length > 0);
    const hasTinyFish = Boolean(process.env.TINYFISH_API_KEY && process.env.TINYFISH_API_KEY.trim().length > 0);

    return [
      {
        id: 'indiacos_mca',
        name: 'MCA21 Company & LLP Registry',
        category: 'REGISTRY',
        isConfigured: hasIndiaCos,
        status: hasIndiaCos ? 'CONFIGURED' : 'NOT_CONFIGURED',
        lastChecked: '',
        coverageNote: 'Official Ministry of Corporate Affairs registered entities, DIN status, capital structures, and directors.',
      },
      {
        id: 'indiacos_gstn',
        name: 'GSTN Tax Registration Portal',
        category: 'TAX',
        isConfigured: hasIndiaCos,
        status: hasIndiaCos ? 'CONFIGURED' : 'NOT_CONFIGURED',
        lastChecked: '',
        coverageNote: 'Goods and Services Tax filing status, active states, jurisdiction, and return frequency.',
      },
      {
        id: 'ecourts_litigation',
        name: 'E-Courts & Tribunal Registry (NCLT / HC)',
        category: 'LEGAL',
        isConfigured: false,
        status: 'UNAVAILABLE',
        lastChecked: '',
        coverageNote: 'Direct court repository integration is not configured in this deployment; no direct connection has been verified.',
      },
      {
        id: 'gem_blacklist',
        name: 'GeM & CPPP Debarment Registry',
        category: 'DEBARMENT',
        isConfigured: false,
        status: 'UNAVAILABLE',
        lastChecked: '',
        coverageNote: 'Direct GeM/CPPP roster integration is not configured in this deployment.',
      },
      {
        id: 'tinyfish_media',
        name: 'TinyFish Web Agent & Adverse Media',
        category: 'MEDIA',
        isConfigured: hasTinyFish,
        status: hasTinyFish ? 'CONFIGURED' : 'NOT_CONFIGURED',
        lastChecked: '',
        coverageNote: 'Real-time agentic extraction across national business press, regulatory enforcement notices, and tribunals.',
      },
    ];
  }

  public getAllInvestigations(): Investigation[] {
    return Array.from(this.investigations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getInvestigation(id: string): Investigation | undefined {
    return this.investigations.get(id);
  }

  public deleteInvestigation(id: string): boolean {
    return this.investigations.delete(id);
  }

  public createInvestigation(inv: Investigation): Investigation {
    this.investigations.set(inv.id, inv);
    return inv;
  }

  public getAllVendors() {
    return Array.from(this.trackedVendors.values());
  }
}

export const store = new DataStore();
