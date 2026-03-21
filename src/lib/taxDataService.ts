import { supabase } from './supabase';
import { Province } from '../types/retirement';
import { TaxBracket } from './taxEngine';

export interface LiveTaxData {
  taxYear: number;
  federalBrackets: TaxBracket[];
  provincialBrackets: Record<Province, TaxBracket[]>;
  federalBpa: number;
  federalBpaMin: number;
  federalBpaPhaseOutStart: number;
  federalBpaPhaseOutEnd: number;
  provincialBpa: Record<Province, number>;
  cppYmpe: number;
  cppYmpe2: number;
  cppBasicExemption: number;
  cppRate: number;
  cpp2Rate: number;
  eiMaxInsurable: number;
  eiRate: number;
  oasClawbackThreshold: number;
  oasMaxClawbackThreshold: number;
  capitalGainsTier1Threshold: number; // Added per update requirements
  capitalGainsInclusionRateTier1: number; // Added per update requirements
  capitalGainsInclusionRateTier2: number; // Added per update requirements
  sourceUrl: string;
  fetchedAt: string;
  notes: string;
  isLive: boolean;
}

type RawBracket = { min: number; max: number | null; rate: number };

function normalizeBrackets(raw: RawBracket[]): TaxBracket[] {
  return raw.map(b => ({
    min: b.min,
    max: b.max === null ? Infinity : b.max,
    rate: b.rate,
  }));
}

let cachedData: LiveTaxData | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function fetchLiveTaxData(taxYear = 2026): Promise<LiveTaxData | null> {
  if (cachedData && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData;
  }

  try {
    const { data, error } = await supabase
      .from('tax_data_cache')
      .select('*')
      .eq('tax_year', taxYear)
      .maybeSingle();

    if (error || !data) return null;

    const rawProvincial = data.provincial_brackets as Record<string, RawBracket[]>;
    const provincialBrackets = Object.fromEntries(
      Object.entries(rawProvincial).map(([prov, brackets]) => [
        prov,
        normalizeBrackets(brackets),
      ])
    ) as Record<Province, TaxBracket[]>;

    const result: LiveTaxData = {
      taxYear: data.tax_year,
      federalBrackets: normalizeBrackets(data.federal_brackets as RawBracket[]),
      provincialBrackets,
      federalBpa: Number(data.federal_bpa),
      federalBpaMin: Number(data.federal_bpa_min),
      federalBpaPhaseOutStart: Number(data.federal_bpa_phase_out_start),
      federalBpaPhaseOutEnd: Number(data.federal_bpa_phase_out_end),
      provincialBpa: data.provincial_bpa as Record<Province, number>,
      cppYmpe: Number(data.cpp_ympe),
      cppYmpe2: Number(data.cpp_ympe2),
      cppBasicExemption: Number(data.cpp_basic_exemption),
      cppRate: Number(data.cpp_rate),
      cpp2Rate: Number(data.cpp2_rate),
      eiMaxInsurable: Number(data.ei_max_insurable),
      eiRate: Number(data.ei_rate),
      oasClawbackThreshold: Number(data.oas_clawback_threshold),
      oasMaxClawbackThreshold: Number(data.oas_max_clawback_threshold),
      // Map new database fields to the interface
      capitalGainsTier1Threshold: Number(data.capital_gains_tier1_threshold),
      capitalGainsInclusionRateTier1: Number(data.capital_gains_inclusion_rate_tier1),
      capitalGainsInclusionRateTier2: Number(data.capital_gains_inclusion_rate_tier2),
      sourceUrl: data.source_url,
      fetchedAt: data.fetched_at,
      notes: data.notes,
      isLive: true,
    };

    cachedData = result;
    cacheTimestamp = Date.now();
    return result;
  } catch {
    return null;
  }
}

export function invalidateTaxDataCache() {
  cachedData = null;
  cacheTimestamp = null;
}

export async function triggerTaxDataRefresh(): Promise<{ success: boolean; fetchedAt?: string; error?: string }> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-tax-data`;
    
    if (!url || url.includes('undefined')) {
      return { success: false, error: 'Supabase URL not configured' };
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Edge function error:', resp.status, errorText);
      return { success: false, error: `HTTP ${resp.status}: ${errorText || 'Unknown error'}` };
    }

    const json = await resp.json();
    if (!json.success) return { success: false, error: json.error ?? 'Unknown error' };

    invalidateTaxDataCache();
    const fresh = await fetchLiveTaxData();
    return { success: true, fetchedAt: fresh?.fetchedAt };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('Refresh tax data error:', e);
    return { success: false, error: errorMsg };
  }
}