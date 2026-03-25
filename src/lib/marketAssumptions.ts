import { AssetAllocation, SavingsAccount, Scenario } from '../types/retirement';

const EQUITY_EXPECTED_RETURN = 6.6;
const EQUITY_STD_DEV = 15.0;
const NON_EQUITY_EXPECTED_RETURN = 4.0;
const NON_EQUITY_STD_DEV = 5.0;
const DEFAULT_FALLBACK_EQUITY_WEIGHT = 0.6;

export interface MarketAssumptions {
  expectedReturn: number;
  stdDev: number;
  totalEquityWeight: number;
  fixedIncomeWeight: number;
  cadEquityWeight: number;
  usEquityWeight: number;
  intEquityWeight: number;
  source: 'fallback' | 'allocations';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeGeoWeights(cadWeight?: number, usWeight?: number, intWeight?: number) {
  const cad = cadWeight ?? 60;
  const us = usWeight ?? 40;
  const intl = intWeight ?? Math.max(0, 100 - cad - us);
  const total = cad + us + intl;

  if (total <= 0) {
    return { cad: 0.6, us: 0.4, intl: 0 };
  }

  return {
    cad: cad / total,
    us: us / total,
    intl: intl / total,
  };
}

function getAllocationWeight(alloc: AssetAllocation, savingsAccounts: SavingsAccount[]): number {
  const matchedAccounts = savingsAccounts.filter(account => {
    if (account.account_type !== alloc.account_type) return false;
    return (account.person ?? 'primary') === (alloc.person ?? 'primary');
  });

  if (matchedAccounts.length === 0) {
    return 1;
  }

  const balance = matchedAccounts.reduce((sum, account) => sum + Math.max(0, account.current_balance || 0), 0);
  return balance > 0 ? balance : 1;
}

export function estimateMarketAssumptions(
  scenario: Pick<Scenario, 'cad_equity_weight' | 'us_equity_weight' | 'int_equity_weight'>,
  allocations: AssetAllocation[] = [],
  savingsAccounts: SavingsAccount[] = []
): MarketAssumptions {
  if (!allocations || allocations.length === 0) {
    const geo = normalizeGeoWeights(
      scenario.cad_equity_weight,
      scenario.us_equity_weight,
      scenario.int_equity_weight
    );
    const totalEquityWeight = DEFAULT_FALLBACK_EQUITY_WEIGHT;
    const fixedIncomeWeight = 1 - totalEquityWeight;

    return {
      expectedReturn: round1((totalEquityWeight * EQUITY_EXPECTED_RETURN) + (fixedIncomeWeight * NON_EQUITY_EXPECTED_RETURN)),
      stdDev: round1((totalEquityWeight * EQUITY_STD_DEV) + (fixedIncomeWeight * NON_EQUITY_STD_DEV)),
      totalEquityWeight,
      fixedIncomeWeight,
      cadEquityWeight: round1(geo.cad * 100),
      usEquityWeight: round1(geo.us * 100),
      intEquityWeight: round1(geo.intl * 100),
      source: 'fallback',
    };
  }

  let totalPortfolioWeight = 0;
  let totalEquityExposure = 0;
  let cadEquityExposure = 0;
  let usEquityExposure = 0;
  let intEquityExposure = 0;

  for (const alloc of allocations) {
    const portfolioWeight = getAllocationWeight(alloc, savingsAccounts);
    const stockWeight = Math.max(0, Math.min(100, alloc.stocks ?? 0)) / 100;
    const geo = normalizeGeoWeights(
      alloc.cad_equity_weight,
      alloc.us_equity_weight,
      alloc.int_equity_weight
    );
    const equityExposure = portfolioWeight * stockWeight;

    totalPortfolioWeight += portfolioWeight;
    totalEquityExposure += equityExposure;
    cadEquityExposure += equityExposure * geo.cad;
    usEquityExposure += equityExposure * geo.us;
    intEquityExposure += equityExposure * geo.intl;
  }

  if (totalPortfolioWeight <= 0) {
    return estimateMarketAssumptions(scenario, [], []);
  }

  const totalEquityWeight = Math.max(0, Math.min(1, totalEquityExposure / totalPortfolioWeight));
  const fixedIncomeWeight = 1 - totalEquityWeight;
  const fallbackGeo = normalizeGeoWeights(
    scenario.cad_equity_weight,
    scenario.us_equity_weight,
    scenario.int_equity_weight
  );
  const geoDenominator = totalEquityExposure > 0 ? totalEquityExposure : 1;

  return {
    expectedReturn: round1((totalEquityWeight * EQUITY_EXPECTED_RETURN) + (fixedIncomeWeight * NON_EQUITY_EXPECTED_RETURN)),
    stdDev: round1((totalEquityWeight * EQUITY_STD_DEV) + (fixedIncomeWeight * NON_EQUITY_STD_DEV)),
    totalEquityWeight: round1(totalEquityWeight * 100) / 100,
    fixedIncomeWeight: round1(fixedIncomeWeight * 100) / 100,
    cadEquityWeight: round1((totalEquityExposure > 0 ? cadEquityExposure / geoDenominator : fallbackGeo.cad) * 100),
    usEquityWeight: round1((totalEquityExposure > 0 ? usEquityExposure / geoDenominator : fallbackGeo.us) * 100),
    intEquityWeight: round1((totalEquityExposure > 0 ? intEquityExposure / geoDenominator : fallbackGeo.intl) * 100),
    source: 'allocations',
  };
}