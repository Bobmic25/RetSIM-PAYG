const CPP_ADJUSTMENT_BEFORE_65 = -0.006;
const CPP_ADJUSTMENT_AFTER_65 = 0.007;
const OAS_ADJUSTMENT_AFTER_65 = 0.006;
const OAS_MAX_ANNUAL_2024 = 8505;

export const GIS_MAX_SINGLE_ANNUAL_2026 = 13032;
export const GIS_MAX_COUPLE_ANNUAL_2026 = 8556;
export const GIS_CLAWBACK_RATE = 0.50;
const GIS_INCOME_EXEMPTION_SINGLE = 0;

export interface GISResult {
  gisAmount: number;
  clawback: number;
  effectiveMarginalRateIncrease: number;
}

export function calculateGISBenefit(
  otherIncome: number,
  isCouple: boolean,
  age: number,
  oasReceiving: boolean,
  yearFromStart: number = 0,
  inflationRate: number = 2.3
): GISResult {
  if (!oasReceiving || age < 65) {
    return { gisAmount: 0, clawback: 0, effectiveMarginalRateIncrease: 0 };
  }

  const inflationFactor = Math.pow(1 + inflationRate / 100, yearFromStart);
  const maxGIS = (isCouple ? GIS_MAX_COUPLE_ANNUAL_2026 : GIS_MAX_SINGLE_ANNUAL_2026) * inflationFactor;
  const exemption = GIS_INCOME_EXEMPTION_SINGLE * inflationFactor;

  const countableIncome = Math.max(0, otherIncome - exemption);
  const clawback = Math.min(maxGIS, countableIncome * GIS_CLAWBACK_RATE);
  const gisAmount = Math.max(0, maxGIS - clawback);

  return {
    gisAmount,
    clawback,
    effectiveMarginalRateIncrease: GIS_CLAWBACK_RATE
  };
}

export function calculateCPPBenefit(amount65: number, startAge: number): number {
  if (startAge === 65) {
    return amount65;
  }

  if (startAge < 65) {
    const monthsBefore65 = (65 - startAge) * 12;
    const adjustmentFactor = 1 + (monthsBefore65 * CPP_ADJUSTMENT_BEFORE_65);
    return amount65 * Math.max(adjustmentFactor, 0.64);
  } else {
    const monthsAfter65 = (startAge - 65) * 12;
    const adjustmentFactor = 1 + (monthsAfter65 * CPP_ADJUSTMENT_AFTER_65);
    return amount65 * Math.min(adjustmentFactor, 1.42);
  }
}

export function calculateOASBenefit(startAge: number, customBase?: number): number {
  const baseAmount = customBase ?? OAS_MAX_ANNUAL_2024;

  if (startAge === 65) {
    return baseAmount;
  }

  if (startAge < 65) {
    return 0;
  }

  const monthsAfter65 = (startAge - 65) * 12;
  const adjustmentFactor = 1 + (monthsAfter65 * OAS_ADJUSTMENT_AFTER_65);
  return baseAmount * Math.min(adjustmentFactor, 1.36);
}

export const OAS_AGE_75_BUMP_RATE = 0.10;
export const OAS_AGE_75_BUMP_AGE = 75;

export function applyOAS75Bump(oasAmount: number, age: number): number {
  if (age >= OAS_AGE_75_BUMP_AGE) {
    return oasAmount * (1 + OAS_AGE_75_BUMP_RATE);
  }
  return oasAmount;
}

export function adjustForInflation(amount: number, years: number, inflationRate: number): number {
  return amount * Math.pow(1 + inflationRate / 100, years);
}

export function presentValue(futureAmount: number, years: number, inflationRate: number): number {
  return futureAmount / Math.pow(1 + inflationRate / 100, years);
}
