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
  return raw.map(b => {
    const min = Number(b.min);
    const max = b.max === null ? Infinity : Number(b.max);
    const rate = Number(b.rate);

    if (!Number.isFinite(min) || (!Number.isFinite(max) && max !== Infinity) || !Number.isFinite(rate)) {
      throw new Error('Invalid tax bracket payload');
    }

    return {
      min,
      max,
      rate,
    };
  });
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

    const parsedFederalBpa = toFiniteNumber(data.federal_bpa);
    const parsedFederalBpaMin = toFiniteNumber(data.federal_bpa_min);
    const parsedFederalBpaPhaseOutStart = toFiniteNumber(data.federal_bpa_phase_out_start);
    const parsedFederalBpaPhaseOutEnd = toFiniteNumber(data.federal_bpa_phase_out_end);
    const parsedCppYmpe = toFiniteNumber(data.cpp_ympe);
    const parsedCppYmpe2 = toFiniteNumber(data.cpp_ympe2);
    const parsedCppBasicExemption = toFiniteNumber(data.cpp_basic_exemption);
    const parsedCppRate = toFiniteNumber(data.cpp_rate);
    const parsedCpp2Rate = toFiniteNumber(data.cpp2_rate);
    const parsedEiMaxInsurable = toFiniteNumber(data.ei_max_insurable);
    const parsedEiRate = toFiniteNumber(data.ei_rate);
    const parsedOasClawbackThreshold = toFiniteNumber(data.oas_clawback_threshold);
    const parsedOasMaxClawbackThreshold = toFiniteNumber(data.oas_max_clawback_threshold);

    // Capital gains fields are optional for compatibility with older datasets.
    const parsedCapitalGainsTier1Threshold = toFiniteNumber(data.capital_gains_tier1_threshold);
    const parsedCapitalGainsInclusionRateTier1 = toFiniteNumber(data.capital_gains_inclusion_rate_tier1);
    const parsedCapitalGainsInclusionRateTier2 = toFiniteNumber(data.capital_gains_inclusion_rate_tier2);

    if (
      parsedFederalBpa === null ||
      parsedFederalBpaMin === null ||
      parsedFederalBpaPhaseOutStart === null ||
      parsedFederalBpaPhaseOutEnd === null ||
      parsedCppYmpe === null ||
      parsedCppYmpe2 === null ||
      parsedCppBasicExemption === null ||
      parsedCppRate === null ||
      parsedCpp2Rate === null ||
      parsedEiMaxInsurable === null ||
      parsedEiRate === null ||
      parsedOasClawbackThreshold === null ||
      parsedOasMaxClawbackThreshold === null
    ) {
      return null;
    }

    const rawProvincialBpa = data.provincial_bpa as Record<string, unknown>;
    const provincialBpa = Object.fromEntries(
      Object.entries(rawProvincialBpa ?? {}).flatMap(([prov, value]) => {
        const parsed = toFiniteNumber(value);
        return parsed === null ? [] : [[prov, parsed]];
      })
    ) as Record<Province, number>;

    const result: LiveTaxData = {
      taxYear: data.tax_year,
      federalBrackets: normalizeBrackets(data.federal_brackets as RawBracket[]),
      provincialBrackets,
      federalBpa: parsedFederalBpa,
      federalBpaMin: parsedFederalBpaMin,
      federalBpaPhaseOutStart: parsedFederalBpaPhaseOutStart,
      federalBpaPhaseOutEnd: parsedFederalBpaPhaseOutEnd,
      provincialBpa,
      cppYmpe: parsedCppYmpe,
      cppYmpe2: parsedCppYmpe2,
      cppBasicExemption: parsedCppBasicExemption,
      cppRate: parsedCppRate,
      cpp2Rate: parsedCpp2Rate,
      eiMaxInsurable: parsedEiMaxInsurable,
      eiRate: parsedEiRate,
      oasClawbackThreshold: parsedOasClawbackThreshold,
      oasMaxClawbackThreshold: parsedOasMaxClawbackThreshold,
      capitalGainsTier1Threshold: parsedCapitalGainsTier1Threshold ?? 250000,
      capitalGainsInclusionRateTier1: parsedCapitalGainsInclusionRateTier1 ?? 0.5,
      capitalGainsInclusionRateTier2: parsedCapitalGainsInclusionRateTier2 ?? 0.667,
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