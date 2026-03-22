export interface LiveTfsaLimitData {
  year: number;
  annualLimit: number;
  sourceUrl: string;
  fetchedAt: string;
  isLive: boolean;
  notes: string;
}

const CRA_TFSA_ROOM_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html';
const DEFAULT_TFSA_YEAR = 2026;
const DEFAULT_TFSA_LIMIT = 7000;

let cachedTfsaLimit: LiveTfsaLimitData | null = null;

function buildFallbackTfsaLimit(): LiveTfsaLimitData {
  return {
    year: DEFAULT_TFSA_YEAR,
    annualLimit: DEFAULT_TFSA_LIMIT,
    sourceUrl: CRA_TFSA_ROOM_URL,
    fetchedAt: new Date().toISOString(),
    isLive: false,
    notes: 'Fallback TFSA annual limit used because live lookup was unavailable.',
  };
}

function parseTfsaLimitFromText(text: string, year: number): number | null {
  const directHeading = new RegExp(`${year}\\s+TFSA dollar limit[\\s\\S]{0,200}?\\$\\s*([0-9][0-9,]*)`, 'i');
  const directMatch = text.match(directHeading);
  if (directMatch) {
    const amount = Number(directMatch[1].replace(/,/g, ''));
    if (Number.isFinite(amount)) return amount;
  }

  const tableRange = new RegExp(`${year}(?:\\s*(?:to|-)\\s*\\d{4})?[\\s|]+\\$\\s*([0-9][0-9,]*)`, 'i');
  const tableMatch = text.match(tableRange);
  if (tableMatch) {
    const amount = Number(tableMatch[1].replace(/,/g, ''));
    if (Number.isFinite(amount)) return amount;
  }

  return null;
}

async function fetchTfsaLimitFromEdgeFunction(): Promise<LiveTfsaLimitData | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-tfsa-limit`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) return null;

  const payload = await response.json();
  if (!payload?.success || !Number.isFinite(payload?.annualLimit)) return null;

  return {
    year: Number(payload.year) || new Date().getFullYear(),
    annualLimit: Number(payload.annualLimit),
    sourceUrl: payload.sourceUrl || CRA_TFSA_ROOM_URL,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    isLive: true,
    notes: payload.notes || 'Live TFSA annual limit fetched from CRA source.',
  };
}

async function fetchTfsaLimitFromMirror(): Promise<LiveTfsaLimitData | null> {
  const currentYear = new Date().getFullYear();
  const mirrorUrl = `https://r.jina.ai/http://${CRA_TFSA_ROOM_URL.replace(/^https?:\/\//, '')}`;
  const response = await fetch(mirrorUrl);
  if (!response.ok) return null;

  const text = await response.text();
  const amount = parseTfsaLimitFromText(text, currentYear) ?? parseTfsaLimitFromText(text, DEFAULT_TFSA_YEAR);
  if (!amount) return null;

  return {
    year: parseTfsaLimitFromText(text, currentYear) ? currentYear : DEFAULT_TFSA_YEAR,
    annualLimit: amount,
    sourceUrl: CRA_TFSA_ROOM_URL,
    fetchedAt: new Date().toISOString(),
    isLive: true,
    notes: 'Live TFSA annual limit fetched from CRA page mirror.',
  };
}

export async function fetchLiveTfsaLimit(): Promise<LiveTfsaLimitData> {
  try {
    const liveFromEdge = await fetchTfsaLimitFromEdgeFunction();
    if (liveFromEdge) {
      cachedTfsaLimit = liveFromEdge;
      return liveFromEdge;
    }
  } catch {
    // Fall through to the mirror and then fallback.
  }

  try {
    const liveFromMirror = await fetchTfsaLimitFromMirror();
    if (liveFromMirror) {
      cachedTfsaLimit = liveFromMirror;
      return liveFromMirror;
    }
  } catch {
    // Fall through to fallback constant.
  }

  const fallback = buildFallbackTfsaLimit();
  cachedTfsaLimit = fallback;
  return fallback;
}

export function getCachedTfsaLimit(): LiveTfsaLimitData | null {
  return cachedTfsaLimit;
}