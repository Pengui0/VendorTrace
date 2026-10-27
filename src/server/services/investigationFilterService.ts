/**
 * VendorTrace Investigation Filter & Search Service
 * Supports multi-attribute filtering by vendor name, identifiers, status, review priority, date, and dimension.
 */

import { Investigation } from '../../types/vendor.js';
import { RiskDimension } from '../../types/riskFinding.js';

export interface InvestigationFilterCriteria {
  vendor?: string;
  identifier?: string;
  status?: string;
  reviewPriority?: string;
  dateFrom?: string;
  dateTo?: string;
  dimension?: RiskDimension | string;
  page?: number;
  limit?: number;
}

export interface PaginatedInvestigationResult {
  items: Investigation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  appliedFilters: Record<string, any>;
}

export class InvestigationFilterService {
  /**
   * Filters a list of investigations according to strict compliance query criteria.
   */
  public filterInvestigations(
    investigations: Investigation[],
    criteria: InvestigationFilterCriteria = {}
  ): PaginatedInvestigationResult {
    const page = Math.max(1, Number(criteria.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(criteria.limit) || 20)); // Clamped max 50 for safety

    let filtered = [...investigations];
    const appliedFilters: Record<string, any> = {};

    // 1. Vendor Name Filter (Case-insensitive substring)
    if (criteria.vendor && criteria.vendor.trim().length > 0) {
      const q = criteria.vendor.trim().toLowerCase();
      filtered = filtered.filter((inv) =>
        inv.targetName.toLowerCase().includes(q) ||
        (inv.requestedBy && inv.requestedBy.toLowerCase().includes(q))
      );
      appliedFilters.vendor = criteria.vendor.trim();
    }

    // 2. Identifier Filter (CIN, GSTIN, PAN exact or normalized match)
    if (criteria.identifier && criteria.identifier.trim().length > 0) {
      const cleanId = criteria.identifier.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      filtered = filtered.filter((inv) => {
        const val = (inv.identifierValue || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return val.includes(cleanId);
      });
      appliedFilters.identifier = criteria.identifier.trim();
    }

    // 3. Status Filter (COMPLETED, PARTIAL_FAILURE, FAILED)
    if (criteria.status && criteria.status.trim().length > 0) {
      const statusUpper = criteria.status.trim().toUpperCase();
      filtered = filtered.filter((inv) => inv.status.toUpperCase() === statusUpper);
      appliedFilters.status = statusUpper;
    }

    // 4. Review Priority Filter (ELEVATED_REVIEW_PRIORITY, REVIEW_RECOMMENDED, etc.)
    if (criteria.reviewPriority && criteria.reviewPriority.trim().length > 0) {
      const priority = criteria.reviewPriority.trim().toUpperCase();
      filtered = filtered.filter((inv) => {
        const actual = inv.assessmentReport?.overallReviewPriority?.toUpperCase();
        return actual === priority;
      });
      appliedFilters.reviewPriority = priority;
    }

    // 5. Date Range Filter
    if (criteria.dateFrom) {
      const fromTime = new Date(criteria.dateFrom).getTime();
      if (!isNaN(fromTime)) {
        filtered = filtered.filter((inv) => new Date(inv.createdAt).getTime() >= fromTime);
        appliedFilters.dateFrom = criteria.dateFrom;
      }
    }

    if (criteria.dateTo) {
      const toTime = new Date(criteria.dateTo).getTime();
      if (!isNaN(toTime)) {
        filtered = filtered.filter((inv) => new Date(inv.createdAt).getTime() <= toTime);
        appliedFilters.dateTo = criteria.dateTo;
      }
    }

    // 6. Dimension Filter (Returns reports having signals in specified dimension)
    if (criteria.dimension && criteria.dimension.trim().length > 0) {
      const dim = criteria.dimension.trim().toLowerCase();
      filtered = filtered.filter((inv) => {
        // Check normalizedFindings
        if (inv.normalizedFindings && inv.normalizedFindings.some((rf) => rf.dimension.toLowerCase() === dim)) {
          return true;
        }
        // Check legacy findings
        return inv.findings && inv.findings.some((f) => f.category?.toLowerCase() === dim || (f as any).findingType?.toLowerCase() === dim);
      });
      appliedFilters.dimension = dim;
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages,
      appliedFilters,
    };
  }
}

export const investigationFilterService = new InvestigationFilterService();
