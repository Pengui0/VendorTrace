# VendorTrace — Enterprise Vendor Due Diligence & Entity Tracing

VendorTrace is a high-integrity, evidence-backed B2B vendor due-diligence SaaS platform designed for Indian procurement and compliance officers. It investigates company registries, GST compliance, court litigation, debarment/penalties, and adverse media while tracing ownership and cross-validating claims across independent sources.

---

## 1. Core Mission & Design Principles

1. **No Manufactured Findings**: Never invent risk flags or present clean states without proof. If a source is unavailable or unconfigured, it is explicitly labeled **"Source Unavailable"** or **"Not Configured"**.
2. **Proved Cross-Validation**: Findings supported by only one source are labeled **"Requires Human Review"**. Findings supported by 2+ independent sources are marked **"Corroborated"**. Conflicting registry data is flagged for officer reconciliation.
3. **Lawful Entity Tracing**: Director (DIN), registered address, CIN, and GSTIN links represent leads for manual review—not automatic proof of wrongdoing.
4. **Transparent Provenance**: Every finding displays source URLs, snippets, registry timestamps, and provenance metadata.
5. **No AI Hallucinations / Slop**: No decorative charts or fake metric dashboards. Real stored counts or `—` when data is absent.

---

## 2. Technical Architecture & File Structure

```
                      ┌───────────────────────────────────────────┐
                      │    Client (React 19 + TypeScript + Vite)   │
                      │  - App Shell: Sidebar, TopBar, Views      │
                      │  - Views: Overview, Investigations,       │
                      │    Vendors, Monitoring, Settings          │
                      │  - UI: Reusable Table, Modal, Badges,     │
                      │    EvidenceList, GraphPlaceholder         │
                      └─────────────────────┬─────────────────────┘
                                            │ HTTP / JSON
                                            ▼
                      ┌───────────────────────────────────────────┐
                      │    Node.js Express Backend (server.ts)    │
                      │  - Route Handlers (/api/*)                │
                      │  - Environment & Secret Guards            │
                      └─────────────┬─────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌─────────────────┐       ┌────────────────────┐     ┌─────────────────────┐
│ IndiaCos Driver │       │  TinyFish Provider │     │ Persistence Layer   │
│ - MCA21 / CIN   │       │  - Adverse Media   │     │ - File/Firestore    │
│ - GSTN / PAN    │       │  - Regulatory News │     │ - Investigations,   │
│ - Director DIN  │       │  - Evidence URLs   │     │   Vendors, Signals  │
└─────────────────┘       └────────────────────┘     └─────────────────────┘
```

---

## 3. API Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service status, timestamp, and environment verification |
| `GET` | `/api/connectors` | Status of external connectors (MCA21, GSTN, Courts, TinyFish) |
| `GET` | `/api/stats` | Stored investigation counts, vendor counts, and signal breakdowns |
| `GET` | `/api/investigations` | List historical investigations |
| `POST` | `/api/investigations` | Start a new due diligence run with identifier & options |
| `GET` | `/api/investigations/:id` | Fetch full report with findings, evidence, and entity leads |
| `GET` | `/api/vendors` | List tracked vendors in workspace |
| `POST` | `/api/monitoring/compare` | Compute formal diff between two investigation runs |

---

## 4. Visual Direction & Design Tokens

- **Canvas**: Warm off-white (`#FAF8F5`)
- **Card Background**: Clean white (`#FFFFFF`) with warm neutral border (`#EAE6DF`)
- **Typography**: Dark charcoal (`#1C1F26`), muted secondary text (`#5F6572`)
- **Status Accents**:
  - Positive / Verified: Restrained Forest Green (`#15803D`, `bg-emerald-50`, `text-emerald-800`)
  - Caution / Review: Warm Amber (`#B45309`, `bg-amber-50`, `text-amber-800`)
  - Material Risk: Crimson (`#B91C1C`, `bg-red-50`, `text-red-800`)
  - Neutral / Pending / Unavailable: Slate Gray (`#64748B`, `bg-slate-50`, `text-slate-700`)
