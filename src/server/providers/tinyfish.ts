/**
 * Live TinyFish Web Investigation Provider
 * Interfaces with official TinyFish REST API for adverse media & agentic research.
 * Strictly keeps TINYFISH_API_KEY server-side.
 */

import {
  WebInvestigationProvider,
  WebInvestigationSearchResult,
  ProviderTestResult,
} from './types.js';
import { executeHardenedRequest } from './httpClient.js';
import { registryCache } from './cache.js';

export class LiveTinyFishProvider implements WebInvestigationProvider {
  public readonly id = 'tinyfish' as const;
  public readonly name = 'TinyFish Web Agent & Adverse Media';
  private agentBaseUrl: string;
  private searchBaseUrl: string;
  private fetchBaseUrl: string;

  constructor() {
    this.agentBaseUrl = (process.env.TINYFISH_AGENT_URL || 'https://agent.tinyfish.ai').replace(/\/+$/, '');
    this.searchBaseUrl = (process.env.TINYFISH_SEARCH_URL || 'https://api.search.tinyfish.ai').replace(/\/+$/, '');
    this.fetchBaseUrl = (process.env.TINYFISH_FETCH_URL || 'https://api.fetch.tinyfish.ai').replace(/\/+$/, '');
  }

  private getApiKey(): string | null {
    const key = process.env.TINYFISH_API_KEY;
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  public isConfigured(): boolean {
    return this.getApiKey() !== null;
  }

  private getAuthHeaders(): Record<string, string> {
    const key = this.getApiKey();
    if (!key) return {};
    // TinyFish officially documents X-API-Key: <your-api-key>
    return {
      'X-API-Key': key,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private cleanText(markdown: string): string {
    return markdown.replace(/```[\s\S]*?```/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, ' ').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/[*_`>~]/g, '').replace(/\s+/g, ' ').trim();
  }

  private cleanExcerpt(markdown: string, identityTerms: string[]): string {
    const plain = this.cleanText(markdown);
    const lower = plain.toLowerCase();
    const anchors = [...identityTerms, 'debarment', 'debarred', 'blacklist', 'blacklisted', 'suspension', 'suspended', 'ineligible']
      .map((term) => term.toLowerCase()).filter(Boolean);
    const index = anchors.map((term) => lower.indexOf(term)).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, index - 180);
    return plain.slice(start, start + 500).trim();
  }


  private buildSearchUrl(query: string, includeDomains?: string, newsMode = false): string {
    // Official Search API: GET https://api.search.tinyfish.ai?query=...
    const url = new URL(this.searchBaseUrl);
    url.searchParams.set('query', query);
    if (includeDomains) url.searchParams.set('include_domains', includeDomains);
    url.searchParams.set('location', 'IN');
    url.searchParams.set('language', 'en');
    if (newsMode) url.searchParams.set('domain_type', 'news');
    return url.toString();
  }

  private normalizeArticles(data: any, limit: number, fallbackDomain: string): NonNullable<WebInvestigationSearchResult['articles']> {
    const candidates = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.articles)
      ? data.articles
      : Array.isArray(data?.organic_results)
      ? data.organic_results
      : Array.isArray(data?.data?.results)
      ? data.data.results
      : [];

    return candidates.slice(0, Math.max(1, Math.min(20, limit))).flatMap((item: any) => {
      if (!item || typeof item !== 'object') return [];
      const rawUrl = item.url || item.link || item.source_url || item.href;
      if (typeof rawUrl !== 'string') return [];
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return [];
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return [];

      const title = String(item.title || item.name || '').trim();
      const snippet = String(item.snippet || item.description || item.text || item.content || '').trim();
      if (!title && !snippet) return [];

      const rawDomain = typeof item.domain === 'string'
        ? item.domain
        : typeof item.sourceDomain === 'string'
        ? item.sourceDomain
        : parsedUrl.hostname || fallbackDomain;
      const publishedDate = item.published_date || item.publishedDate || item.date || undefined;
      return [{
        title: title || 'Untitled search result',
        url: parsedUrl.toString(),
        snippet,
        sourceDomain: rawDomain,
        ...(typeof publishedDate === 'string' && publishedDate.trim() ? { publishedDate } : {}),
      }];
    });
  }

  public async testConnection(): Promise<ProviderTestResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        errorCategory: null,
        latencyMs: 0,
        message: 'TINYFISH_API_KEY is missing from server environment secrets.',
        isMock: false,
      };
    }

    // Ping TinyFish automation or search endpoint with sane timeout
    const testUrl = this.buildSearchUrl('VendorTrace connectivity check');
    const res = await executeHardenedRequest(testUrl, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: 6000,
      maxRetries: 1,
    });

    return {
      success: res.ok,
      status: res.appStatus,
      errorCategory: res.errorCategory,
      upstreamRequestId: res.upstreamRequestId,
      latencyMs: res.latencyMs,
      message: res.ok
        ? 'TinyFish Search API request succeeded; API key authentication and endpoint connectivity verified.'
        : res.errorMessage || 'Failed to connect to TinyFish.',
      isMock: false,
    };
  }

  public async searchAdverseMedia(
    entityName: string,
    options: { limit?: number; signal?: AbortSignal; timeoutMs?: number; identifiers?: string[]; freshRun?: boolean } = {}
  ): Promise<WebInvestigationSearchResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'TINYFISH_API_KEY not configured.',
        isMock: false,
      };
    }

    const limit = Math.max(1, Math.min(5, Math.trunc(options.limit || 5)));
    const identity = [`"${entityName.trim()}"`, ...(options.identifiers || []).slice(0, 5).map((value) => `"${value.trim()}"`)].join(' OR ');
    const query = `(${identity}) (fraud OR litigation OR debarment OR penalty OR insolvency OR NCLT OR ED OR CBI)`;
    const cacheKey = `tinyfish:media:${query}`;
    const cached = options.freshRun ? null : registryCache.get<WebInvestigationSearchResult>(cacheKey);
    if (cached) return { ...cached.data, articles: cached.data.articles?.map((article) => ({ ...article })) };
    const url = this.buildSearchUrl(query, 'indiankanoon.org,livemint.com,thehindu.com,business-standard.com,financialexpress.com,barandbench.com,scconline.com,gov.in,nic.in', true);

    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: Math.min(options.timeoutMs ?? 10000, 15000),
      maxRetries: 1,
      signal: options.signal,
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.appStatus,
        errorCategory: res.errorCategory,
        upstreamRequestId: res.upstreamRequestId,
        message: res.errorMessage,
        isMock: false,
      };
    }

    const articles = this.normalizeArticles(res.data, limit, 'api.search.tinyfish.ai');
    const allowedNews = ['indiankanoon.org', 'livemint.com', 'thehindu.com', 'business-standard.com', 'financialexpress.com', 'barandbench.com', 'scconline.com', 'gov.in', 'nic.in'];
    const selected = articles.filter((item) => {
      const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, '');
      return allowedNews.some((domain) => host === domain || host.endsWith(`.${domain}`));
    }).slice(0, limit);
    const sourceErrors: Array<{ url: string; error: string }> = [];
    if (selected.length) {
      const fetched = await executeHardenedRequest(this.fetchBaseUrl, {
        method: 'POST', headers: this.getAuthHeaders(),
        body: { urls: selected.map((item) => item.url), format: 'markdown', per_url_timeout_ms: 10000, purpose: `Fetch and verify source content for ${entityName}; include supplied identifiers where present.` },
        timeoutMs: Math.min(options.timeoutMs ?? 15000, 18000), maxRetries: 1, signal: options.signal,
      });
      const rows = fetched.ok && Array.isArray(fetched.data?.results) ? fetched.data.results : [];
      const errors = fetched.ok && Array.isArray(fetched.data?.errors) ? fetched.data.errors : [];
      const rowByUrl = new Map<string, any>();
      for (const row of rows) { if (row.url) rowByUrl.set(row.url, row); if (row.final_url) rowByUrl.set(row.final_url, row); }
      for (const item of selected) {
        const row = rowByUrl.get(item.url);
        if (!fetched.ok || !row?.text) {
          const error = errors.find((entry: any) => entry.url === item.url)?.error;
          sourceErrors.push({ url: item.url, error: String(error || fetched.errorMessage || 'Source could not be fetched.') });
          item.snippet = '';
          item.directSourceAvailable = false;
          item.sourceFetchError = String(error || fetched.errorMessage || 'Source could not be fetched.');
          item.identityMatchNote = 'Search result only; source content was not retrieved, so identity and claims remain unverified.';
          item.matchStatus = 'UNVERIFIED';
        } else {
          item.title = row.title || item.title;
          item.url = row.final_url || item.url;
          item.snippet = this.cleanExcerpt(String(row.text), [entityName, ...(options.identifiers || [])]);
          item.expandedText = this.cleanText(String(row.text)).slice(0, 4000);
          item.publishedDate = row.published_date || item.publishedDate;
          item.retrievedAt = new Date().toISOString();
          item.query = query;
        }
      }
    }

    const mediaMatch = selected.some((article) => {
      const content = `${article.title} ${article.expandedText || ''}`.toLowerCase();
      if (!article.retrievedAt || article.directSourceAvailable === false) return false;
      const identifierMatch = (options.identifiers || []).some((identifier) => content.includes(identifier.toLowerCase()));
      const exactName = content.includes(entityName.toLowerCase());
      const terms = /fraud|litigation|debar|penalt|insolv|investigat|regulatory|convict|scam/i.test(content);
      article.identityMatchNote = identifierMatch ? 'Supplied identifier appears in fetched source content.' : exactName ? 'Exact legal name appears in fetched source; entity identity needs review.' : 'Fetched source does not establish target identity.';
      article.matchStatus = terms && identifierMatch ? 'MATCH_FOUND' : terms || exactName ? 'UNVERIFIED' : 'NO_MATCH';
      return terms && (identifierMatch || exactName);
    });
    const result: WebInvestigationSearchResult = {
      success: true,
      status: 'LIVE',
      query,
      upstreamRequestId: res.upstreamRequestId,
      articles: selected,
      sourceErrors,
      evidenceOutcome: sourceErrors.length || selected.some((article) => article.matchStatus === 'UNVERIFIED') ? 'SOURCE_UNAVAILABLE' : mediaMatch ? 'MATCH_FOUND' : 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES',
      isMock: false,
    };
    registryCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  }

  public async searchDebarment(
    entityName: string,
    options: { limit?: number; identifiers?: string[]; signal?: AbortSignal; timeoutMs?: number; freshRun?: boolean } = {}
  ): Promise<WebInvestigationSearchResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'TINYFISH_API_KEY not configured.',
        isMock: false,
      };
    }

    const limit = Math.max(1, Math.min(5, Math.trunc(options.limit || 5)));
    const identifiers = [...new Set((options.identifiers || []).map((value) => value.trim()).filter(Boolean))].slice(0, 5);
    const identityTerms = [`"${entityName.trim()}"`, ...identifiers.map((identifier) => `"${identifier}"`)].join(' OR ');
    const query = `(${identityTerms}) (debarment OR debarred OR blacklist OR blacklisted OR suspension OR suspended OR ineligible)`;
    const cacheKey = `tinyfish:debarment:${query}`;
    const cached = options.freshRun ? null : registryCache.get<WebInvestigationSearchResult>(cacheKey);
    if (cached) return { ...cached.data, articles: cached.data.articles?.map((article) => ({ ...article })) };
    const officialDomains = 'gem.gov.in,assets-bg.gem.gov.in,eprocure.gov.in,doe.gov.in,cvc.gov.in';
    const searchErrors: Array<{ url: string; error: string }> = [];
    const responses: Array<{ items: NonNullable<WebInvestigationSearchResult['articles']>; query: string; requestId: string | null }> = [];
    const searchTimeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 8000, 10000));

    // Restrict every request to the documented official procurement source set.
    for (const domainFilter of [officialDomains]) {
      const searchUrl = this.buildSearchUrl(query, domainFilter);
      const search = await executeHardenedRequest(searchUrl, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        timeoutMs: searchTimeoutMs,
        maxRetries: 1,
        signal: options.signal,
      });
      if (!search.ok) {
        searchErrors.push({ url: searchUrl, error: search.errorMessage || `Search returned HTTP ${search.status}` });
        continue;
      }
      responses.push({
        items: this.normalizeArticles(search.data, limit, 'api.search.tinyfish.ai'),
        query: typeof search.data?.query === 'string' ? search.data.query : query,
        requestId: search.upstreamRequestId,
      });
    }

    if (responses.length === 0) {
      return {
        success: false,
        status: 'UPSTREAM_UNAVAILABLE',
        query,
        errorCategory: searchErrors.some((item) => /timed out/i.test(item.error)) ? 'TIMEOUT' : 'NETWORK',
        message: 'TinyFish Search API could not complete either bounded debarment query.',
        sourceErrors: searchErrors,
        isMock: false,
      };
    }

    const candidates = new Map<string, { item: NonNullable<WebInvestigationSearchResult['articles']>[number]; query: string }>();
    for (const response of responses) {
      for (const item of response.items) {
        try {
          const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, '');
          if (!officialDomains.split(',').some((domain) => host === domain || host.endsWith(`.${domain}`))) continue;
          if (!candidates.has(item.url)) candidates.set(item.url, { item, query: response.query });
        } catch { /* invalid URL */ }
      }
    }
    const selected = [...candidates.values()].slice(0, limit);
    const fetchedAt = new Date().toISOString();
    const articles: NonNullable<WebInvestigationSearchResult['articles']> = [];
    const sourceErrors = [...searchErrors];

    if (selected.length > 0) {
      const fetched = await executeHardenedRequest(this.fetchBaseUrl, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: {
          urls: selected.map(({ item }) => item.url),
          format: 'markdown',
          per_url_timeout_ms: 20000,
          purpose: 'Find vendor-specific debarment, blacklisting, or suspension evidence in the fetched public source.',
        },
        timeoutMs: 30000,
        maxRetries: 1,
        signal: options.signal,
      });
      const fetchedRows = fetched.ok && Array.isArray(fetched.data?.results) ? fetched.data.results : [];
      const fetchErrors = fetched.ok && Array.isArray(fetched.data?.errors) ? fetched.data.errors : [];
      const fetchedByUrl = new Map<string, any>();
      for (const row of fetchedRows) {
        if (typeof row?.url === 'string') fetchedByUrl.set(row.url, row);
        if (typeof row?.final_url === 'string') fetchedByUrl.set(row.final_url, row);
      }
      const errorsByUrl = new Map<string, string>(fetchErrors.flatMap((row: any) =>
        typeof row?.url === 'string' ? [[row.url, String(row.error || 'Source could not be fetched.')] as [string, string]] : []
      ));
      for (const { item, query: sourceQuery } of selected) {
        const row = fetchedByUrl.get(item.url);
        const content = typeof row?.text === 'string' ? row.text : '';
        if (!fetched.ok || !row || !content.trim()) {
          sourceErrors.push({ url: item.url, error: fetched.ok ? (errorsByUrl.get(item.url) || 'Fetch returned no readable content.') : (fetched.errorMessage || 'TinyFish Fetch request failed.') });
          const fetchError = fetched.ok ? (errorsByUrl.get(item.url) || 'Fetch returned no readable content.') : (fetched.errorMessage || 'TinyFish Fetch request failed.');
          articles.push({
            ...item,
            snippet: '',
            retrievedAt: fetchedAt,
            query: sourceQuery,
            directSourceAvailable: false,
            sourceFetchError: fetchError,
            identityMatchNote: 'Source fetch failed; no page content was retrieved, so target identity and a substantive procurement finding could not be verified.',
            matchStatus: 'UNVERIFIED',
          });
          continue;
        }
        const cleanContent = this.cleanText(content);
        const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hasTargetIdentity = compact(cleanContent).includes(compact(entityName))
          || identifiers.some((identifier) => compact(cleanContent).includes(compact(identifier)));
        const hasSubstantiveFinding = /\b(?:is|was|has been|hereby|stands)\s+(?:formally\s+)?(?:debarred|blacklisted|suspended|declared ineligible|disqualified)\b|\b(?:debarred|blacklisted|suspended|declared ineligible|disqualified)\s+(?:from|for|by|until|with effect|under order)\b/i.test(cleanContent)
          && !/\b(?:not|never)\s+(?:been\s+)?(?:debarred|blacklisted|suspended|ineligible|disqualified)\b/i.test(cleanContent);
        if (!hasTargetIdentity || !hasSubstantiveFinding) {
          sourceErrors.push({
            url: item.url,
            error: !hasTargetIdentity
              ? 'Fetched page did not establish a connection to the target company; excluded from evidence.'
              : 'Fetched page did not support a substantive debarment, suspension, or ineligibility finding; excluded from evidence.',
          });
          continue;
        }
        articles.push({
          ...item,
          title: typeof row.title === 'string' && row.title.trim() ? row.title : item.title,
          url: typeof row.final_url === 'string' ? row.final_url : item.url,
          snippet: this.cleanExcerpt(content, [entityName, ...identifiers]),
          expandedText: this.cleanText(content).slice(0, 4000),
          publishedDate: typeof row.published_date === 'string' ? row.published_date : item.publishedDate,
          retrievedAt: fetchedAt,
          query: sourceQuery,
        });
      }
    }

    const normalizedIdentifiers = identifiers.map((value) => value.toLowerCase());
    for (const article of articles) {
      if (article.directSourceAvailable === false) continue;
      const content = `${article.title} ${article.snippet} ${article.expandedText || ''}`.toLowerCase();
      const compactContent = content.replace(/[^a-z0-9]/g, '');
      const identifierMatch = identifiers.find((identifier) => identifier && compactContent.includes(identifier.toLowerCase().replace(/[^a-z0-9]/g, '')));
      const exactName = compactContent.includes(entityName.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const hasRiskContext = /\b(?:is|was|has been|hereby|stands)\s+(?:formally\s+)?(?:debarred|blacklisted|suspended|declared ineligible|disqualified)\b|\b(?:debarred|blacklisted|suspended|declared ineligible|disqualified)\s+(?:from|for|by|until|with effect|under order)\b/i.test(content)
        && !/\b(?:not|never)\s+(?:been\s+)?(?:debarred|blacklisted|suspended|ineligible|disqualified)\b/i.test(content);
      (article as any).identityMatchNote = identifierMatch ? `Exact supplied identifier found in fetched source: ${identifierMatch}.` : exactName ? 'Exact legal name found, but no supplied identifier confirms identity; manual review required.' : 'Vendor identity not established from fetched content.';
      (article as any).matchStatus = identifierMatch && hasRiskContext ? 'MATCH_FOUND' : hasRiskContext && exactName ? 'UNVERIFIED' : 'NO_MATCH';
    }
    const matched = articles.some((article) => article.matchStatus === 'MATCH_FOUND');
    const unverified = articles.some((article) => article.matchStatus === 'UNVERIFIED');
    const result: WebInvestigationSearchResult = {
      success: true,
      status: 'LIVE',
      query,
      articles,
      evidenceOutcome: sourceErrors.length > 0 || unverified ? 'SOURCE_UNAVAILABLE' : matched ? 'MATCH_FOUND' : 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES',
      sourceErrors,
      upstreamRequestId: responses.find((response) => response.requestId)?.requestId || null,
      isMock: false,
    };
    registryCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  }

  public async searchLitigationContext(
    entityName: string,
    options: { limit?: number; signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<WebInvestigationSearchResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'TINYFISH_API_KEY not configured.',
        isMock: false,
      };
    }

    const limit = options.limit || 5;
    const query = `"${entityName}" (NCLT OR "High Court" OR "Supreme Court of India" OR "disposed" OR "insolvency" OR "Section 7" OR "Section 9 IBC")`;
    const url = this.buildSearchUrl(query);

    const res = await executeHardenedRequest(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      timeoutMs: options.timeoutMs ?? 45000,
      maxRetries: 0,
      signal: options.signal,
    });

    if (!res.ok) {
      return {
        success: false,
        status: res.appStatus,
        errorCategory: res.errorCategory,
        upstreamRequestId: res.upstreamRequestId,
        message: res.errorMessage,
        isMock: false,
      };
    }

    const articles = this.normalizeArticles(res.data, limit, 'services.ecourts.gov.in');

    return {
      success: true,
      status: 'LIVE',
      upstreamRequestId: res.upstreamRequestId,
      articles,
      isMock: false,
    };
  }
}

export const tinyfish = new LiveTinyFishProvider();
