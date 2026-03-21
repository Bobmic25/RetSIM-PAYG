import {
  Scenario,
  AssetAllocation,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  OneTimeEvent,
  YearlyProjection,
  MonteCarloResult
} from '../types/retirement';
import {
  calculateTotalTax,
  calculateOptimalPensionSplit,
  getFirstBracketTop,
  getOASClawbackThreshold,
  calcTieredCapitalGainInclusion,
  calculateTerminalTax,
  getMarginalRate
} from './taxEngine';
import { calculateCPPBenefit, calculateOASBenefit, adjustForInflation, calculateGISBenefit, applyOAS75Bump, type GISResult } from './benefitsEngine';
import {
  generateReturnSequence,
  generateStochasticInflationSequence,
  runMonteCarloMemoryEfficient
} from './monteCarloEngine';

interface AccountBalances {
  rrsp: number;
  rrsp_spouse: number;
  tfsa: number;
  fhsa: number;
  non_reg_primary: number;
  non_reg_primary_acb: number;
  non_reg_spouse: number;
  non_reg_spouse_acb: number;
}

export interface ProjectionOverrides {
  retirementAge?: number;
  expenseMultiplier?: number;
  disableForcedWithdrawals?: boolean;
  disableBracketFilling?: boolean;
  disableRrspExhaustion?: boolean;
  additionalMonthlySavings?: number;
  withdrawalStrategy?: Scenario['withdrawal_strategy'];
}

const RRIF_MINIMUM_RATES: Record<number, number> = {
  71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582,
  76: 0.0598, 77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682,
  81: 0.0708, 82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851,
  86: 0.0899, 87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192,
  91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879, 95: 0.2000
};

function getRRIFMinimum(age: number, balance: number): number {
  const rate = RRIF_MINIMUM_RATES[Math.min(age, 95)] ?? 0.2;
  return balance * rate;
}

function getExpensesForAge(age: number, expenseLadder: ExpenseLadder[]): number {
  const ladder = expenseLadder.find(l => age >= l.start_age && age <= l.end_age);
  if (!ladder) return 0;
  return ladder.living_expenses + ladder.travel_expenses + ladder.other_expenses;
}

function getOneTimeEventsForAge(
  age: number,
  events: OneTimeEvent[],
  year: number,
  inflationRate: number
): { inheritance: number; expenses: number } {
  const inheritances = events
    .filter(e => e.age === age && e.event_type === 'inheritance')
    .reduce((sum, e) => {
      const inflated = adjustForInflation(e.amount, year, inflationRate);
      return sum + (e.tax_rate ? inflated * (1 - e.tax_rate / 100) : inflated);
    }, 0);

  const expenses = events
    .filter(e => e.age === age && e.event_type === 'expense')
    .reduce((sum, e) => sum + adjustForInflation(e.amount, year, inflationRate), 0);

  return { inheritance: inheritances, expenses };
}

function getIncomeForAge(
  age: number,
  sources: IncomeSource[],
  yearFromStart: number,
  inflationRate: number
): number {
  return sources
    .filter(s => age >= s.start_age && (!s.end_age || age <= s.end_age))
    .reduce((sum, source) => {
      const yearsActive = age - source.start_age;
      const growthFactor = Math.pow(1 + source.growth_rate / 100, yearsActive);
      const inflationAdjusted = adjustForInflation(source.amount, yearFromStart, inflationRate);
      return sum + inflationAdjusted * growthFactor;
    }, 0);
}

function calculateContributions(
  age: number,
  accounts: SavingsAccount[],
  yearFromStart: number,
  inflationRate: number
): AccountBalances {
  const balances: AccountBalances = { rrsp: 0, rrsp_spouse: 0, tfsa: 0, fhsa: 0, non_reg_primary: 0, non_reg_primary_acb: 0, non_reg_spouse: 0, non_reg_spouse_acb: 0 };
  accounts.forEach(account => {
    if (age <= account.contribution_end_age) {
      const annual = account.monthly_contribution * 12;
      const inflationLinked = account.inflation_linked !== false;
      const contribution = inflationLinked
        ? adjustForInflation(annual, yearFromStart, inflationRate)
        : annual;
      if (account.account_type === 'rrsp') {
        if (account.person === 'spouse') {
          balances.rrsp_spouse += contribution;
        } else {
          balances.rrsp += contribution;
        }
      } else if (account.account_type === 'non_reg') {
        if (account.person === 'spouse') {
          balances.non_reg_spouse += contribution;
          balances.non_reg_spouse_acb += contribution;
        } else {
          balances.non_reg_primary += contribution;
          balances.non_reg_primary_acb += contribution;
        }
      } else {
        balances[account.account_type] += contribution;
      }
    }
  });
  return balances;
}

const FOREIGN_WITHHOLDING_DIVIDEND_YIELD = 0.02;
const FOREIGN_WITHHOLDING_RATE = 0.15;
const FOREIGN_WITHHOLDING_DRAG = FOREIGN_WITHHOLDING_DIVIDEND_YIELD * FOREIGN_WITHHOLDING_RATE;

function getAccountUsEquityWeight(accountType: string, allocations?: AssetAllocation[], person?: 'primary' | 'spouse'): number {
  if (!allocations || allocations.length === 0) return 0.6;
  const alloc = allocations.find(a => a.account_type === accountType && (person == null || (a.person ?? 'primary') === person))
    ?? allocations.find(a => a.account_type === accountType && a.person == null)
    ?? allocations.find(a => a.account_type === accountType);
  if (!alloc) return 0.6;
  const stocksFraction = alloc.stocks / 100;
  const usWeightFraction = (alloc.us_equity_weight ?? 60) / 100;
  return stocksFraction * usWeightFraction;
}

function applyReturns(balances: AccountBalances, returnRate: number, allocations?: AssetAllocation[]): void {
  const rrspFactor = 1 + returnRate / 100;
  balances.rrsp *= rrspFactor;
  balances.rrsp_spouse *= rrspFactor;
  balances.fhsa *= rrspFactor;

  const tfsaUsWeight = getAccountUsEquityWeight('tfsa', allocations);
  const tfsaDrag = tfsaUsWeight * FOREIGN_WITHHOLDING_DRAG * 100;
  balances.tfsa *= (1 + (returnRate - tfsaDrag) / 100);

  const nonRegPrimaryUsWeight = getAccountUsEquityWeight('non_reg', allocations, 'primary');
  const nonRegPrimaryDrag = nonRegPrimaryUsWeight * FOREIGN_WITHHOLDING_DRAG * 100;
  const nonRegPrimaryGrowthFactor = 1 + (returnRate - nonRegPrimaryDrag) / 100;
  balances.non_reg_primary *= nonRegPrimaryGrowthFactor;

  const nonRegSpouseUsWeight = getAccountUsEquityWeight('non_reg', allocations, 'spouse');
  const nonRegSpouseDrag = nonRegSpouseUsWeight * FOREIGN_WITHHOLDING_DRAG * 100;
  const nonRegSpouseGrowthFactor = 1 + (returnRate - nonRegSpouseDrag) / 100;
  balances.non_reg_spouse *= nonRegSpouseGrowthFactor;
}

function calcNonRegCapitalGainInclusion(
  withdrawal: number,
  nonRegBalance: number,
  nonRegAcb: number
): number {
  if (nonRegBalance <= 0 || withdrawal <= 0) return 0;
  const growthRatio = Math.max(0, (nonRegBalance - nonRegAcb) / nonRegBalance);
  const capitalGainPortion = withdrawal * growthRatio;
  return calcTieredCapitalGainInclusion(capitalGainPortion);
}

function updateNonRegAcbOnWithdrawal(
  withdrawal: number,
  nonRegBalance: number,
  nonRegAcb: number
): number {
  if (nonRegBalance <= 0 || withdrawal <= 0) return nonRegAcb;
  const acbRatio = nonRegAcb / nonRegBalance;
  const acbReduction = withdrawal * acbRatio;
  return Math.max(0, nonRegAcb - acbReduction);
}

function grossUpRRSPWithdrawal(
  netNeeded: number,
  baseTaxableIncome: number,
  province: Scenario['province'],
  yearIndex: number,
  inflationRate: number,
  age: number,
  pensionIncome: number
): number {
  if (netNeeded <= 0) return 0;

  const GUARDRAIL = netNeeded * 5;

  const marginalRate = getMarginalRate(baseTaxableIncome, province, yearIndex, inflationRate);
  let grossAmount = netNeeded / Math.max(1 - marginalRate, 0.2);

  for (let i = 0; i < 8; i++) {
    if (grossAmount > GUARDRAIL) {
      grossAmount = GUARDRAIL;
      break;
    }
    const testIncome = baseTaxableIncome + grossAmount;
    const taxOnTest = calculateTotalTax(testIncome, province, 0, 0, yearIndex, inflationRate, undefined, age, pensionIncome).total;
    const taxOnBase = calculateTotalTax(baseTaxableIncome, province, 0, 0, yearIndex, inflationRate, undefined, age, pensionIncome).total;
    const marginalTax = taxOnTest - taxOnBase;
    const netFromGross = grossAmount - marginalTax;
    const error = netFromGross - netNeeded;
    if (Math.abs(error) < 1) break;
    grossAmount = grossAmount * (netNeeded / Math.max(netFromGross, 1));
  }

  return Math.max(Math.min(grossAmount, GUARDRAIL), netNeeded);
}

function bracketMatchRRSPWithdrawals(
  primaryIncome: number,
  spouseIncome: number,
  primaryRRSP: number,
  spouseRRSP: number,
  neededTotal: number,
  province: Scenario['province'],
  yearIndex: number,
  inflationRate: number
): { primaryRRSP: number; spouseRRSP: number } {
  if (neededTotal <= 0 || (primaryRRSP <= 0 && spouseRRSP <= 0)) {
    return { primaryRRSP: 0, spouseRRSP: 0 };
  }

  let primaryWithdrawal = 0;
  let spouseWithdrawal = 0;
  let remaining = neededTotal;
  const STEP = 500;

  while (remaining > 0 && (primaryRRSP - primaryWithdrawal > 0 || spouseRRSP - spouseWithdrawal > 0)) {
    const primaryMarginal = getMarginalRate(primaryIncome + primaryWithdrawal, province, yearIndex, inflationRate);
    const spouseMarginal = getMarginalRate(spouseIncome + spouseWithdrawal, province, yearIndex, inflationRate);

    const step = Math.min(STEP, remaining);

    if (primaryMarginal >= spouseMarginal && primaryRRSP - primaryWithdrawal > 0) {
      const draw = Math.min(step, primaryRRSP - primaryWithdrawal);
      primaryWithdrawal += draw;
      remaining -= draw;
    } else if (spouseRRSP - spouseWithdrawal > 0) {
      const draw = Math.min(step, spouseRRSP - spouseWithdrawal);
      spouseWithdrawal += draw;
      remaining -= draw;
    } else {
      const draw = Math.min(step, primaryRRSP - primaryWithdrawal);
      primaryWithdrawal += draw;
      remaining -= draw;
    }
  }

  return { primaryRRSP: primaryWithdrawal, spouseRRSP: spouseWithdrawal };
}

interface WithdrawalResult {
  tfsa: number;
  rrsp: number;
  rrsp_spouse: number;
  non_reg_primary: number;
  non_reg_spouse: number;
  rrifMinimum: number;
  bracketTop: number;
  total: number;
  cap_gain_primary: number;
  cap_gain_spouse: number;
}

function isGISAtRisk(
  currentTaxableIncome: number,
  rrspWithdrawal: number,
  province: Scenario['province'],
  year: number,
  inflationRate: number,
  age: number,
  pensionIncome: number,
  gisResult: GISResult
): boolean {
  if (!gisResult || gisResult.gisAmount <= 0) return false;
  const taxBefore = calculateTotalTax(currentTaxableIncome, province, 0, 0, year, inflationRate, undefined, age, pensionIncome).total;
  const taxAfter = calculateTotalTax(currentTaxableIncome + rrspWithdrawal, province, 0, 0, year, inflationRate, undefined, age, pensionIncome).total;
  const marginalIncomeTaxRate = rrspWithdrawal > 0 ? (taxAfter - taxBefore) / rrspWithdrawal : 0;
  const effectiveMarginalRate = marginalIncomeTaxRate + gisResult.effectiveMarginalRateIncrease;
  return effectiveMarginalRate > 0.50;
}

function calculateOptimizedWithdrawals(
  balances: AccountBalances,
  needed: number,
  age: number,
  currentTaxableIncome: number,
  province: Scenario['province'],
  year: number,
  inflationRate: number,
  oasAmount: number,
  isCouple?: boolean,
  spouseIncome?: number,
  gisResult?: GISResult,
  rrspExhaustionTarget?: number,
  isRetired?: boolean,
  retirementYearIndex?: number,
  withdrawalStrategy?: Scenario['withdrawal_strategy'],
  disableForcedWithdrawals?: boolean,
  disableBracketFilling?: boolean
): WithdrawalResult {
  let remaining = needed;
  const result: WithdrawalResult = {
    tfsa: 0,
    rrsp: 0,
    rrsp_spouse: 0,
    non_reg_primary: 0,
    non_reg_spouse: 0,
    rrifMinimum: 0,
    bracketTop: 0,
    total: 0,
    cap_gain_primary: 0,
    cap_gain_spouse: 0
  };

  const oasThreshold = getOASClawbackThreshold(year, inflationRate);
  const firstBracketTop = getFirstBracketTop(province, year, inflationRate);

  const totalRrsp = balances.rrsp + balances.rrsp_spouse;

  let exhaustionFloor = 0;
  if (isRetired && rrspExhaustionTarget != null && rrspExhaustionTarget > 0 && totalRrsp > 0) {
    const yearsFromRetirement = year - (retirementYearIndex ?? 0);
    const inflatedTarget = rrspExhaustionTarget * Math.pow(1 + inflationRate / 100, yearsFromRetirement);
    exhaustionFloor = Math.min(inflatedTarget, totalRrsp);
  }

  if (isRetired && age >= 72 && balances.rrsp > 0) {
    const rrifMinimumRaw = getRRIFMinimum(age, balances.rrsp);
    const rrifWithdraw = Math.min(rrifMinimumRaw, balances.rrsp);
    result.rrsp += rrifWithdraw;
    result.rrifMinimum = rrifWithdraw;
    balances.rrsp -= rrifWithdraw;
    remaining -= rrifWithdraw;
  }

  if (remaining > 0 && (balances.non_reg_primary > 0 || balances.non_reg_spouse > 0)) {
    const totalNonReg = balances.non_reg_primary + balances.non_reg_spouse;
    const fromNonRegTotal = Math.min(remaining, totalNonReg);

    // Draw from the lower-income spouse first to improve household tax efficiency.
    const spouseTaxableBase = spouseIncome ?? Infinity;
    const primaryFirst = currentTaxableIncome <= spouseTaxableBase;

    let fromPrimary = 0;
    let fromSpouseNR = 0;

    if (primaryFirst) {
      fromPrimary = Math.min(fromNonRegTotal, balances.non_reg_primary);
      fromSpouseNR = Math.min(fromNonRegTotal - fromPrimary, balances.non_reg_spouse);
    } else {
      fromSpouseNR = Math.min(fromNonRegTotal, balances.non_reg_spouse);
      fromPrimary = Math.min(fromNonRegTotal - fromSpouseNR, balances.non_reg_primary);
    }

    const cgInclusionPrimary = calcNonRegCapitalGainInclusion(fromPrimary, balances.non_reg_primary, balances.non_reg_primary_acb);
    const cgInclusionSpouse = calcNonRegCapitalGainInclusion(fromSpouseNR, balances.non_reg_spouse, balances.non_reg_spouse_acb);
    balances.non_reg_primary_acb = updateNonRegAcbOnWithdrawal(fromPrimary, balances.non_reg_primary, balances.non_reg_primary_acb);
    balances.non_reg_spouse_acb = updateNonRegAcbOnWithdrawal(fromSpouseNR, balances.non_reg_spouse, balances.non_reg_spouse_acb);
    result.non_reg_primary += fromPrimary;
    result.non_reg_spouse += fromSpouseNR;
    result.cap_gain_primary += cgInclusionPrimary;
    result.cap_gain_spouse += cgInclusionSpouse;
    balances.non_reg_primary -= fromPrimary;
    balances.non_reg_spouse -= fromSpouseNR;
    remaining -= fromPrimary + fromSpouseNR;
  }

  const pensionIncomeEstimate = result.rrsp;
  const gisBlocksRRSP = remaining > 0 && gisResult &&
    isGISAtRisk(currentTaxableIncome + result.rrsp, remaining, province, year, inflationRate, age, pensionIncomeEstimate, gisResult);

  const rrspRemainingCap = () => Infinity;

  if (isRetired && !gisBlocksRRSP && remaining > 0 && (balances.rrsp > 0 || balances.rrsp_spouse > 0)) {
    const capAvail = rrspRemainingCap();
    if (capAvail > 0) {
      const wantedFromRrsp = Math.min(remaining, capAvail);
      if (isCouple && balances.rrsp_spouse > 0 && spouseIncome !== undefined) {
        const matched = bracketMatchRRSPWithdrawals(
          currentTaxableIncome + result.rrsp,
          spouseIncome,
          balances.rrsp,
          balances.rrsp_spouse,
          wantedFromRrsp,
          province,
          year,
          inflationRate
        );
        const fromPrimary = Math.min(matched.primaryRRSP, balances.rrsp);
        const fromSpouse = Math.min(matched.spouseRRSP, balances.rrsp_spouse);
        result.rrsp += fromPrimary;
        result.rrsp_spouse += fromSpouse;
        balances.rrsp -= fromPrimary;
        balances.rrsp_spouse -= fromSpouse;
        remaining -= (fromPrimary + fromSpouse);
      } else if (balances.rrsp > 0) {
        const pensionIncome = result.rrsp;
        const grossed = grossUpRRSPWithdrawal(
          wantedFromRrsp, currentTaxableIncome + result.rrsp, province, year, inflationRate, age, pensionIncome
        );
        const fromRRSP = Math.min(grossed, balances.rrsp, capAvail);
        result.rrsp += fromRRSP;
        balances.rrsp -= fromRRSP;
        remaining -= Math.min(remaining, fromRRSP);
      }
    }
  }

  if (remaining > 0 && balances.fhsa > 0) {
    const fromFHSA = Math.min(remaining, balances.fhsa);
    balances.fhsa -= fromFHSA;
    remaining -= fromFHSA;
  }

  if (remaining > 0 && balances.tfsa > 0) {
    const fromTFSA = Math.min(remaining, balances.tfsa);
    result.tfsa = fromTFSA;
    balances.tfsa -= fromTFSA;
    remaining -= fromTFSA;
  }

  if (isRetired && gisBlocksRRSP && remaining > 0 && (balances.rrsp > 0 || balances.rrsp_spouse > 0)) {
    const capAvail = rrspRemainingCap();
    if (capAvail > 0) {
      const wantedFromRrsp = Math.min(remaining, capAvail);
      if (isCouple && balances.rrsp_spouse > 0 && spouseIncome !== undefined) {
        const matched = bracketMatchRRSPWithdrawals(
          currentTaxableIncome + result.rrsp,
          spouseIncome,
          balances.rrsp,
          balances.rrsp_spouse,
          wantedFromRrsp,
          province,
          year,
          inflationRate
        );
        const fromPrimary = Math.min(matched.primaryRRSP, balances.rrsp);
        const fromSpouse = Math.min(matched.spouseRRSP, balances.rrsp_spouse);
        result.rrsp += fromPrimary;
        result.rrsp_spouse += fromSpouse;
        balances.rrsp -= fromPrimary;
        balances.rrsp_spouse -= fromSpouse;
      } else if (balances.rrsp > 0) {
        const pensionIncome = result.rrsp;
        const grossed = grossUpRRSPWithdrawal(
          wantedFromRrsp, currentTaxableIncome + result.rrsp, province, year, inflationRate, age, pensionIncome
        );
        const fromRRSP = Math.min(grossed, balances.rrsp, capAvail);
        result.rrsp += fromRRSP;
        balances.rrsp -= fromRRSP;
      }
    }
  }

  const isNetExpensesOnly = withdrawalStrategy === 'net_expenses_only';

  // Bracket filling logic - only for maximize_spending/tax_efficient, skipped for net_expenses_only
  const shouldFillBracket = !disableBracketFilling && !isNetExpensesOnly &&
    (withdrawalStrategy === 'maximize_spending' || withdrawalStrategy === 'tax_efficient' || withdrawalStrategy === undefined);

  if (isRetired && shouldFillBracket && (age >= 72 || (age >= 65 && balances.rrsp > 0))) {
    const capAvail = rrspRemainingCap();
    if (capAvail > 0) {
      const currentTaxable = currentTaxableIncome + result.rrsp + result.cap_gain_primary;
      const bracketRoom = firstBracketTop - currentTaxable;
      if (bracketRoom > 0 && balances.rrsp > 0 && needed <= 0) {
        const bracketTop = Math.min(bracketRoom, balances.rrsp, capAvail);
        result.rrsp += bracketTop;
        result.bracketTop = bracketTop;
        balances.rrsp -= bracketTop;
      }
    }
  }

  // RRSP exhaustion logic - apply based on strategy, skipped for net_expenses_only
  const shouldApplyExhaustion = !disableForcedWithdrawals && !isNetExpensesOnly &&
    (withdrawalStrategy === 'maximize_spending' || withdrawalStrategy === 'tax_efficient' || withdrawalStrategy === undefined);

  // For maximize_estate, only apply exhaustion if it reduces terminal tax
  const currentRrspWithdrawn = result.rrsp + result.rrsp_spouse;
  if (isRetired && shouldApplyExhaustion && exhaustionFloor > currentRrspWithdrawn) {
    const additionalNeeded = Math.min(exhaustionFloor - currentRrspWithdrawn, rrspRemainingCap());
    const combinedRrsp = balances.rrsp + balances.rrsp_spouse;

    // For maximize_estate, evaluate if this withdrawal is beneficial
    let shouldWithdraw = true;
    if ((withdrawalStrategy as string) === 'maximize_estate' && combinedRrsp > 0 && additionalNeeded > 0) {
      // Estimate marginal tax on this withdrawal
      const marginalRate = getMarginalRate(currentTaxableIncome + result.rrsp, province, year, inflationRate);
      // If marginal rate is very high (>40%), skip the forced exhaustion for estate preservation
      if (marginalRate > 0.40) {
        shouldWithdraw = false;
      }
    }

    if (shouldWithdraw && combinedRrsp > 0 && additionalNeeded > 0) {
      if (isCouple && balances.rrsp_spouse > 0 && spouseIncome !== undefined) {
        const matched = bracketMatchRRSPWithdrawals(
          currentTaxableIncome + result.rrsp,
          spouseIncome,
          balances.rrsp,
          balances.rrsp_spouse,
          additionalNeeded,
          province,
          year,
          inflationRate
        );
        const fromPrimary = Math.min(matched.primaryRRSP, balances.rrsp);
        const fromSpouse = Math.min(matched.spouseRRSP, balances.rrsp_spouse);
        result.rrsp += fromPrimary;
        result.rrsp_spouse += fromSpouse;
        balances.rrsp -= fromPrimary;
        balances.rrsp_spouse -= fromSpouse;
      } else if (balances.rrsp > 0) {
        const fromRRSP = Math.min(additionalNeeded, balances.rrsp);
        result.rrsp += fromRRSP;
        balances.rrsp -= fromRRSP;
      } else if (balances.rrsp_spouse > 0) {
        const fromSpouse = Math.min(additionalNeeded, balances.rrsp_spouse);
        result.rrsp_spouse += fromSpouse;
        balances.rrsp_spouse -= fromSpouse;
      }
    }
  }

  result.total = result.tfsa + result.rrsp + result.rrsp_spouse + result.non_reg_primary + result.non_reg_spouse;
  return result;
}


function getGlidePathAllocations(
  allocations: AssetAllocation[],
  age: number,
  startAge: number,
  scenario: Scenario
): AssetAllocation[] {
  if (!scenario.glide_path_enabled || !scenario.glide_target_age || scenario.glide_target_stocks == null) {
    return allocations;
  }
  const targetAge = scenario.glide_target_age;
  const targetStocks = scenario.glide_target_stocks;
  const targetBonds = scenario.glide_target_bonds ?? (100 - targetStocks);

  if (age >= targetAge) {
    return allocations.map(alloc => {
      const remaining = Math.max(0, 100 - targetStocks - targetBonds);
      const originalRemaining = Math.max(1, alloc.cash + alloc.real_estate + alloc.other);
      return {
        ...alloc,
        stocks: targetStocks,
        bonds: targetBonds,
        cash: remaining * (alloc.cash / originalRemaining),
        real_estate: remaining * (alloc.real_estate / originalRemaining),
        other: remaining * (alloc.other / originalRemaining)
      };
    });
  }

  if (age <= startAge) return allocations;

  const t = (age - startAge) / (targetAge - startAge);
  return allocations.map(alloc => {
    const stocks = alloc.stocks + (targetStocks - alloc.stocks) * t;
    const bonds = alloc.bonds + (targetBonds - alloc.bonds) * t;
    const remaining = Math.max(0, 100 - stocks - bonds);
    const originalRemaining = Math.max(1, alloc.cash + alloc.real_estate + alloc.other);
    return {
      ...alloc,
      stocks,
      bonds,
      cash: remaining * (alloc.cash / originalRemaining),
      real_estate: remaining * (alloc.real_estate / originalRemaining),
      other: remaining * (alloc.other / originalRemaining)
    };
  });
}

function getPortfolioGeoWeights(allocations: AssetAllocation[]): { usWeight: number; cadWeight: number } {
  if (!allocations || allocations.length === 0) return { usWeight: 0.5, cadWeight: 0.5 };
  let totalStocks = 0;
  let weightedUs = 0;
  let weightedCad = 0;
  for (const alloc of allocations) {
    totalStocks += alloc.stocks;
    const usW = alloc.us_equity_weight ?? 60;
    const cadW = alloc.cad_equity_weight ?? 40;
    weightedUs += alloc.stocks * (usW / 100);
    weightedCad += alloc.stocks * (cadW / 100);
  }
  if (totalStocks <= 0) return { usWeight: 0.5, cadWeight: 0.5 };
  return { usWeight: weightedUs / totalStocks, cadWeight: weightedCad / totalStocks };
}

const TFSA_ANNUAL_LIMIT_2026 = 7000;

function getAvailableTfsaRoom(
  age: number,
  _currentAge: number,
  yearFromStart: number,
  cumulativeContributed: number
): number {
  const currentYear = 2026 + yearFromStart;
  const birth_year = currentYear - age;
  const tfsa_eligible_since = Math.max(2009, birth_year + 18);
  const years_eligible = Math.max(0, currentYear - tfsa_eligible_since);
  const cumulative_room = TFSA_ANNUAL_LIMIT_2026 * (years_eligible + 1);
  return Math.max(0, cumulative_room - cumulativeContributed);
}

function computeRrspExhaustionTarget(
  rrspAtRetirement: number,
  retirementAge: number,
  planEndAge: number,
  expectedReturn: number,
  inflationRate: number
): number {
  const targetAge = planEndAge - 2;
  if (targetAge <= retirementAge || rrspAtRetirement <= 0) return 0;

  const totalYearsToTarget = targetAge - retirementAge;
  const r = expectedReturn / 100;
  const inf = inflationRate / 100;

  let low = 0;
  let high = rrspAtRetirement * 2;

  for (let iter = 0; iter < 80; iter++) {
    const mid = (low + high) / 2;
    let balance = rrspAtRetirement;
    let exhausted = false;

    for (let y = 0; y < totalYearsToTarget; y++) {
      balance *= (1 + r);

      const inflated = mid * Math.pow(1 + inf, y);
      const draw = inflated;
      balance -= draw;

      if (balance <= 0) {
        exhausted = true;
        break;
      }
    }

    if (exhausted || balance < 1) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
}

export function runSingleProjection(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  oneTimeEvents: OneTimeEvent[],
  returnSequence?: number[],
  overrideCppStartAge?: number,
  overrideOasStartAge?: number,
  allocations?: AssetAllocation[],
  inflationSequence?: number[],
  overrides?: ProjectionOverrides
): YearlyProjection[] {
  const projections: YearlyProjection[] = [];

  // Apply overrides
  const effectiveRetirementAge = overrides?.retirementAge ?? scenario.retirement_age;
  const expenseMultiplier = overrides?.expenseMultiplier ?? 1.0;
  const disableForcedWithdrawals = overrides?.disableForcedWithdrawals ?? false;
  const disableBracketFilling = overrides?.disableBracketFilling ?? false;
  const additionalMonthlySavings = overrides?.additionalMonthlySavings ?? 0;
  const effectiveWithdrawalStrategy = overrides?.withdrawalStrategy ?? scenario.withdrawal_strategy;

  const totalYears = (effectiveRetirementAge - scenario.current_age) + scenario.plan_duration;

  const balances: AccountBalances = {
    rrsp: savingsAccounts.filter(a => a.account_type === 'rrsp' && a.person === 'primary').reduce((s, a) => s + a.current_balance, 0),
    rrsp_spouse: savingsAccounts.filter(a => a.account_type === 'rrsp' && a.person === 'spouse').reduce((s, a) => s + a.current_balance, 0),
    tfsa: savingsAccounts.filter(a => a.account_type === 'tfsa').reduce((s, a) => s + a.current_balance, 0),
    fhsa: savingsAccounts.filter(a => a.account_type === 'fhsa').reduce((s, a) => s + a.current_balance, 0),
    non_reg_primary: savingsAccounts.filter(a => a.account_type === 'non_reg' && a.person === 'primary').reduce((s, a) => s + a.current_balance, 0),
    non_reg_primary_acb: savingsAccounts.filter(a => a.account_type === 'non_reg' && a.person === 'primary').reduce((s, a) => s + a.current_balance, 0),
    non_reg_spouse: savingsAccounts.filter(a => a.account_type === 'non_reg' && a.person === 'spouse').reduce((s, a) => s + a.current_balance, 0),
    non_reg_spouse_acb: savingsAccounts.filter(a => a.account_type === 'non_reg' && a.person === 'spouse').reduce((s, a) => s + a.current_balance, 0),
  };

  const cppStartAge = overrideCppStartAge ?? scenario.cpp_start_age;
  const oasStartAge = overrideOasStartAge ?? scenario.oas_start_age;
  const oasBase = scenario.oas_amount_65 || 8505;

  const cppAmount = calculateCPPBenefit(scenario.cpp_amount_65, cppStartAge);
  const oasAmount = calculateOASBenefit(oasStartAge, oasBase);

  const isCouple = scenario.profile_type === 'couple';
  const spouseCppStartAge = scenario.spouse_cpp_start_age || 65;
  const spouseOasStartAge = scenario.spouse_oas_start_age || 65;
  const spouseOasBase = scenario.spouse_oas_amount_65 || 8505;
  const spouseCppAmount = isCouple ? calculateCPPBenefit(scenario.spouse_cpp_amount_65 || 0, spouseCppStartAge) : 0;
  const spouseOasAmount = isCouple ? calculateOASBenefit(spouseOasStartAge, spouseOasBase) : 0;

  const planEndAge = scenario.current_age + totalYears;
  const retirementYearIndex = effectiveRetirementAge - scenario.current_age;

  const rrspAtRetirement = (() => {
    const r = scenario.expected_return / 100;
    let bal = balances.rrsp + balances.rrsp_spouse;
    for (let y = 0; y < retirementYearIndex; y++) {
      bal *= (1 + r);
      const age = scenario.current_age + y;
      const contribThisYear = savingsAccounts
        .filter(a => a.account_type === 'rrsp' && age <= a.contribution_end_age)
        .reduce((s, a) => s + a.monthly_contribution * 12, 0);
      bal += contribThisYear;
    }
    return Math.max(0, bal);
  })();

  const rrspExhaustionAnnualBase = (overrides?.disableRrspExhaustion)
    ? 0
    : computeRrspExhaustionTarget(
        rrspAtRetirement,
        effectiveRetirementAge,
        planEndAge,
        scenario.expected_return,
        scenario.inflation_rate
      );

  const initialTfsaBalance = balances.tfsa;
  let cumulativeTfsaContributed = initialTfsaBalance;

  for (let year = 0; year < totalYears; year++) {
    const age = scenario.current_age + year;
    const effectiveInflation = inflationSequence ? inflationSequence[year] : scenario.inflation_rate;

    const primarySalary = getIncomeForAge(
      age, incomeSources.filter(s => s.person === 'primary'), year, effectiveInflation
    );
    const spouseSalary = isCouple
      ? getIncomeForAge(age, incomeSources.filter(s => s.person === 'spouse'), year, effectiveInflation)
      : 0;
    const salary = primarySalary + spouseSalary;

    const cpp = age >= cppStartAge ? adjustForInflation(cppAmount, year, effectiveInflation) : 0;
    const oasBase = age >= oasStartAge ? adjustForInflation(applyOAS75Bump(oasAmount, age), year, effectiveInflation) : 0;
    const oas = oasBase;
    const spouseAge = isCouple && scenario.spouse_age != null ? scenario.spouse_age + year : age;
    const spouseCpp = (isCouple && age >= spouseCppStartAge) ? adjustForInflation(spouseCppAmount, year, effectiveInflation) : 0;
    const spouseOas = (isCouple && age >= spouseOasStartAge) ? adjustForInflation(applyOAS75Bump(spouseOasAmount, spouseAge), year, effectiveInflation) : 0;

    const totalCpp = cpp + spouseCpp;
    const totalOas = oas + spouseOas;

    const dbPensionStartAge = scenario.db_pension_start_age ?? scenario.retirement_age;
    const dbPensionBase = scenario.has_db_pension && scenario.db_pension_amount && age >= dbPensionStartAge
      ? (scenario.db_pension_indexed ? adjustForInflation(scenario.db_pension_amount, year, effectiveInflation) : scenario.db_pension_amount)
      : 0;

    const spouseDbPensionStartAge = scenario.spouse_db_pension_start_age ?? scenario.retirement_age;
    const spouseDbPensionBase = isCouple && scenario.spouse_has_db_pension && scenario.spouse_db_pension_amount && age >= spouseDbPensionStartAge
      ? (scenario.spouse_db_pension_indexed ? adjustForInflation(scenario.spouse_db_pension_amount, year, effectiveInflation) : scenario.spouse_db_pension_amount)
      : 0;

    const totalDbPension = dbPensionBase + spouseDbPensionBase;

    const { inheritance, expenses: oneTimeExpenses } = getOneTimeEventsForAge(age, oneTimeEvents, year, effectiveInflation);

    const oasReceiving = totalOas > 0;
    const rrifWithdrawalEstimate = (age >= 72 && (balances.rrsp + balances.rrsp_spouse) > 0)
      ? getRRIFMinimum(age, balances.rrsp + balances.rrsp_spouse)
      : 0;
    const totalNonRegForGis = balances.non_reg_primary + balances.non_reg_spouse;
    const totalNonRegAcbForGis = balances.non_reg_primary_acb + balances.non_reg_spouse_acb;
    const nonRegGainEstimate = totalNonRegForGis > 0 && totalNonRegForGis > totalNonRegAcbForGis
      ? calcTieredCapitalGainInclusion((totalNonRegForGis - totalNonRegAcbForGis) * 0.04, year, effectiveInflation)
      : 0;
    const preGisOtherIncome = salary + totalCpp + totalDbPension + rrifWithdrawalEstimate + nonRegGainEstimate;
    const gisResult = calculateGISBenefit(
      preGisOtherIncome, isCouple, age, oasReceiving, year, effectiveInflation
    );
    const gisAmount = gisResult.gisAmount;

    const contributions = calculateContributions(age, savingsAccounts, year, effectiveInflation);
    balances.rrsp += contributions.rrsp;
    balances.rrsp_spouse += contributions.rrsp_spouse;
    const availableTfsaRoom = getAvailableTfsaRoom(age, scenario.current_age, year, cumulativeTfsaContributed);
    const allowedTfsaContribution = Math.min(contributions.tfsa, availableTfsaRoom);
    balances.tfsa += allowedTfsaContribution;
    cumulativeTfsaContributed += allowedTfsaContribution;
    balances.fhsa += contributions.fhsa;
    balances.non_reg_primary += contributions.non_reg_primary;
    balances.non_reg_primary_acb += contributions.non_reg_primary_acb;
    balances.non_reg_spouse += contributions.non_reg_spouse;
    balances.non_reg_spouse_acb += contributions.non_reg_spouse_acb;

    if (additionalMonthlySavings > 0 && age < effectiveRetirementAge) {
      const additionalAnnual = additionalMonthlySavings * 12;
      const inflatedAdditional = adjustForInflation(additionalAnnual, year, effectiveInflation);
      const addlTfsaRoom = getAvailableTfsaRoom(age, scenario.current_age, year, cumulativeTfsaContributed);
      const addlAllowed = Math.min(inflatedAdditional, addlTfsaRoom);
      balances.tfsa += addlAllowed;
      cumulativeTfsaContributed += addlAllowed;
    }

    const livingExpenses = adjustForInflation(getExpensesForAge(age, expenseLadder), year, effectiveInflation) * expenseMultiplier;
    const totalExpensesNeeded = livingExpenses + oneTimeExpenses;

    const guaranteedIncome = salary + totalCpp + totalOas + totalDbPension + gisAmount + inheritance;
    const shortfall = Math.max(0, totalExpensesNeeded - guaranteedIncome);

    const baseTaxableIncome = primarySalary + cpp + oas + dbPensionBase;

    const preWithdrawalRrsp = balances.rrsp + balances.rrsp_spouse;
    const preWithdrawalTfsa = balances.tfsa;
    const preWithdrawalFhsa = balances.fhsa;
    const preWithdrawalNonReg = balances.non_reg_primary + balances.non_reg_spouse;

    const isRetired = age >= effectiveRetirementAge;
    const withdrawals = calculateOptimizedWithdrawals(
      balances, shortfall, age, baseTaxableIncome,
      scenario.province, year, effectiveInflation, oas,
      isCouple, spouseSalary + spouseCpp + spouseOas + spouseDbPensionBase,
      gisResult,
      rrspExhaustionAnnualBase,
      isRetired,
      retirementYearIndex,
      effectiveWithdrawalStrategy,
      disableForcedWithdrawals,
      disableBracketFilling
    );

    const yearAllocations = allocations
      ? getGlidePathAllocations(allocations, age, scenario.current_age, scenario)
      : allocations;

    const returnRate = returnSequence ? returnSequence[year] : scenario.expected_return;
    applyReturns(balances, returnRate, yearAllocations);

    const rrspMarketReturn = preWithdrawalRrsp * (returnRate / 100);
    const tfsaUsWeight = getAccountUsEquityWeight('tfsa', yearAllocations);
    const tfsaDrag = tfsaUsWeight * FOREIGN_WITHHOLDING_DRAG * 100;
    const tfsaMarketReturn = preWithdrawalTfsa * ((returnRate - tfsaDrag) / 100);
    const fhsaMarketReturn = preWithdrawalFhsa * (returnRate / 100);
    const nonRegUsWeight = getAccountUsEquityWeight('non_reg', yearAllocations);
    const nonRegDrag = nonRegUsWeight * FOREIGN_WITHHOLDING_DRAG * 100;
    const nonRegMarketReturn = preWithdrawalNonReg * ((returnRate - nonRegDrag) / 100);

    const pensionIncomeForCredit = cpp + withdrawals.rrsp + dbPensionBase;
    const primaryTaxableIncome = primarySalary + cpp + oas + dbPensionBase + withdrawals.rrsp + withdrawals.cap_gain_primary;
    const spouseTaxableIncomeBase = spouseSalary + spouseCpp + spouseOas + spouseDbPensionBase + withdrawals.cap_gain_spouse;

    let federalTax: number;
    let provincialTax: number;
    let cppEiOasTax: number;
    let totalTax: number;

    if (isCouple && age >= 65) {
      const eligiblePension = cpp + withdrawals.rrsp + dbPensionBase;
      const spouseTaxableBase = spouseTaxableIncomeBase;
      const split = calculateOptimalPensionSplit(
        primaryTaxableIncome, spouseTaxableBase, eligiblePension,
        scenario.province, year, effectiveInflation
      );
      const primaryCppEiOas = calculateTotalTax(primaryTaxableIncome, scenario.province, primarySalary, oas, year, effectiveInflation, undefined, age, pensionIncomeForCredit);
      cppEiOasTax = primaryCppEiOas.cpp + primaryCppEiOas.ei + primaryCppEiOas.oasClawback;
      const spousePensionForCredit = spouseCpp + spouseDbPensionBase;
      const spouseFull = calculateTotalTax(spouseTaxableBase, scenario.province, spouseSalary, spouseOas, year, effectiveInflation, undefined, age, spousePensionForCredit);
      provincialTax = primaryCppEiOas.provincial + spouseFull.provincial;
      federalTax = primaryCppEiOas.federal + spouseFull.federal;
      totalTax = split.combinedTax + cppEiOasTax + spouseFull.cpp + spouseFull.ei + spouseFull.oasClawback;
    } else {
      const primaryCalc = calculateTotalTax(primaryTaxableIncome, scenario.province, primarySalary, oas, year, effectiveInflation, undefined, age, pensionIncomeForCredit);
      federalTax = primaryCalc.federal;
      provincialTax = primaryCalc.provincial;
      cppEiOasTax = primaryCalc.cpp + primaryCalc.ei + primaryCalc.oasClawback;
      totalTax = primaryCalc.total;

      if (isCouple) {
        const spouseTaxable = spouseTaxableIncomeBase;
        const spousePensionForCredit = spouseCpp + spouseDbPensionBase;
        const spouseCalc = calculateTotalTax(spouseTaxable, scenario.province, spouseSalary, spouseOas, year, effectiveInflation, undefined, age, spousePensionForCredit);
        federalTax += spouseCalc.federal;
        provincialTax += spouseCalc.provincial;
        cppEiOasTax += spouseCalc.cpp + spouseCalc.ei + spouseCalc.oasClawback;
        totalTax += spouseCalc.total;
      }
    }

    const nonRegWithdrawal = withdrawals.non_reg_primary + withdrawals.non_reg_spouse;
    const afterTaxIncome = guaranteedIncome + withdrawals.rrsp + withdrawals.rrsp_spouse + nonRegWithdrawal - totalTax + withdrawals.tfsa;

    const isNetExpensesOnly = effectiveWithdrawalStrategy === 'net_expenses_only';
    let surplus = afterTaxIncome - totalExpensesNeeded;
    let surplusToNonReg = 0;

    if (isNetExpensesOnly) {
      const withdrawalsWithTax = withdrawals.rrsp + withdrawals.rrsp_spouse + nonRegWithdrawal + withdrawals.tfsa;
      const withdrawalAfterTax = withdrawalsWithTax - totalTax;
      const exactAmountNeeded = totalExpensesNeeded - guaranteedIncome;
      surplus = withdrawalAfterTax - exactAmountNeeded;
      surplusToNonReg = 0;
    } else {
      surplusToNonReg = surplus > 0 ? surplus : 0;
      if (surplusToNonReg > 0) {
        if (isCouple) {
          const primaryShare = 0.5;
          const toPrimary = surplusToNonReg * primaryShare;
          const toSpouse = surplusToNonReg - toPrimary;
          balances.non_reg_primary += toPrimary;
          balances.non_reg_primary_acb += toPrimary;
          balances.non_reg_spouse += toSpouse;
          balances.non_reg_spouse_acb += toSpouse;
        } else {
          balances.non_reg_primary += surplusToNonReg;
          balances.non_reg_primary_acb += surplusToNonReg;
        }
      }
    }

    const isLastYear = year === totalYears - 1;
    let terminalTax: number | undefined;
    let netEstateValue: number | undefined;

    if (isLastYear) {
      const primaryTerminal = calculateTerminalTax(
        balances.rrsp,
        balances.non_reg_primary,
        balances.non_reg_primary_acb,
        scenario.province,
        year,
        effectiveInflation,
        age
      );

      const spouseTerminal = calculateTerminalTax(
        balances.rrsp_spouse,
        balances.non_reg_spouse,
        balances.non_reg_spouse_acb,
        scenario.province,
        year,
        effectiveInflation,
        spouseAge
      );

      terminalTax = primaryTerminal.terminalTax + spouseTerminal.terminalTax;
      netEstateValue = primaryTerminal.netEstateValue + spouseTerminal.netEstateValue + balances.tfsa + balances.fhsa;
    }

    projections.push({
      year: year + 1,
      age,
      salary,
      primary_salary: primarySalary,
      cpp: totalCpp,
      oas: totalOas,
      db_pension: totalDbPension,
      inheritance,
      total_income: guaranteedIncome,
      tfsa_withdrawal: withdrawals.tfsa,
      rrsp_withdrawal: withdrawals.rrsp + withdrawals.rrsp_spouse,
      non_reg_withdrawal: nonRegWithdrawal,
      non_reg_withdrawal_primary: withdrawals.non_reg_primary,
      non_reg_withdrawal_spouse: withdrawals.non_reg_spouse,
      non_reg_capital_gain_inclusion: withdrawals.cap_gain_primary + withdrawals.cap_gain_spouse,
      non_reg_capital_gain_inclusion_primary: withdrawals.cap_gain_primary,
      non_reg_capital_gain_inclusion_spouse: withdrawals.cap_gain_spouse,
      total_withdrawals: withdrawals.total,
      provincial_tax: provincialTax,
      federal_tax: federalTax,
      cpp_ei_tax: cppEiOasTax,
      total_tax: totalTax,
      after_tax_income: afterTaxIncome,
      living_expenses: livingExpenses,
      one_time_expenses: oneTimeExpenses,
      healthcare_expenses: 0,
      total_expenses: totalExpensesNeeded,
      net_cash_flow: afterTaxIncome - totalExpensesNeeded,
      rrsp_contribution: contributions.rrsp + contributions.rrsp_spouse,
      tfsa_contribution: contributions.tfsa,
      fhsa_contribution: contributions.fhsa,
      non_reg_contribution: contributions.non_reg_primary + contributions.non_reg_spouse,
      non_reg_contribution_primary: contributions.non_reg_primary,
      non_reg_contribution_spouse: contributions.non_reg_spouse,
      non_reg_surplus: surplusToNonReg,
      rrsp_balance: balances.rrsp + balances.rrsp_spouse,
      tfsa_balance: balances.tfsa,
      fhsa_balance: balances.fhsa,
      non_reg_balance: balances.non_reg_primary + balances.non_reg_spouse,
      non_reg_balance_primary: balances.non_reg_primary,
      non_reg_balance_spouse: balances.non_reg_spouse,
      non_reg_acb: balances.non_reg_primary_acb + balances.non_reg_spouse_acb,
      non_reg_acb_primary: balances.non_reg_primary_acb,
      non_reg_acb_spouse: balances.non_reg_spouse_acb,
      total_balance: balances.rrsp + balances.rrsp_spouse + balances.tfsa + balances.fhsa + balances.non_reg_primary + balances.non_reg_spouse,
      terminal_tax: terminalTax,
      net_estate_value: netEstateValue,
      gis_benefit: gisAmount > 0 ? gisAmount : undefined,
      rrsp_market_return: rrspMarketReturn,
      tfsa_market_return: tfsaMarketReturn,
      fhsa_market_return: fhsaMarketReturn,
      non_reg_market_return: nonRegMarketReturn
    });
  }

  return projections;
}

export async function runMonteCarloSimulation(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  oneTimeEvents: OneTimeEvent[],
  onProgress?: (completed: number, total: number) => void,
  allocations?: AssetAllocation[],
  overrides?: ProjectionOverrides
): Promise<MonteCarloResult> {
  const effectiveRetirementAge = overrides?.retirementAge ?? scenario.retirement_age;
  const iterations = scenario.monte_carlo_iterations;
  const totalYears = (effectiveRetirementAge - scenario.current_age) + scenario.plan_duration;
  const geoFromScenario = (scenario.cad_equity_weight != null && scenario.us_equity_weight != null)
    ? { cadWeight: scenario.cad_equity_weight / 100, usWeight: scenario.us_equity_weight / 100 }
    : null;
  const { usWeight, cadWeight } = geoFromScenario ?? getPortfolioGeoWeights(allocations || []);

  const result = await runMonteCarloMemoryEfficient(
    iterations,
    () => {
      const returnSequence = generateReturnSequence(
        totalYears, scenario.expected_return, scenario.return_std_dev || 10, usWeight, cadWeight
      );
      const inflationSequence = generateStochasticInflationSequence(totalYears, scenario.inflation_rate);
      return runSingleProjection(
        scenario, incomeSources, savingsAccounts, expenseLadder, oneTimeEvents,
        returnSequence, undefined, undefined, allocations, inflationSequence, overrides
      );
    },
    onProgress
  );

  return {
    percentile_10: result.percentile10,
    percentile_50: result.percentile50,
    percentile_90: result.percentile90,
    success_rate: result.successRate,
    iterations: result.totalIterations
  };
}

export interface CppOasOptimizationRow {
  cpp_start_age: number;
  oas_start_age: number;
  total_withdrawals: number;
  total_taxes_paid: number;
  final_net_worth: number;
}

export function runCppOasOptimization(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  oneTimeEvents: OneTimeEvent[]
): CppOasOptimizationRow[] {
  const combinations = [
    { cpp: 60, oas: 65 }, { cpp: 61, oas: 65 }, { cpp: 62, oas: 65 },
    { cpp: 63, oas: 65 }, { cpp: 64, oas: 65 }, { cpp: 65, oas: 65 },
    { cpp: 66, oas: 66 }, { cpp: 67, oas: 67 }, { cpp: 68, oas: 68 },
    { cpp: 69, oas: 69 }, { cpp: 70, oas: 70 }
  ];

  return combinations.map(({ cpp, oas }) => {
    const projections = runSingleProjection(
      scenario, incomeSources, savingsAccounts, expenseLadder, oneTimeEvents,
      undefined, cpp, oas
    );
    return {
      cpp_start_age: cpp,
      oas_start_age: oas,
      total_withdrawals: projections.reduce((s, p) => s + p.total_withdrawals, 0),
      total_taxes_paid: projections.reduce((s, p) => s + p.total_tax, 0),
      final_net_worth: projections[projections.length - 1]?.total_balance || 0
    };
  });
}
