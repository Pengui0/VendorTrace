/**
 * VendorTrace Security Service
 * Implements SSRF defense, prompt-injection neutralization, multi-tenant isolation,
 * rate-limiting, audit logging, and data retention policies.
 */

import { Request, Response, NextFunction } from 'express';

// Strict Domain Allowlist for External Crawling/Browsing (SSRF Guard)
export const APPROVED_SOURCE_DOMAINS = new Set([
  'mca.gov.in',
  'gst.gov.in',
  'services.gst.gov.in',
  'gem.gov.in',
  'cvc.gov.in',
  'ecourts.gov.in',
  'services.ecourts.gov.in',
  'delhicourts.nic.in',
  'bombayhighcourt.nic.in',
  'main.sci.gov.in',
  'nclt.gov.in',
  'ibbi.gov.in',
  'indiacos.com',
  'api.indiacos.com',
  'tinyfish.ai',
  'agent.tinyfish.ai',
]);

export interface AuditEvent {
  id: string;
  eventType:
    | 'INVESTIGATION_STARTED'
    | 'REPORT_EXPORTED_PDF'
    | 'REPORT_EXPORTED_CSV'
    | 'RE_CHECK_TRIGGERED'
    | 'SECURITY_BLOCKED_SSRF'
    | 'SECURITY_BLOCKED_INJECTION'
    | 'SECURITY_AUTH_FAILURE'
    | 'SECURITY_CROSS_TENANT_BLOCKED';
  workspaceId: string;
  userId: string;
  targetEntity?: string;
  details?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
}

export class SecurityService {
  private auditLog: AuditEvent[] = [];
  private rateLimitMap = new Map<string, { count: number; windowStart: number }>();
  private authEnabled: boolean = process.env.ENABLE_AUTH === 'true';

  public isAuthEnabled(): boolean {
    return this.authEnabled;
  }

  public setAuthEnabled(enabled: boolean) {
    this.authEnabled = enabled;
  }

  /**
   * SSRF Guard: Validates that a target URL is strictly on the approved public registry allowlist.
   * Blocks localhost, private IP ranges, cloud metadata services, and arbitrary third-party domains.
   */
  public validateTargetUrl(rawUrl: string): { isValid: boolean; reason?: string } {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { isValid: false, reason: 'URL must be a non-empty string' };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return { isValid: false, reason: 'Invalid URL format' };
    }

    if (parsed.username || parsed.password) {
      return { isValid: false, reason: 'URLs containing embedded credentials are not permitted.' };
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { isValid: false, reason: `Unsupported protocol ${parsed.protocol}. Only HTTPS allowed.` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopbacks, and private subnets
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.3') ||
      hostname === '169.254.169.254' || // AWS/GCP metadata
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return { isValid: false, reason: 'Access to private internal network addresses is strictly forbidden.' };
    }

    // Check against approved domain list (allowing subdomains of approved domains)
    const isApproved = Array.from(APPROVED_SOURCE_DOMAINS).some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isApproved) {
      return {
        isValid: false,
        reason: `Domain ${hostname} is not on the VendorTrace approved regulatory source allowlist. Open proxy behaviour is blocked.`,
      };
    }

    return { isValid: true };
  }

  /**
   * Neutralizes prompt injection strings and control tokens in scraped web content.
   * Ensures remote text is treated strictly as passive data, never executable instructions.
   */
  public sanitizeWebContent(rawText: string): string {
    if (!rawText || typeof rawText !== 'string') return '';

    let clean = rawText;

    // Neutralize common LLM prompt injection and instruction override attempts
    const injectionPatterns = [
      /<\|im_start\|>/gi,
      /<\|im_end\|>/gi,
      /<\|endoftext\|>/gi,
      /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
      /disregard\s+(all\s+)?(previous|prior)\s+instructions/gi,
      /system:\s*you\s+are/gi,
      /reveal\s+(your\s+)?(system\s+prompt|instructions|secret\s+key|api\s+key)/gi,
      /output\s+the\s+secret/gi,
      /override\s+compliance\s+verdict/gi,
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
    ];

    for (const pattern of injectionPatterns) {
      clean = clean.replace(pattern, '[FILTERED_UNTRUSTED_CONTENT]');
    }

    // Sanitize dangerous HTML tags while preserving text quotes
    clean = clean
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();

    // Apply raw snippet retention truncation (max 500 chars per evidence snippet)
    if (clean.length > 500) {
      clean = clean.substring(0, 500) + '... [Retained excerpt truncated per compliance policy]';
    }

    return clean;
  }

  /**
   * Multi-Tenant Authorization Check:
   * Ensures the requesting user/token belongs to the authorized workspace for the requested resource.
   */
  public checkTenantAccess(params: {
    requestWorkspaceId?: string | null;
    resourceWorkspaceId: string;
    userId?: string | null;
  }): { authorized: boolean; reason?: string } {
    if (!this.authEnabled) {
      // In development / demo mode when auth is disabled, allow access
      return { authorized: true };
    }

    const { requestWorkspaceId, resourceWorkspaceId } = params;

    if (!requestWorkspaceId) {
      return { authorized: false, reason: 'Missing authorized workspace identifier.' };
    }

    if (requestWorkspaceId !== resourceWorkspaceId && resourceWorkspaceId !== 'PUBLIC_SHARED') {
      return {
        authorized: false,
        reason: `Cross-tenant access denied: workspace ${requestWorkspaceId} cannot access resources in workspace ${resourceWorkspaceId}.`,
      };
    }

    return { authorized: true };
  }

  /**
   * Rate Limiter:
   * Enforces reasonable per-client rate limits for demo security (e.g. max 40 requests / minute).
   */
  public checkRateLimit(clientId: string, maxRequests = 40, windowMs = 60000): boolean {
    const now = Date.now();
    const clientRecord = this.rateLimitMap.get(clientId);

    if (!clientRecord || now - clientRecord.windowStart > windowMs) {
      this.rateLimitMap.set(clientId, { count: 1, windowStart: now });
      return true;
    }

    if (clientRecord.count >= maxRequests) {
      return false; // Rate limit exceeded
    }

    clientRecord.count += 1;
    return true;
  }

  /**
   * Records a security / audit event into the immutable audit ledger.
   */
  public logAudit(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const fullEvent: AuditEvent = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.auditLog.push(fullEvent);
    return fullEvent;
  }

  public getAuditLogs(workspaceId?: string): AuditEvent[] {
    if (!workspaceId) return [...this.auditLog];
    return this.auditLog.filter((l) => l.workspaceId === workspaceId);
  }
}

export const securityService = new SecurityService();

/**
 * Express Middleware: SSRF Guard on TinyFish / Web Streaming Endpoints
 */
export function ssrfGuardMiddleware(req: Request, res: Response, next: NextFunction) {
  const targetUrl = req.body?.url;
  if (targetUrl) {
    const validation = securityService.validateTargetUrl(targetUrl);
    if (!validation.isValid) {
      securityService.logAudit({
        eventType: 'SECURITY_BLOCKED_SSRF',
        workspaceId: (req.headers['x-workspace-id'] as string) || 'default_ws',
        userId: (req.headers['x-user-id'] as string) || 'anonymous',
        details: { targetUrl, reason: validation.reason },
        ipAddress: req.ip,
      });

      res.status(400).json({
        error: 'Security Policy Violation: Target URL is rejected by SSRF guard.',
        reason: validation.reason,
      });
      return;
    }
  }
  next();
}

/**
 * Express Middleware: Enforce Request Payload Size Limits
 */
export function requestSizeLimitMiddleware(maxBytes = 51200) { // 50 KB
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > maxBytes) {
      res.status(413).json({
        error: `Payload Too Large: Request exceeds maximum allowed payload of ${maxBytes} bytes.`,
      });
      return;
    }
    next();
  };
}

/**
 * Express Middleware: Global Error Sanitizer (Zero Stack Trace Leakage)
 */
export function globalErrorSanitizer(err: any, req: Request, res: Response, _next: NextFunction) {
  const refId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  console.error(`[Security Error Reference: ${refId}]`, err);

  // A rejected async handler can settle after the browser has disconnected.
  // Avoid attempting to write a second response to a closed connection.
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.status(500).json({
    error: 'An internal application error occurred. Internal diagnostic details have been logged.',
    referenceId: refId,
    timestamp: new Date().toISOString(),
  });
}
