import { tinyfish } from '../providers/tinyfish.js';
import { registryCache } from '../providers/cache.js';

export async function runTinyFishDebarmentTests(): Promise<{
  success: boolean;
  assertionsPassed: number;
  assertionsFailed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let assertionsPassed = 0;
  let assertionsFailed = 0;
  const assert = (condition: boolean, description: string) => {
    if (condition) {
      assertionsPassed += 1;
      logs.push(`[PASS] ${description}`);
    } else {
      assertionsFailed += 1;
      logs.push(`[FAIL] ${description}`);
    }
  };

  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.TINYFISH_API_KEY;
  process.env.TINYFISH_API_KEY = 'tinyfish-debarment-test-key';
  registryCache.clear();
  const searchRequests: Array<{ url: URL; headers: Headers }> = [];
  let fetchBody: Record<string, unknown> | null = null;
  let timeoutFetch = false;
  let returnUnrelatedPdf = false;
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
    assert(headers.get('X-API-Key') === 'tinyfish-debarment-test-key', 'Search and Fetch use the server-side TinyFish API key header');
      if (init?.method === 'POST') {
        fetchBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        const requested = (fetchBody.urls as string[]) || [];
        if (timeoutFetch) return new Response(JSON.stringify({ results: [], errors: requested.map((url) => ({ url, error: 'timeout' })) }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({
          results: requested.filter((value) => value !== 'https://cvc.gov.in/not-accessible').map((url) => ({
            url,
            final_url: url,
            title: 'Public procurement suspension order',
            published_date: '2026-02-10',
            text: returnUnrelatedPdf
              ? 'General procurement guidelines explain how debarment and suspension policy works for public tenders. No supplier is named and no order or finding is made.'
              : url.includes('thehindu.com')
              ? 'ACME INDUSTRIAL LTD CIN U12345DL2000PTC123456 fraud investigation. *Relevant finding*'
              : 'ACME INDUSTRIAL LTD CIN U12345DL2000PTC123456 was suspended from public procurement. *Relevant finding*',
          })),
          errors: [{ url: 'https://cvc.gov.in/not-accessible', error: 'bot_blocked' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      searchRequests.push({ url, headers });
      const results = returnUnrelatedPdf ? [
        { title: 'General Procurement Guidelines PDF', url: 'https://gem.gov.in/notices/general-procurement-guidelines.pdf', snippet: 'General debarment and suspension policy for tender participants' },
      ] : url.searchParams.get('domain_type') === 'news' ? [
        { title: 'ACME INDUSTRIAL LTD investigated', url: 'https://thehindu.com/news/42', snippet: 'ACME INDUSTRIAL LTD fraud investigation' },
      ] : [
        { title: 'Official order', url: 'https://gem.gov.in/orders/42', snippet: 'Suspension order' },
        { title: 'Official notice', url: 'https://cvc.gov.in/not-accessible', snippet: 'Blacklisting notice' },
        { title: 'Foreign procurement guide', url: 'https://example.co.uk/guide', snippet: 'Generic debarment policy' },
      ];
      return new Response(JSON.stringify({ query: url.searchParams.get('query'), results }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await tinyfish.searchDebarment('ACME INDUSTRIAL LTD', {
      identifiers: ['U12345DL2000PTC123456', '07ABCDE1234F1Z9'],
      limit: 5,
      timeoutMs: 5000,
    });
    assert(result.success && searchRequests.length === 1, 'Runs one bounded official-domain search with no unrestricted fallback');
    assert(Boolean(searchRequests[0]?.url.searchParams.get('include_domains')?.includes('assets-bg.gem.gov.in') && searchRequests[0]?.url.searchParams.get('include_domains')?.includes('doe.gov.in')), 'Search enforces the documented procurement domains');
    assert(searchRequests[0]?.url.searchParams.get('location') === 'IN' && searchRequests[0]?.url.searchParams.get('language') === 'en', 'Search is localized to India and English');
    const query = searchRequests[0]?.url.searchParams.get('query') || '';
    assert(query.includes('ACME INDUSTRIAL LTD') && query.includes('U12345DL2000PTC123456') && /debarment/i.test(query) && /blacklist/i.test(query) && /suspension/i.test(query), 'Search query includes exact vendor name, identifiers, and risk terms');
    const body = fetchBody as { urls?: string[]; format?: string; per_url_timeout_ms?: number } | null;
    assert(Boolean(body?.urls?.length === 2 && body.urls[0] === 'https://gem.gov.in/orders/42' && !body.urls.includes('https://example.co.uk/guide')), 'Fetch excludes foreign results and is bounded to relevant official sources');
    assert(Boolean(body?.format === 'markdown' && body.per_url_timeout_ms === 20000), 'Fetch requests bounded Markdown source retrieval');
    assert(Boolean(result.articles?.[0]?.snippet.includes('was suspended') && !result.articles[0].snippet.includes('*') && result.articles[0].retrievedAt && result.articles[0].query && result.articles[0].identityMatchNote), 'Returned evidence contains a clean excerpt, retrieval timestamp, query, and identity rationale');
    assert(Boolean(result.sourceErrors?.some((item) => item.url === 'https://cvc.gov.in/not-accessible')), 'Inaccessible source errors are preserved alongside successful fetched pages');
    const nameOnly = await tinyfish.searchDebarment('ACME INDUSTRIAL LTD', { identifiers: [], freshRun: true });
    assert(Boolean(nameOnly.evidenceOutcome === 'SOURCE_UNAVAILABLE' && nameOnly.articles?.some((article) => article.matchStatus === 'UNVERIFIED')), 'A debarment document without a supplied exact identifier remains unverified, not a match or clean result');
    timeoutFetch = true;
    const timedOutFetch = await tinyfish.searchDebarment('ACME INDUSTRIAL LTD', { identifiers: ['U12345DL2000PTC123456'], freshRun: true });
    assert(Boolean(timedOutFetch.evidenceOutcome === 'SOURCE_UNAVAILABLE' && timedOutFetch.articles?.every((article) => !article.snippet && article.directSourceAvailable === false && article.sourceFetchError && /no page content was retrieved/i.test(article.identityMatchNote || ''))), 'Timed-out fetches remain unavailable, carry no fabricated excerpt, and cannot claim identity review');
    timeoutFetch = false;
    returnUnrelatedPdf = true;
    const unrelatedPdf = await tinyfish.searchDebarment('ACME INDUSTRIAL LTD', { identifiers: ['U12345DL2000PTC123456'], freshRun: true });
    assert(Boolean(unrelatedPdf.success && !unrelatedPdf.articles?.some((article) => article.url === 'https://gem.gov.in/notices/general-procurement-guidelines.pdf') && unrelatedPdf.sourceErrors?.some((item) => item.url === 'https://gem.gov.in/notices/general-procurement-guidelines.pdf' && /excluded from evidence/i.test(item.error))), 'Unrelated procurement PDF is excluded and cannot be represented as debarment evidence');
    assert(unrelatedPdf.evidenceOutcome === 'SOURCE_UNAVAILABLE', 'Rejected unrelated source remains unavailable for review, never a verified clean or debarment result');
    returnUnrelatedPdf = false;
    const previousSearchCount = searchRequests.length;
    const previousFetchCount = (globalThis.fetch as any).__fetchCount || 0;
    await tinyfish.searchDebarment('ACME INDUSTRIAL LTD', { identifiers: ['U12345DL2000PTC123456', '07ABCDE1234F1Z9'] });
    assert(searchRequests.length === previousSearchCount, 'Identical query uses the short-lived cache');
    const fresh = await tinyfish.searchDebarment('ACME INDUSTRIAL LTD', { identifiers: ['U12345DL2000PTC123456', '07ABCDE1234F1Z9'], freshRun: true });
    assert(fresh.success && searchRequests.length === previousSearchCount + 1, 'Fresh-run option bypasses the search cache');
    const media = await tinyfish.searchAdverseMedia('ACME INDUSTRIAL LTD', { identifiers: ['U12345DL2000PTC123456'], freshRun: true });
    assert(media.success && media.articles?.length === 1 && media.evidenceOutcome === 'MATCH_FOUND', 'Adverse-media search fetches and matches an attributable source independently');
    assert(Boolean(searchRequests[searchRequests.length - 1]?.url.searchParams.get('domain_type') === 'news' && searchRequests[searchRequests.length - 1]?.url.searchParams.get('query')?.includes('U12345DL2000PTC123456')), 'Adverse-media query uses news mode and the supplied identifier');
    void previousFetchCount;
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = originalApiKey;
  }

  return { success: assertionsFailed === 0, assertionsPassed, assertionsFailed, logs };
}
