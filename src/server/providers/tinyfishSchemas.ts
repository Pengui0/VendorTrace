/**
 * Typed Top-Level JSON Object Schemas for TinyFish Web Agent Extractions
 * Strictly adheres to TinyFish's output_schema capability.
 * Every schema is a top-level JSON Object ('type': 'object').
 */

/**
 * 1. Court / Litigation Schema
 */
export const COURT_LITIGATION_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['has_litigation_records', 'matters'],
  properties: {
    has_litigation_records: {
      type: 'boolean',
      description: 'True if active or historical litigation proceedings involving the entity were found',
    },
    total_matters_found: {
      type: 'number',
      description: 'Total number of distinct court matters found',
    },
    matters: {
      type: 'array',
      description: 'List of litigation cases or court proceedings found',
      items: {
        type: 'object',
        required: ['case_title', 'court_name', 'status', 'snippet'],
        properties: {
          case_title: {
            type: 'string',
            description: 'Title of the case or petition (e.g. ABC Corp vs Registrar of Companies)',
          },
          court_name: {
            type: 'string',
            description: 'Name of the forum or court (e.g. NCLT Mumbai, Delhi High Court, Supreme Court of India)',
          },
          case_number: {
            type: 'string',
            description: 'Official case or petition registration number if provided, or null',
          },
          filing_year: {
            type: 'string',
            description: 'Filing year or date string',
          },
          status: {
            type: 'string',
            enum: ['alleged', 'pending', 'dismissed', 'disposed', 'settled', 'confirmed', 'unknown'],
            description: 'Current procedural stage of the case',
          },
          snippet: {
            type: 'string',
            description: 'Verbatim quoted excerpt or key procedural finding from the court record',
          },
          source_url: {
            type: 'string',
            description: 'Direct URL to the e-courts case status page or order PDF',
          },
        },
      },
    },
  },
};

/**
 * 2. Debarment & Blacklist / Penalty Schema
 */
export const BLACKLIST_DEBARMENT_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['is_debarred_or_penalized', 'records'],
  properties: {
    is_debarred_or_penalized: {
      type: 'boolean',
      description: 'True if debarment, blacklist, or official regulatory penalty orders were found',
    },
    records: {
      type: 'array',
      description: 'Debarment, disciplinary, or penalty records identified',
      items: {
        type: 'object',
        required: ['issuing_authority', 'record_title', 'status', 'snippet'],
        properties: {
          issuing_authority: {
            type: 'string',
            description: 'Public authority (e.g. GeM, CVC, SEBI, Ministry of Defence, World Bank)',
          },
          record_title: {
            type: 'string',
            description: 'Title or summary of the debarment order or notice',
          },
          penalty_type: {
            type: 'string',
            description: 'Debarment, disqualification, or monetary penalty',
          },
          order_date: {
            type: 'string',
            description: 'Date order was issued if specified',
          },
          status: {
            type: 'string',
            description: 'Active debarment, expired, stayed by court, or dismissed',
          },
          snippet: {
            type: 'string',
            description: 'Verbatim text excerpt stating debarment grounds or period',
          },
          source_url: {
            type: 'string',
            description: 'Official portal URL where debarment was listed',
          },
        },
      },
    },
  },
};

/**
 * 3. Adverse Media & Negative News Schema
 */
export const ADVERSE_NEWS_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['has_negative_news', 'articles'],
  properties: {
    has_negative_news: {
      type: 'boolean',
      description: 'True if credible adverse news reporting on the vendor was found in the recent window',
    },
    articles: {
      type: 'array',
      description: 'Relevant adverse news articles',
      items: {
        type: 'object',
        required: ['headline', 'source_domain', 'snippet'],
        properties: {
          headline: {
            type: 'string',
            description: 'Article headline',
          },
          source_domain: {
            type: 'string',
            description: 'Domain name of the publication (e.g. economictimes.indiatimes.com, livemint.com)',
          },
          source_url: {
            type: 'string',
            description: 'Direct link to the published article',
          },
          published_date: {
            type: 'string',
            description: 'Publication date string (ISO format or formatted date)',
          },
          snippet: {
            type: 'string',
            description: 'Direct short factual snippet describing allegations or regulatory actions',
          },
          is_press_release_syndication: {
            type: 'boolean',
            description: 'True if article is an unedited wire syndication (e.g. ANI, PR Newswire, PTI)',
          },
        },
      },
    },
  },
};
