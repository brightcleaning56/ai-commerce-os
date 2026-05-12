import type { BusinessRecord, BusinessSource } from "@/lib/store";

/**
 * Forgiving CSV → BusinessRecord row mapper.
 *
 * Eric's existing prospect lists (Bright Clean, SafeNight, DentistNow,
 * partner spreadsheets) all use slightly different column headers. Rather
 * than force a strict schema, this module maps every common synonym to
 * the canonical field name so any reasonable export "just works".
 *
 * Strategy:
 *   1. Parse CSV — handles quoted values, embedded commas/newlines, CRLF
 *   2. Lowercase + strip non-alnum from each header
 *   3. Look up in HEADER_MAP to find the canonical BusinessRecord field
 *   4. Per row: build a partial BusinessRecord, normalize values
 *   5. Return per-row results so the API can report per-row errors
 *
 * Validation is loose: only `name` is required. Records with no name get
 * a "skipped" outcome so the operator can see how many rows were dropped.
 */

export type ImportableBusinessFields = Omit<BusinessRecord, "id" | "createdAt" | "updatedAt">;

export type ImportRowResult =
  | { ok: true; row: ImportableBusinessFields; lineNumber: number }
  | { ok: false; error: string; lineNumber: number; raw: Record<string, string> };

// ── Header synonym map ──────────────────────────────────────────────────
// Key: normalized header (lowercase, alnum only). Value: BusinessRecord field.
// All synonyms must funnel into a real ImportableBusinessFields key.
const HEADER_MAP: Record<string, keyof ImportableBusinessFields> = {
  // name
  name: "name",
  company: "name",
  companyname: "name",
  business: "name",
  businessname: "name",
  dba: "name",
  organization: "name",
  org: "name",
  // legal name
  legalname: "legalName",
  legalentity: "legalName",
  entity: "legalName",
  // ein
  ein: "ein",
  taxid: "ein",
  einnumber: "ein",
  // contact basics
  email: "email",
  emailaddress: "email",
  contactemail: "email",
  primaryemail: "email",
  phone: "phone",
  phonenumber: "phone",
  tel: "phone",
  telephone: "phone",
  contactphone: "phone",
  primaryphone: "phone",
  website: "website",
  url: "website",
  site: "website",
  web: "website",
  domain: "website",
  homepage: "website",
  // address
  address: "address1",
  address1: "address1",
  addressline1: "address1",
  street: "address1",
  streetaddress: "address1",
  address2: "address2",
  addressline2: "address2",
  unit: "address2",
  suite: "address2",
  city: "city",
  town: "city",
  county: "county",
  state: "state",
  statecode: "state",
  province: "state",
  region: "state",
  zip: "zip",
  zipcode: "zip",
  postalcode: "zip",
  postcode: "zip",
  country: "country",
  countrycode: "country",
  lat: "lat",
  latitude: "lat",
  lng: "lng",
  long: "lng",
  longitude: "lng",
  // classification
  industry: "industry",
  sector: "industry",
  category: "industry",
  vertical: "industry",
  naics: "naicsCode",
  naicscode: "naicsCode",
  sic: "sicCode",
  siccode: "sicCode",
  employees: "employeesBand",
  employeesband: "employeesBand",
  employeecount: "employeesBand",
  size: "employeesBand",
  companysize: "employeesBand",
  revenue: "revenueBand",
  revenueband: "revenueBand",
  annualrevenue: "revenueBand",
  yearfounded: "yearFounded",
  founded: "yearFounded",
  yearestablished: "yearFounded",
  // decision-maker
  contact: "contactName",
  contactname: "contactName",
  decisionmaker: "contactName",
  decisionmakername: "contactName",
  ownername: "contactName",
  owner: "contactName",
  fullname: "contactName",
  contacttitle: "contactTitle",
  title: "contactTitle",
  jobtitle: "contactTitle",
  role: "contactTitle",
  position: "contactTitle",
  // operator metadata
  notes: "notes",
  comment: "notes",
  comments: "notes",
  description: "notes",
  tags: "tags",
  labels: "tags",
  segments: "tags",
};

// US state name → 2-letter code lookup (a few common ones; passthrough otherwise)
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", newhampshire: "NH", newjersey: "NJ",
  newmexico: "NM", newyork: "NY", northcarolina: "NC", northdakota: "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", rhodeisland: "RI", southcarolina: "SC",
  southdakota: "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", westvirginia: "WV", wisconsin: "WI", wyoming: "WY",
  districtofcolumbia: "DC",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeState(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const norm = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  return STATE_NAME_TO_CODE[norm] ?? trimmed;
}

function normalizeZip(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Pad short zips (CSV often strips leading zeros: "1234" → "01234")
  if (/^\d{4}$/.test(trimmed)) return `0${trimmed}`;
  if (/^\d{3}$/.test(trimmed)) return `00${trimmed}`;
  // Strip dash for 9-digit zips (we keep them for queries; dash is cosmetic)
  return trimmed.replace(/^(\d{5})-?(\d{4})$/, "$1-$2");
}

function normalizeCountry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "US";
  const norm = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  if (norm === "us" || norm === "usa" || norm === "unitedstates" || norm === "america") return "US";
  if (norm === "ca" || norm === "canada") return "CA";
  if (norm === "uk" || norm === "gb" || norm === "unitedkingdom") return "GB";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return trimmed;
}

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Strip protocol + path → keep just the bare host for cleaner display.
  // Operator can still navigate by prepending https:// at link time.
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function normalizeNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTags(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

// ── CSV parser (handles quotes, embedded commas/newlines, CRLF) ─────────
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  // Strip BOM if present
  if (input.charCodeAt(0) === 0xfeff) i = 1;

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      cur.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // CRLF: skip the LF; bare CR also ends the row
      if (input[i + 1] === "\n") i += 1;
      cur.push(cell);
      cell = "";
      rows.push(cur);
      cur = [];
      i += 1;
      continue;
    }
    if (ch === "\n") {
      cur.push(cell);
      cell = "";
      rows.push(cur);
      cur = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Final cell + row (no trailing newline)
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ""));
}

/**
 * Map a parsed CSV (header row + data rows) into BusinessRecord rows.
 * Returns one ImportRowResult per data row so the API can surface
 * per-row errors to the operator.
 */
export function mapCsvToBusinesses(
  csv: string[][],
  options: { defaultSource?: BusinessSource; defaultStatus?: BusinessRecord["status"] } = {},
): ImportRowResult[] {
  if (csv.length === 0) return [];
  const [headerRow, ...dataRows] = csv;
  const fieldByCol: Array<keyof ImportableBusinessFields | null> = headerRow.map((h) => {
    const norm = normalizeHeader(h);
    return HEADER_MAP[norm] ?? null;
  });

  const defaultSource: BusinessSource = options.defaultSource ?? "csv_import";
  const defaultStatus: BusinessRecord["status"] = options.defaultStatus ?? "active";

  return dataRows.map((row, idx) => {
    const lineNumber = idx + 2; // header is line 1, data starts at line 2
    const raw: Record<string, string> = {};
    for (let i = 0; i < headerRow.length; i++) {
      raw[headerRow[i]] = row[i] ?? "";
    }

    const partial: Partial<ImportableBusinessFields> = {};
    for (let i = 0; i < headerRow.length; i++) {
      const field = fieldByCol[i];
      if (!field) continue;
      const value = (row[i] ?? "").trim();
      if (!value) continue;

      switch (field) {
        case "email":
          partial.email = value.toLowerCase();
          break;
        case "state":
          partial.state = normalizeState(value);
          break;
        case "zip":
          partial.zip = normalizeZip(value);
          break;
        case "country":
          partial.country = normalizeCountry(value);
          break;
        case "website":
          partial.website = normalizeWebsite(value);
          break;
        case "lat":
        case "lng":
          partial[field] = normalizeNumber(value);
          break;
        case "yearFounded":
          partial.yearFounded = normalizeNumber(value);
          break;
        case "tags":
          partial.tags = normalizeTags(value);
          break;
        case "name":
        case "legalName":
        case "ein":
        case "phone":
        case "address1":
        case "address2":
        case "city":
        case "county":
        case "industry":
        case "naicsCode":
        case "sicCode":
        case "employeesBand":
        case "revenueBand":
        case "contactName":
        case "contactTitle":
        case "notes":
          partial[field] = value;
          break;
      }
    }

    // Required: name
    if (!partial.name) {
      return {
        ok: false,
        error: "Missing required `name` (or `company`/`business`) column",
        lineNumber,
        raw,
      };
    }

    const built: ImportableBusinessFields = {
      name: partial.name,
      country: partial.country ?? "US",
      status: defaultStatus,
      source: defaultSource,
      ...partial,
    };

    return { ok: true, row: built, lineNumber };
  });
}
