import { Province } from '../types/retirement';
import type { LiveTaxData } from './taxDataService';

let _activeLiveData: LiveTaxData | null = null;

export function setActiveLiveTaxData(data: LiveTaxData | null) {
  _activeLiveData = data;
}

export function getActiveLiveTaxData(): LiveTaxData | null {
  return _activeLiveData;
}

export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
}

export interface TaxData {
  federalBrackets: TaxBracket[];
  provincialBrackets: TaxBracket[];
  federalBPA: number;
  provincialBPA: number;
  federalBPAMin: number;
  federalBPAPhaseOutStart: number;
  federalBPAPhaseOutEnd: number;
  oasClawbackThreshold: number;
  oasMaxClawbackThreshold: number;
  province: Province;
  year: number;
  sourceUrl: string;
  lastUpdated: string;
  isLive: boolean;
  fetchedAt?: string;
}

export interface TaxAuditBracket {
  label: string;
  from: number;
  to: number;
  rate: number;
  taxInBracket: number;
}

export interface TaxAudit {
  grossIncome: number;
  federalBrackets: TaxAuditBracket[];
  provincialBrackets: TaxAuditBracket[];
  federalGrossTax: number;
  provincialGrossTax: number;
  federalBPA: number;
  federalBPACredit: number;
  provincialBPA: number;
  provincialBPACredit: number;
  federalNetTax: number;
  provincialNetTax: number;
  cppContribution: number;
  eiContribution: number;
  oasClawback: number;
  totalTax: number;
  effectiveRate: number;
  appliedData: TaxData;
}

export const FEDERAL_BRACKETS_2026: TaxBracket[] = [
  { min: 0, max: 58523, rate: 0.15 },
  { min: 58523, max: 117046, rate: 0.205 },
  { min: 117046, max: 181474, rate: 0.26 },
  { min: 181474, max: 258502, rate: 0.29 },
  { min: 258502, max: Infinity, rate: 0.33 }
];

const PROVINCIAL_BRACKETS_2026: Record<Province, TaxBracket[]> = {
  AB: [
    { min: 0, max: 148269, rate: 0.10 },
    { min: 148269, max: 177922, rate: 0.12 },
    { min: 177922, max: 237230, rate: 0.13 },
    { min: 237230, max: 355845, rate: 0.14 },
    { min: 355845, max: Infinity, rate: 0.15 }
  ],
  BC: [
    { min: 0, max: 47937, rate: 0.0506 },
    { min: 47937, max: 95875, rate: 0.077 },
    { min: 95875, max: 110076, rate: 0.105 },
    { min: 110076, max: 133664, rate: 0.1229 },
    { min: 133664, max: 181232, rate: 0.147 },
    { min: 181232, max: 252752, rate: 0.168 },
    { min: 252752, max: Infinity, rate: 0.205 }
  ],
  MB: [
    { min: 0, max: 47000, rate: 0.108 },
    { min: 47000, max: 100000, rate: 0.1275 },
    { min: 100000, max: Infinity, rate: 0.174 }
  ],
  NB: [
    { min: 0, max: 49958, rate: 0.094 },
    { min: 49958, max: 99916, rate: 0.14 },
    { min: 99916, max: 185064, rate: 0.16 },
    { min: 185064, max: Infinity, rate: 0.195 }
  ],
  NL: [
    { min: 0, max: 43198, rate: 0.087 },
    { min: 43198, max: 86395, rate: 0.145 },
    { min: 86395, max: 154244, rate: 0.158 },
    { min: 154244, max: 215943, rate: 0.173 },
    { min: 215943, max: 275870, rate: 0.183 },
    { min: 275870, max: 551739, rate: 0.193 },
    { min: 551739, max: 1103478, rate: 0.198 },
    { min: 1103478, max: Infinity, rate: 0.208 }
  ],
  NT: [
    { min: 0, max: 50597, rate: 0.059 },
    { min: 50597, max: 101198, rate: 0.086 },
    { min: 101198, max: 164525, rate: 0.122 },
    { min: 164525, max: Infinity, rate: 0.1405 }
  ],
  NS: [
    { min: 0, max: 29590, rate: 0.0879 },
    { min: 29590, max: 59180, rate: 0.1495 },
    { min: 59180, max: 93000, rate: 0.1667 },
    { min: 93000, max: 150000, rate: 0.175 },
    { min: 150000, max: Infinity, rate: 0.21 }
  ],
  NU: [
    { min: 0, max: 53268, rate: 0.04 },
    { min: 53268, max: 106537, rate: 0.07 },
    { min: 106537, max: 173205, rate: 0.09 },
    { min: 173205, max: Infinity, rate: 0.115 }
  ],
  ON: [
    { min: 0, max: 51446, rate: 0.0505 },
    { min: 51446, max: 102894, rate: 0.0915 },
    { min: 102894, max: 150000, rate: 0.1116 },
    { min: 150000, max: 220000, rate: 0.1216 },
    { min: 220000, max: Infinity, rate: 0.1316 }
  ],
  PE: [
    { min: 0, max: 32656, rate: 0.0968 },
    { min: 32656, max: 64313, rate: 0.1363 },
    { min: 64313, max: 105000, rate: 0.1665 },
    { min: 105000, max: Infinity, rate: 0.187 }
  ],
  QC: [
    { min: 0, max: 51780, rate: 0.14 },
    { min: 51780, max: 103545, rate: 0.19 },
    { min: 103545, max: 126000, rate: 0.24 },
    { min: 126000, max: Infinity, rate: 0.2575 }
  ],
  SK: [
    { min: 0, max: 52057, rate: 0.105 },
    { min: 52057, max: 148734, rate: 0.125 },
    { min: 148734, max: Infinity, rate: 0.145 }
  ],
  YT: [
    { min: 0, max: 55867, rate: 0.064 },
    { min: 55867, max: 111733, rate: 0.09 },
    { min: 111733, max: 173205, rate: 0.109 },
    { min: 173205, max: 500000, rate: 0.128 },
    { min: 500000, max: Infinity, rate: 0.15 }
  ]
};

const PROVINCIAL_BPA_2026: Record<Province, number> = {
  AB: 21870, BC: 11981, MB: 15780, NB: 12458, NL: 10818, NT: 16593,
  NS: 8481, NU: 17925, ON: 11865, PE: 12000, QC: 17183, SK: 17661, YT: 16452
};

const FEDERAL_BPA_2026 = 16452;
const FEDERAL_BPA_MIN_2026 = 14829;
const FEDERAL_BPA_PHASE_OUT_START_2026 = 181474;
const FEDERAL_BPA_PHASE_OUT_END_2026 = 258502;

const CPP_YMPE_2026 = 74600;
const CPP_YMPE2_2026 = 81200;
const CPP_BASIC_EXEMPTION_2026 = 3500;
const CPP_RATE_2026 = 0.0595;
const CPP2_RATE_2026 = 0.04;
const EI_MAX_INSURABLE_EARNINGS_2026 = 65700;
const EI_RATE_2026 = 0.0166;

export const OAS_CLAWBACK_THRESHOLD_2026 = 95323;
export const OAS_CLAWBACK_RATE = 0.15;
export const OAS_MAX_CLAWBACK_THRESHOLD_2026 = 155396;

const ELIGIBLE_DIVIDEND_GROSS_UP_RATE = 0.38;
const ELIGIBLE_DIVIDEND_TAX_CREDIT_FEDERAL_RATE = 0.150198;
const ELIGIBLE_DIVIDEND_TAX_CREDIT_PROV_RATES: Record<Province, number> = {
  AB: 0.100, BC: 0.12, MB: 0.08, NB: 0.12, NL: 0.05, NT: 0.12,
  NS: 0.0833, NU: 0.12, ON: 0.100, PE: 0.105, QC: 0.11, SK: 0.11, YT: 0.12
};

export function calcEligibleDividendGrossUp(dividendAmount: number): number {
  return dividendAmount * (1 + ELIGIBLE_DIVIDEND_GROSS_UP_RATE);
}

export function calcEligibleDividendTaxCredit(dividendAmount: number, province: Province, isFederal: boolean): number {
  const grossedUp = calcEligibleDividendGrossUp(dividendAmount);
  if (isFederal) {
    return grossedUp * ELIGIBLE_DIVIDEND_TAX_CREDIT_FEDERAL_RATE;
  }
  return grossedUp * (ELIGIBLE_DIVIDEND_TAX_CREDIT_PROV_RATES[province] ?? 0.10);
}

const AGE_AMOUNT_2026 = 8396;
const AGE_AMOUNT_PHASE_OUT_START_2026 = 42335;
const AGE_AMOUNT_PHASE_OUT_RATE = 0.15;
const PENSION_INCOME_CREDIT_MAX_2026 = 2000;
const CAPITAL_GAINS_TIER1_THRESHOLD_2026 = 250000;
const CAPITAL_GAINS_INCLUSION_RATE_TIER1 = 0.5;
const CAPITAL_GAINS_INCLUSION_RATE_TIER2 = 0.667;

const ON_SURTAX_THRESHOLD1_2026 = 5554;
const ON_SURTAX_THRESHOLD2_2026 = 7108;
const ON_SURTAX_RATE1 = 0.20;
const ON_SURTAX_RATE2 = 0.36;

const ON_HEALTH_PREMIUM_BRACKETS_2026: Array<{ threshold: number; base: number; rate: number; incomeBase: number }> = [
  { threshold: 200600, base: 900, rate: 0, incomeBase: 0 },
  { threshold: 100600, base: 750, rate: 0.25, incomeBase: 200600 },
  { threshold: 72600, base: 600, rate: 0.25, incomeBase: 100600 },
  { threshold: 48600, base: 450, rate: 0.25, incomeBase: 72600 },
  { threshold: 36600, base: 300, rate: 0.06, incomeBase: 48600 },
  { threshold: 25000, base: 0, rate: 0.06, incomeBase: 36600 },
  { threshold: 20000, base: 0, rate: 0, incomeBase: 25000 },
  { threshold: 0, base: 0, rate: 0, incomeBase: 0 }
];

export function calcTieredCapitalGainInclusion(capitalGain: number, yearIndex: number = 0, inflationRate: number = 2.3): number {
  if (capitalGain <= 0) return 0;
  const factor = yearIndex > 0 ? Math.pow(1 + inflationRate / 100, yearIndex) : 1;
  
  // Use values from LiveTaxData if available, falling back to constants
  const live = _activeLiveData;
  const thresholdBase = live?.capitalGainsTier1Threshold ?? CAPITAL_GAINS_TIER1_THRESHOLD_2026;
  const rate1 = live?.capitalGainsInclusionRateTier1 ?? CAPITAL_GAINS_INCLUSION_RATE_TIER1;
  const rate2 = live?.capitalGainsInclusionRateTier2 ?? CAPITAL_GAINS_INCLUSION_RATE_TIER2;

  const threshold = thresholdBase * factor;
  if (capitalGain <= threshold) {
    return capitalGain * rate1;
  }
  const tier1 = threshold * rate1;
  const tier2 = (capitalGain - threshold) * rate2;
  return tier1 + tier2;
}

function calcOntarioSurtax(baseProvincialTax: number, factor: number): number {
  const threshold1 = ON_SURTAX_THRESHOLD1_2026 * factor;
  const threshold2 = ON_SURTAX_THRESHOLD2_2026 * factor;
  let surtax = 0;
  if (baseProvincialTax > threshold1) {
    surtax += (baseProvincialTax - threshold1) * ON_SURTAX_RATE1;
  }
  if (baseProvincialTax > threshold2) {
    surtax += (baseProvincialTax - threshold2) * ON_SURTAX_RATE2;
  }
  return surtax;
}

function calcOntarioHealthPremium(income: number, factor: number): number {
  if (income <= 0) return 0;
  for (const tier of ON_HEALTH_PREMIUM_BRACKETS_2026) {
    const scaledThreshold = tier.threshold * factor;
    const scaledIncomeBase = tier.incomeBase * factor;
    if (income > scaledThreshold) {
      return (tier.base + (income - scaledIncomeBase) * tier.rate) * factor / factor;
    }
  }
  return 0;
}

export function indexBrackets(brackets: TaxBracket[], yearIndex: number, inflationRate: number): TaxBracket[] {
  if (yearIndex === 0) return brackets;
  const factor = Math.pow(1 + inflationRate / 100, yearIndex);
  return brackets.map(b => ({
    min: b.min === 0 ? 0 : b.min * factor,
    max: b.max === Infinity ? Infinity : b.max * factor,
    rate: b.rate
  }));
}

export function getTaxData(
  province: Province,
  yearIndex: number = 0,
  inflationRate: number = 2.3,
  liveData?: LiveTaxData | null
): TaxData {
  const resolved = liveData !== undefined ? liveData : _activeLiveData;
  const factor = yearIndex > 0 ? Math.pow(1 + inflationRate / 100, yearIndex) : 1;

  const baseFederal = resolved ? resolved.federalBrackets : FEDERAL_BRACKETS_2026;
  const baseProv = resolved ? (resolved.provincialBrackets[province] ?? PROVINCIAL_BRACKETS_2026[province]) : PROVINCIAL_BRACKETS_2026[province];
  const baseFedBPA = resolved ? resolved.federalBpa : FEDERAL_BPA_2026;
  const baseFedBPAMin = resolved ? resolved.federalBpaMin : FEDERAL_BPA_MIN_2026;
  const baseFedPhaseStart = resolved ? resolved.federalBpaPhaseOutStart : FEDERAL_BPA_PHASE_OUT_START_2026;
  const baseFedPhaseEnd = resolved ? resolved.federalBpaPhaseOutEnd : FEDERAL_BPA_PHASE_OUT_END_2026;
  const baseProvBPA = resolved ? (resolved.provincialBpa[province] ?? PROVINCIAL_BPA_2026[province]) : PROVINCIAL_BPA_2026[province];
  const baseOasThreshold = resolved ? resolved.oasClawbackThreshold : OAS_CLAWBACK_THRESHOLD_2026;
  const baseOasMax = resolved ? resolved.oasMaxClawbackThreshold : OAS_MAX_CLAWBACK_THRESHOLD_2026;

  const baseYear = resolved ? resolved.taxYear : 2026;
  const fetchedAt = resolved?.fetchedAt;
  const lastUpdated = resolved
    ? new Date(resolved.fetchedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })
    : 'March 2026';

  return {
    federalBrackets: indexBrackets(baseFederal, yearIndex, inflationRate),
    provincialBrackets: indexBrackets(baseProv, yearIndex, inflationRate),
    federalBPA: baseFedBPA * factor,
    provincialBPA: baseProvBPA * factor,
    federalBPAMin: baseFedBPAMin * factor,
    federalBPAPhaseOutStart: baseFedPhaseStart * factor,
    federalBPAPhaseOutEnd: baseFedPhaseEnd * factor,
    oasClawbackThreshold: baseOasThreshold * factor,
    oasMaxClawbackThreshold: baseOasMax * factor,
    province,
    year: baseYear + yearIndex,
    sourceUrl: resolved?.sourceUrl ?? 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html',
    lastUpdated,
    isLive: resolved?.isLive ?? false,
    fetchedAt,
  };
}

function calcBracketTax(income: number, brackets: TaxBracket[]): number {
  let tax = 0;
  for (const bracket of brackets) {
    if (income <= bracket.min) break;
    const taxable = Math.min(income, bracket.max) - bracket.min;
    tax += taxable * bracket.rate;
  }
  return tax;
}

function calcBracketTaxAudit(income: number, brackets: TaxBracket[]): { total: number; auditBrackets: TaxAuditBracket[] } {
  let total = 0;
  const auditBrackets: TaxAuditBracket[] = [];
  for (const bracket of brackets) {
    if (income <= bracket.min) break;
    const taxable = Math.min(income, bracket.max) - bracket.min;
    const taxInBracket = taxable * bracket.rate;
    total += taxInBracket;
    auditBrackets.push({
      label: bracket.max === Infinity
        ? `Over $${Math.round(bracket.min).toLocaleString()}`
        : `$${Math.round(bracket.min).toLocaleString()} – $${Math.round(bracket.max).toLocaleString()}`,
      from: bracket.min,
      to: bracket.max,
      rate: bracket.rate,
      taxInBracket
    });
  }
  return { total, auditBrackets };
}

function calcFederalBPA(income: number, taxData: TaxData): number {
  const { federalBPA, federalBPAMin, federalBPAPhaseOutStart, federalBPAPhaseOutEnd } = taxData;
  if (income <= federalBPAPhaseOutStart) return federalBPA;
  if (income >= federalBPAPhaseOutEnd) return federalBPAMin;
  const phaseRatio = (income - federalBPAPhaseOutStart) / (federalBPAPhaseOutEnd - federalBPAPhaseOutStart);
  return federalBPA - phaseRatio * (federalBPA - federalBPAMin);
}

function calcAgeAmount(age: number, income: number, yearIndex: number, inflationRate: number): number {
  if (age < 65) return 0;
  const factor = Math.pow(1 + inflationRate / 100, yearIndex);
  const ageAmount = AGE_AMOUNT_2026 * factor;
  const phaseOutStart = AGE_AMOUNT_PHASE_OUT_START_2026 * factor;
  if (income <= phaseOutStart) return ageAmount;
  const reduction = (income - phaseOutStart) * AGE_AMOUNT_PHASE_OUT_RATE;
  return Math.max(0, ageAmount - reduction);
}

function calcPensionIncomeCredit(pensionIncome: number, yearIndex: number, inflationRate: number): number {
  const factor = Math.pow(1 + inflationRate / 100, yearIndex);
  const maxCredit = PENSION_INCOME_CREDIT_MAX_2026 * factor;
  return Math.min(pensionIncome, maxCredit);
}

function calcCPPContribution(employmentIncome: number): number {
  if (employmentIncome <= CPP_BASIC_EXEMPTION_2026) return 0;
  const tier1 = Math.min(employmentIncome - CPP_BASIC_EXEMPTION_2026, CPP_YMPE_2026 - CPP_BASIC_EXEMPTION_2026);
  const tier2 = Math.max(0, Math.min(employmentIncome, CPP_YMPE2_2026) - CPP_YMPE_2026);
  return tier1 * CPP_RATE_2026 + tier2 * CPP2_RATE_2026;
}

function calcEIContribution(employmentIncome: number): number {
  return Math.min(employmentIncome, EI_MAX_INSURABLE_EARNINGS_2026) * EI_RATE_2026;
}

function calcOASClawback(netIncome: number, oasAmount: number, taxData: TaxData): number {
  if (netIncome <= taxData.oasClawbackThreshold) return 0;
  if (netIncome >= taxData.oasMaxClawbackThreshold) return oasAmount;
  return Math.min((netIncome - taxData.oasClawbackThreshold) * OAS_CLAWBACK_RATE, oasAmount);
}

export function computeTaxAudit(
  income: number,
  province: Province,
  employmentIncome: number = 0,
  oasAmount: number = 0,
  yearIndex: number = 0,
  inflationRate: number = 2.3,
  liveData?: LiveTaxData | null,
  age: number = 0,
  pensionIncome: number = 0,
  eligibleDividends: number = 0
): TaxAudit {
  const taxData = getTaxData(province, yearIndex, inflationRate, liveData);

  const fedAudit = calcBracketTaxAudit(income, taxData.federalBrackets);
  const provAudit = calcBracketTaxAudit(income, taxData.provincialBrackets);

  const bpa = calcFederalBPA(income, taxData);
  const federalBPACredit = bpa * taxData.federalBrackets[0].rate;
  const provincialBPACredit = taxData.provincialBPA * taxData.provincialBrackets[0].rate;

  const ageAmountValue = calcAgeAmount(age, income, yearIndex, inflationRate);
  const ageAmountCredit = ageAmountValue * taxData.federalBrackets[0].rate;
  const pensionCreditBase = calcPensionIncomeCredit(pensionIncome, yearIndex, inflationRate);
  const pensionIncomeCredit = pensionCreditBase * taxData.federalBrackets[0].rate;

  const dividendFederalCredit = eligibleDividends > 0 ? calcEligibleDividendTaxCredit(eligibleDividends, province, true) : 0;
  const dividendProvincialCredit = eligibleDividends > 0 ? calcEligibleDividendTaxCredit(eligibleDividends, province, false) : 0;

  const federalNetTax = Math.max(0, fedAudit.total - federalBPACredit - ageAmountCredit - pensionIncomeCredit - dividendFederalCredit);

  let baseProvincialNetTax = Math.max(0, provAudit.total - provincialBPACredit - dividendProvincialCredit);
  let provincialNetTax = baseProvincialNetTax;

  if (province === 'ON') {
    const factor = yearIndex > 0 ? Math.pow(1 + inflationRate / 100, yearIndex) : 1;
    const surtax = calcOntarioSurtax(baseProvincialNetTax, factor);
    const healthPremium = calcOntarioHealthPremium(income, factor);
    provincialNetTax = baseProvincialNetTax + surtax + healthPremium;
  }

  const cppContribution = calcCPPContribution(employmentIncome);
  const eiContribution = calcEIContribution(employmentIncome);
  const oasClawback = calcOASClawback(income, oasAmount, taxData);

  const totalTax = federalNetTax + provincialNetTax + cppContribution + eiContribution + oasClawback;

  return {
    grossIncome: income,
    federalBrackets: fedAudit.auditBrackets,
    provincialBrackets: provAudit.auditBrackets,
    federalGrossTax: fedAudit.total,
    provincialGrossTax: provAudit.total,
    federalBPA: bpa,
    federalBPACredit,
    provincialBPA: taxData.provincialBPA,
    provincialBPACredit,
    federalNetTax,
    provincialNetTax,
    cppContribution,
    eiContribution,
    oasClawback,
    totalTax,
    effectiveRate: income > 0 ? totalTax / income : 0,
    appliedData: taxData
  };
}

const _taxCache = new Map<string, { federal: number; provincial: number; cpp: number; ei: number; oasClawback: number; total: number }>();

export function clearTaxCache(): void {
  _taxCache.clear();
}

export function calculateTotalTax(
  income: number,
  province: Province,
  employmentIncome: number = 0,
  oasAmount: number = 0,
  yearIndex: number = 0,
  inflationRate: number = 2.3,
  liveData?: LiveTaxData | null,
  age: number = 0,
  pensionIncome: number = 0,
  eligibleDividends: number = 0
): {
  federal: number;
  provincial: number;
  cpp: number;
  ei: number;
  oasClawback: number;
  total: number;
} {
  if (liveData === undefined && eligibleDividends === 0) {
    const roundedIncome = Math.round(income / 10) * 10;
    const roundedEmp = Math.round(employmentIncome / 10) * 10;
    const roundedOas = Math.round(oasAmount / 10) * 10;
    const roundedPension = Math.round(pensionIncome / 10) * 10;
    const cacheKey = `${roundedIncome}|${province}|${roundedEmp}|${roundedOas}|${yearIndex}|${inflationRate}|${age >= 65 ? 1 : 0}|${roundedPension}`;
    const cached = _taxCache.get(cacheKey);
    if (cached) return cached;

    const audit = computeTaxAudit(roundedIncome, province, roundedEmp, roundedOas, yearIndex, inflationRate, null, age, roundedPension, 0);
    const result = {
      federal: audit.federalNetTax,
      provincial: audit.provincialNetTax,
      cpp: audit.cppContribution,
      ei: audit.eiContribution,
      oasClawback: audit.oasClawback,
      total: audit.totalTax
    };
    if (_taxCache.size > 50000) _taxCache.clear();
    _taxCache.set(cacheKey, result);
    return result;
  }

  const audit = computeTaxAudit(income, province, employmentIncome, oasAmount, yearIndex, inflationRate, liveData, age, pensionIncome, eligibleDividends);
  return {
    federal: audit.federalNetTax,
    provincial: audit.provincialNetTax,
    cpp: audit.cppContribution,
    ei: audit.eiContribution,
    oasClawback: audit.oasClawback,
    total: audit.totalTax
  };
}

export function getFirstBracketTop(province: Province, yearIndex: number = 0, inflationRate: number = 2.3, liveData?: LiveTaxData | null): number {
  const taxData = getTaxData(province, yearIndex, inflationRate, liveData);
  return taxData.federalBrackets[0].max;
}

export function getBPA(province: Province, income: number, yearIndex: number = 0, inflationRate: number = 2.3, liveData?: LiveTaxData | null): number {
  const taxData = getTaxData(province, yearIndex, inflationRate, liveData);
  return calcFederalBPA(income, taxData);
}

export function getOASClawbackThreshold(yearIndex: number = 0, inflationRate: number = 2.3): number {
  const factor = Math.pow(1 + inflationRate / 100, yearIndex);
  return OAS_CLAWBACK_THRESHOLD_2026 * factor;
}

export function calculateOptimalPensionSplit(
  primaryIncome: number,
  spouseIncome: number,
  eligiblePensionIncome: number,
  province: Province,
  yearIndex: number = 0,
  inflationRate: number = 2.3
): { splitFraction: number; primaryTax: number; spouseTax: number; combinedTax: number } {
  let bestCombined = Infinity;
  let bestFraction = 0;

  for (let fraction = 0; fraction <= 0.5; fraction += 0.01) {
    const splitAmount = eligiblePensionIncome * fraction;
    const primaryAdj = primaryIncome - splitAmount;
    const spouseAdj = spouseIncome + splitAmount;

    const pTax = calculateTotalTax(primaryAdj, province, 0, 0, yearIndex, inflationRate).total;
    const sTax = calculateTotalTax(spouseAdj, province, 0, 0, yearIndex, inflationRate).total;
    const combined = pTax + sTax;

    if (combined < bestCombined) {
      bestCombined = combined;
      bestFraction = fraction;
    }
  }

  const finalSplit = eligiblePensionIncome * bestFraction;
  const primaryFinal = calculateTotalTax(primaryIncome - finalSplit, province, 0, 0, yearIndex, inflationRate).total;
  const spouseFinal = calculateTotalTax(spouseIncome + finalSplit, province, 0, 0, yearIndex, inflationRate).total;

  return {
    splitFraction: bestFraction,
    primaryTax: primaryFinal,
    spouseTax: spouseFinal,
    combinedTax: primaryFinal + spouseFinal
  };
}

const ONTARIO_PROBATE_THRESHOLD = 50000;
const ONTARIO_PROBATE_RATE = 0.015;

function calcOntarioProbateFee(estateValue: number, province: Province, yearIndex: number, inflationRate: number): number {
  if (province !== 'ON') return 0;
  const factor = yearIndex > 0 ? Math.pow(1 + inflationRate / 100, yearIndex) : 1;
  const threshold = ONTARIO_PROBATE_THRESHOLD * factor;
  if (estateValue <= threshold) return 0;
  return (estateValue - threshold) * ONTARIO_PROBATE_RATE;
}

export function calculateTerminalTax(
  rrspBalance: number,
  nonRegBalance: number,
  nonRegAcb: number,
  province: Province,
  yearIndex: number = 0,
  inflationRate: number = 2.3,
  age: number = 0
): { terminalTax: number; netEstateValue: number; probateFee?: number } {
  const capitalGain = Math.max(0, nonRegBalance - nonRegAcb);
  const taxableCapitalGain = calcTieredCapitalGainInclusion(capitalGain, yearIndex, inflationRate);
  const totalTerminalIncome = rrspBalance + taxableCapitalGain;

  const taxResult = calculateTotalTax(totalTerminalIncome, province, 0, 0, yearIndex, inflationRate, undefined, age, 0);
  const incomeTax = taxResult.total;

  const grossEstate = rrspBalance + nonRegBalance;
  const probateFee = calcOntarioProbateFee(grossEstate, province, yearIndex, inflationRate);
  const terminalTax = incomeTax + probateFee;
  const netEstateValue = grossEstate - terminalTax;

  return { terminalTax, netEstateValue, probateFee };
}

export function getMarginalRate(
  income: number,
  province: Province,
  yearIndex: number = 0,
  inflationRate: number = 2.3
): number {
  const delta = 1000;
  const taxLow = calculateTotalTax(income, province, 0, 0, yearIndex, inflationRate).total;
  const taxHigh = calculateTotalTax(income + delta, province, 0, 0, yearIndex, inflationRate).total;
  return (taxHigh - taxLow) / delta;
}