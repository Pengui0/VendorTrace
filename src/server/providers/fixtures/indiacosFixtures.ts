/**
 * Synthetic IndiaCos-shaped fixtures for deterministic demo and test execution.
 * These are not live registry records. Every fixture URL uses the reserved .invalid domain.
 */

export const TATA_STEEL_CIN_FIXTURE = {
  legal_name: 'TATA STEEL LIMITED',
  trade_name: 'Tata Steel',
  cin: 'L27100MH1907PLC000260',
  pan: 'AAACT2727Q',
  gstin: '27AAACT2727Q1ZW',
  company_status: 'ACTIVE',
  entity_type: 'COMPANY' as const,
  incorporation_date: '1907-08-26',
  business_category: 'Company limited by Shares / Non-govt public company',
  class_of_company: 'Public',
  registered_address: 'Bombay House, 24 Homi Mody Street, Fort, Mumbai, Maharashtra 400001, India',
  source_url: 'https://mca-fixture.vendortrace.invalid/company/L27100MH1907PLC000260',
  last_updated_at: '2026-10-24T05:30:00.000Z',
  directors: [
    {
      din: '00000001',
      name: 'Natarajan Chandrasekaran',
      designation: 'Chairman & Non-Executive Director',
      appointment_date: '2017-02-21',
    },
    {
      din: '00011111',
      name: 'Thachat Viswanath Narendran',
      designation: 'Managing Director & CEO',
      appointment_date: '2013-11-01',
    },
  ],
  charges: [
    {
      charge_id: 'CHG_1001',
      holder_name: 'State Bank of India',
      amount_inr: 1500000000,
      date_of_creation: '2018-04-12',
      status: 'CLOSED',
    },
    {
      charge_id: 'CHG_1002',
      holder_name: 'HDFC Bank Limited',
      amount_inr: 2500000000,
      date_of_creation: '2021-09-15',
      status: 'SATISFIED',
    },
  ],
};

export const PROPRIETORSHIP_GSTIN_FIXTURE = {
  legal_name: 'RAJESH SHARMA',
  trade_name: 'SHARMA INDUSTRIAL FASTENERS',
  cin: null, // Proprietorship has NO Corporate Identification Number
  pan: 'AAAAA0000A',
  gstin: '07AAAAA0000A1Z5',
  company_status: 'Active',
  entity_type: 'PROPRIETORSHIP' as const,
  constitution_of_business: 'Sole Proprietorship',
  registration_date: '2018-07-01',
  principal_place_address: 'Shop 14, Okhla Industrial Area Phase II, New Delhi, Delhi 110020, India',
  source_url: 'https://gst-fixture.vendortrace.invalid/taxpayer/07AAAAA0000A1Z5',
  last_updated_at: '2026-10-20T10:15:00.000Z',
};

export const LLPIN_FIXTURE = {
  legal_name: 'APEX DIGITAL CONSULTING LLP',
  trade_name: 'Apex Digital Consulting',
  cin: null,
  llpin: 'AAA-1234',
  gstin: '29AAALA1234F1Z0',
  company_status: 'ACTIVE',
  entity_type: 'LLP' as const,
  incorporation_date: '2019-03-14',
  business_category: 'Limited Liability Partnership',
  registered_address: 'Level 5, Cyber Park, Electronic City, Bengaluru, Karnataka 560100, India',
  source_url: 'https://mca-fixture.vendortrace.invalid/llp/AAA-1234',
  last_updated_at: '2026-10-22T08:00:00.000Z',
  directors: [
    {
      din: '08123456',
      name: 'Suresh Menon',
      designation: 'Designated Partner',
      appointment_date: '2019-03-14',
    },
  ],
};

export const MULTI_CANDIDATE_SEARCH_FIXTURE = [
  {
    id: 'cand_1',
    canonicalName: 'APEX INFRASTRUCTURE PRIVATE LIMITED',
    tradeName: 'Apex Infra Projects',
    identifierType: 'CIN' as const,
    identifierValue: 'U45200MH2015PTC261234',
    companyStatus: 'ACTIVE',
    entityType: 'COMPANY' as const,
    registeredAddress: 'Unit 402, Trade Tower, Bandra Kurla Complex, Mumbai 400051',
    state: 'Maharashtra',
    sourceUrl: 'https://mca-fixture.vendortrace.invalid/search-candidate',
    identityMatchMethod: 'NAME_MATCH' as const,
    ambiguityNote: 'Synthetic candidate fixture for disambiguation testing; verify any real entity in live mode.',
  },
  {
    id: 'cand_2',
    canonicalName: 'APEX INFRA PROJECTS LIMITED',
    tradeName: 'Apex Infra Public',
    identifierType: 'CIN' as const,
    identifierValue: 'U45201DL2012PLC238765',
    companyStatus: 'STRIKE_OFF',
    entityType: 'COMPANY' as const,
    registeredAddress: 'Barakhamba Road, Connaught Place, New Delhi 110001',
    state: 'Delhi',
    sourceUrl: 'https://mca-fixture.vendortrace.invalid/search-candidate',
    identityMatchMethod: 'NAME_MATCH' as const,
    ambiguityNote: 'Synthetic candidate fixture for disambiguation testing; status is illustrative and not a live registry result.',
  },
  {
    id: 'cand_3',
    canonicalName: 'APEX INFRACON LLP',
    tradeName: 'Apex Infracon',
    identifierType: 'LLPIN' as const,
    identifierValue: 'AAB-5678',
    companyStatus: 'ACTIVE',
    entityType: 'LLP' as const,
    registeredAddress: 'SG Highway, Bodakdev, Ahmedabad, Gujarat 380054',
    state: 'Gujarat',
    sourceUrl: 'https://mca-fixture.vendortrace.invalid/search-candidate',
    identityMatchMethod: 'NAME_MATCH' as const,
    ambiguityNote: 'Requires manual selection: registered as Limited Liability Partnership.',
  },
];
