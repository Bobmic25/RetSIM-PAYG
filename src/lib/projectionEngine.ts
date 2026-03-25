import {
  Scenario,
  AssetAllocation,
  ReturnPeriod,
  HealthcareStep,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  OneTimeEvent,
  YearlyProjection,
  MonteCarloResult
} from '../types/retirement';
import {
  calculateTotalTax,
  getFirstBracketTop,
  getOASClawbackThreshold,
  calcTieredCapitalGainInclusion,
  calculateTerminalTax,
  getMarginalRate
} from './taxEngine';
import { calculateCPPBenefit, calculateOASBenefit, adjustForInflation, calculateGISBenefit, applyOAS75Bump, presentValue, type GISResult } from './benefitsEngine';
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

interface ContributionPlan extends AccountBalances {
  rrsp_salary_deduction_primary: number;
  rrsp_salary_deduction_spouse: number;
  salary_funded_after_tax_primary: number;
  salary_funded_after_tax_spouse: number;
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

function getHealthcareExpensesForAge(
  age: number,
  healthcareSteps: HealthcareStep[],
  yearFromStart: number,
  healthcareInflationRate: number
): number {
  return healthcareSteps
    .filter(step => !step.is_insured && age >= step.from_age && age <= step.to_age)
    .reduce((sum, step) => sum + adjustForInflation(step.annual_cost, yearFromStart, healthcareInflationRate), 0);
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
  primaryAge: number,
  spouseAge: number,
  accounts: SavingsAccount[],
  yearFromStart: number,
  inflationRate: number
): ContributionPlan {
  const balances: ContributionPlan = {
    rrsp: 0,
    rrsp_spouse: 0,
    tfsa: 0,
    fhsa: 0,
    non_reg_primary: 0,
    non_reg_primary_acb: 0,
    non_reg_spouse: 0,
    non_reg_spouse_acb: 0,
    rrsp_salary_deduction_primary: 0,
    rrsp_salary_deduction_spouse: 0,
    salary_funded_after_tax_primary: 0,
    salary_funded_after_tax_spouse: 0,
  };
  accounts.forEach(account => {
    const personAge = account.person === 'spouse' ? spouseAge : primaryAge;
    if (personAge <= account.contribution_end_age) {
      const annual = account.monthly_contribution * 12;
      const inflationLinked = account.inflation_linked !== false;
      const contribution = inflationLinked
        ? adjustForInflation(annual, yearFromStart, inflationRate)
        : annual;
      const deductFromSalary = account.deduct_from_salary !== false;
      if (account.account_type === 'rrsp') {
        if (account.person === 'spouse') {
          balances.rrsp_spouse += contribution;
          if (deductFromSalary) balances.rrsp_salary_deduction_spouse += contribution;
        } else {
          balances.rrsp += contribution;
          if (deductFromSalary) balances.rrsp_salary_deduction_primary += contribution;
        }
      } else if (account.account_type === 'non_reg') {
        if (account.person === 'spouse') {
          balances.non_reg_spouse += contribution;
          balances.non_reg_spouse_acb += contribution;
          if (deductFromSalary) balances.salary_funded_after_tax_spouse += contribution;
        } else {
          balances.non_reg_primary += contribution;
          balances.non_reg_primary_acb += contribution;
          if (deductFromSalary) balances.salary_funded_after_tax_primary += contribution;
        }
      } else {
        balances[account.account_type] += contribution;
        if (deductFromSalary) {
          if (account.person === 'spouse') {
            balances.salary_funded_after_tax_spouse += contribution;
          } else {
            balances.salary_funded_after_tax_primary += contribution;
          }
        }
      }
    }
  });
  return balances;
}

const FOREIGN_WITHHOLDING_DIVIDEND_YIELD = 0.02;
const FOREIGN_WITHHOLDING_RATE = 0.15;
const FOREIGN_WITHHOLDING_DRAG = FOREIGN_WITHHOLDING_DIVIDEND_YIELD * FOREIGN_WITHHOLDING_RATE;
const DEFAULT_MONTE_CARLO_EQUITY_WEIGHT = 0.6;

function getAccountForeignEquityWeight(accountType: string, allocations?: AssetAllocation[], person?: 'primary' | 'spouse'): number {
  if (!allocations || allocations.length === 0) return 0.6;
  const alloc = allocations.find(a => a.account_type === accountType && (person == null || (a.person ?? 'primary') === person))
    ?? allocations.find(a => a.account_type === accountType && a.person == null)
    ?? allocations.find(a => a.account_type === accountType);
  if (!alloc) return 0.6;
  const stocksFraction = alloc.stocks / 100;
  const usWeightFraction = (alloc.us_equity_weight ?? 60) / 100;
  const intWeightFraction = (alloc.int_equity_weight ?? 0) / 100;
  return stocksFraction * (usWeightFraction + intWeightFraction);
}

function applyReturns(balances: AccountBalances, returnRate: number, allocations?: AssetAllocation[]): void {
  const rrspFactor = 1 + returnRate / 100;
  balances.rrsp *= rrspFactor;
  balances.rrsp_spouse *= rrspFactor;
  balances.fhsa *= rrspFactor;

  const tfsaForeignWeight = getAccountForeignEquityWeight('tfsa', allocations);
  const tfsaDrag = tfsaForeignWeight * FOREIGN_WITHHOLDING_DRAG * 100;
  balances.tfsa *= (1 + (returnRate - tfsaDrag) / 100);

  const nonRegPrimaryForeignWeight = getAccountForeignEquityWeight('non_reg', allocations, 'primary');
  const nonRegPrimaryDrag = nonRegPrimaryForeignWeight * FOREIGN_WITHHOLDING_DRAG * 100;
  const nonRegPrimaryGrowthFactor = 1 + (returnRate - nonRegPrimaryDrag) / 100;
  balances.non_reg_primary *= nonRegPrimaryGrowthFactor;

  const nonRegSpouseForeignWeight = getAccountForeignEquityWeight('non_reg', allocations, 'spouse');
  const nonRegSpouseDrag = nonRegSpouseForeignWeight * FOREIGN_WITHHOLDING_DRAG * 100;
  const nonRegSpouseGrowthFactor = 1 + (returnRate - nonRegSpouseDrag) / 100;
  balances.non_reg_spouse *= nonRegSpouseGrowthFactor;
}

function normalizeGeoMix(cadWeight?: number, usWeight?: number, intWeight?: number): { cadWeight: number; usWeight: number; intWeight: number } {
  const cad = cadWeight ?? 60;
  const us = usWeight ?? 40;
  const intl = intWeight ?? Math.max(0, 100 - cad - us);
  const total = cad + us + intl;

  if (total <= 0) {
    return { cadWeight: 0.6, usWeight: 0.4, intWeight: 0 };
  }

  return {
    cadWeight: cad / total,
    usWeight: us / total,
    intWeight: intl / total,
  };
}

function getAllocationPortfolioWeight(alloc: AssetAllocation, savingsAccounts: SavingsAccount[]): number {
  const matchedAccounts = savingsAccounts.filter(account => {
    if (account.account_type !== alloc.account_type) return false;
    return (account.person ?? 'primary') === (alloc.person ?? 'primary');
  });

  if (matchedAccounts.length === 0) {
    return 1;
  }

  const totalBalance = matchedAccounts.reduce((sum, account) => sum + Math.max(0, account.current_balance || 0), 0);
  return totalBalance > 0 ? totalBalance : 1;
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
  fhsa: number;
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
  disableBracketFilling?: boolean,
  lifeExpectancy?: number,
  spouseLifeExpectancy?: number,
  currentRetirementAge?: number,
  expectedReturn?: number,
  planEndAge?: number,
  rrspExhaustYearsBeforeEnd?: number
): WithdrawalResult {
  let remaining = needed;
  const result: WithdrawalResult = {
    tfsa: 0,
    fhsa: 0,
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

  // RRSP MELTDOWN STRATEGY: Prioritize early RRSP withdrawal based on life expectancy
  const isMeltdownStrategy = withdrawalStrategy === 'rrsp_meltdown';
  const isMinimizeLifetimeTax = withdrawalStrategy === 'minimize_lifetime_tax';
  if (isMeltdownStrategy && isRetired && expectedReturn != null) {
    const targetExhaustAge =
      (planEndAge ?? (currentRetirementAge ?? age) + 30) - Math.max(1, rrspExhaustYearsBeforeEnd ?? 2);

    // Calculate smooth melt-down target that exhausts by configured target age.
    const meltdownTarget = computeRrspMeltdownSchedule(
      age,
      targetExhaustAge,
      totalRrsp,
      expectedReturn
    );

    // Meltdown strategy: follow a smooth annual RRSP target regardless of shortfall.
    // Any excess cash later flows to non-registered accounts as surplus.
    if (meltdownTarget > 0 && totalRrsp > 0) {
      const additionalTarget = Math.max(0, meltdownTarget - result.rrifMinimum);
      const rrspToWithdraw = Math.min(additionalTarget, balances.rrsp + balances.rrsp_spouse);

      if (isCouple && balances.rrsp_spouse > 0 && spouseIncome !== undefined) {
        // Distribute between primary and spouse with a stable ratio.
        const primaryProportion =
          lifeExpectancy && spouseLifeExpectancy && (lifeExpectancy + spouseLifeExpectancy) > 0
            ? lifeExpectancy / (lifeExpectancy + spouseLifeExpectancy)
            : balances.rrsp > 0 || balances.rrsp_spouse > 0
              ? balances.rrsp / Math.max(1, balances.rrsp + balances.rrsp_spouse)
              : 0.5;

        let fromPrimary = Math.min(rrspToWithdraw * primaryProportion, balances.rrsp);
        let fromSpouse = Math.min(rrspToWithdraw * (1 - primaryProportion), balances.rrsp_spouse);

        const drawn = fromPrimary + fromSpouse;
        const remainder = rrspToWithdraw - drawn;
        if (remainder > 0) {
          const extraPrimary = Math.min(remainder, Math.max(0, balances.rrsp - fromPrimary));
          fromPrimary += extraPrimary;
          const extraSpouse = Math.min(remainder - extraPrimary, Math.max(0, balances.rrsp_spouse - fromSpouse));
          fromSpouse += extraSpouse;
        }
        
        result.rrsp += fromPrimary;
        result.rrsp_spouse += fromSpouse;
        balances.rrsp -= fromPrimary;
        balances.rrsp_spouse -= fromSpouse;
        if (remaining > 0) {
          remaining -= Math.min(remaining, fromPrimary + fromSpouse);
        }
      } else if (balances.rrsp > 0) {
        const fromRRSP = Math.min(rrspToWithdraw, balances.rrsp);
        result.rrsp += fromRRSP;
        balances.rrsp -= fromRRSP;
        if (remaining > 0) {
          remaining -= Math.min(remaining, fromRRSP);
        }
      } else if (balances.rrsp_spouse > 0) {
        const fromSpouse = Math.min(rrspToWithdraw, balances.rrsp_spouse);
        result.rrsp_spouse += fromSpouse;
        balances.rrsp_spouse -= fromSpouse;
        if (remaining > 0) {
          remaining -= Math.min(remaining, fromSpouse);
        }
      }
    }
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

  // For non-meltdown strategies, allow additional RRSP withdrawal after checking GIS
  if (!isMeltdownStrategy && isRetired && !gisBlocksRRSP && remaining > 0 && (balances.rrsp > 0 || balances.rrsp_spouse > 0)) {
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
    result.fhsa += fromFHSA;
    balances.fhsa -= fromFHSA;
    remaining -= fromFHSA;
  }

  if (remaining > 0 && balances.tfsa > 0) {
    const fromTFSA = Math.min(remaining, balances.tfsa);
    result.tfsa = fromTFSA;
    balances.tfsa -= fromTFSA;
    remaining -= fromTFSA;
  }

  // For non-meltdown strategies, allow additional RRSP withdrawal if GIS was blocking
  if (!isMeltdownStrategy && isRetired && gisBlocksRRSP && remaining > 0 && (balances.rrsp > 0 || balances.rrsp_spouse > 0)) {
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

  // MINIMIZE LIFETIME TAX: Proactive RRSP draw to reduce future RRIF clawback pressure.
  // Draws RRSP up to OAS clawback threshold (or first bracket top, whichever is lower)
  // when forward RRIF analysis shows future clawback risk.
  if (isMinimizeLifetimeTax && isRetired && !gisBlocksRRSP && (balances.rrsp > 0 || balances.rrsp_spouse > 0)) {
    const alreadyWithdrawn = result.rrsp + result.rrsp_spouse;
    const currentTaxableWithRrsp = currentTaxableIncome + alreadyWithdrawn + result.cap_gain_primary;
    const oasRoom = Math.max(0, oasThreshold - currentTaxableWithRrsp);
    const bracketRoom = Math.max(0, firstBracketTop - currentTaxableWithRrsp);
    const maxRoom = Math.min(bracketRoom, oasRoom);

    if (maxRoom > 0) {
      const futureBalance = balances.rrsp + balances.rrsp_spouse;
      const fwdRRIF = computeForwardRRIFIncome(Math.max(age + 1, 72), futureBalance, expectedReturn ?? 5, 5);
      // Proactively draw if: future RRIF alone risks OAS clawback, or already past RRIF onset,
      // or pre-RRIF but RRSP large enough that smoothing early helps
      const futureRisk = fwdRRIF > 0 && (currentTaxableIncome + fwdRRIF > oasThreshold * 0.9);
      const postRrif = age >= 72;
      const largePreRrif = age >= 60 && futureBalance > 200000;

      if (futureRisk || postRrif || largePreRrif) {
        const targetDraw = Math.min(maxRoom, futureBalance);
        const additionalNeeded = Math.max(0, targetDraw - alreadyWithdrawn);

        if (additionalNeeded > 0) {
          if (isCouple && balances.rrsp_spouse > 0 && spouseIncome !== undefined) {
            const matched = bracketMatchRRSPWithdrawals(
              currentTaxableIncome + result.rrsp, spouseIncome,
              balances.rrsp, balances.rrsp_spouse, additionalNeeded,
              province, year, inflationRate
            );
            const fp = Math.min(matched.primaryRRSP, balances.rrsp);
            const fs = Math.min(matched.spouseRRSP, balances.rrsp_spouse);
            result.rrsp += fp;
            result.rrsp_spouse += fs;
            balances.rrsp -= fp;
            balances.rrsp_spouse -= fs;
          } else if (balances.rrsp > 0) {
            const fp = Math.min(additionalNeeded, balances.rrsp);
            result.rrsp += fp;
            balances.rrsp -= fp;
          } else if (balances.rrsp_spouse > 0) {
            const fs = Math.min(additionalNeeded, balances.rrsp_spouse);
            result.rrsp_spouse += fs;
            balances.rrsp_spouse -= fs;
          }
        }
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

  // RRSP exhaustion logic - apply based on strategy, excluding net_expenses_only.
  const shouldApplyExhaustion = !disableForcedWithdrawals &&
    (
      withdrawalStrategy === 'maximize_spending' ||
      withdrawalStrategy === 'tax_efficient' ||
      withdrawalStrategy === 'maximize_estate' ||
      withdrawalStrategy === undefined
    );

  // Apply the configured RRSP exhaustion target for all supported strategies.
  const currentRrspWithdrawn = result.rrsp + result.rrsp_spouse;
  if (isRetired && shouldApplyExhaustion && exhaustionFloor > currentRrspWithdrawn) {
    const additionalNeeded = Math.min(exhaustionFloor - currentRrspWithdrawn, rrspRemainingCap());
    const combinedRrsp = balances.rrsp + balances.rrsp_spouse;

    if (combinedRrsp > 0 && additionalNeeded > 0) {
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

  result.total = result.tfsa + result.fhsa + result.rrsp + result.rrsp_spouse + result.non_reg_primary + result.non_reg_spouse;
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

function getPortfolioGeoWeights(
  allocations: AssetAllocation[],
  savingsAccounts: SavingsAccount[]
): { usWeight: number; cadWeight: number; intWeight: number } {
  if (!allocations || allocations.length === 0) {
    return {
      usWeight: 0.4 * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
      cadWeight: 0.6 * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
      intWeight: 0,
    };
  }

  let totalPortfolioWeight = 0;
  let weightedUs = 0;
  let weightedCad = 0;
  let weightedInt = 0;

  for (const alloc of allocations) {
    const portfolioWeight = getAllocationPortfolioWeight(alloc, savingsAccounts);
    const stockWeight = Math.max(0, Math.min(100, alloc.stocks ?? 0)) / 100;
    const geo = normalizeGeoMix(alloc.cad_equity_weight, alloc.us_equity_weight, alloc.int_equity_weight);
    const effectiveStockExposure = portfolioWeight * stockWeight;

    totalPortfolioWeight += portfolioWeight;
    weightedCad += effectiveStockExposure * geo.cadWeight;
    weightedUs += effectiveStockExposure * geo.usWeight;
    weightedInt += effectiveStockExposure * geo.intWeight;
  }

  if (totalPortfolioWeight <= 0) {
    return {
      usWeight: 0.4 * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
      cadWeight: 0.6 * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
      intWeight: 0,
    };
  }

  return {
    usWeight: weightedUs / totalPortfolioWeight,
    cadWeight: weightedCad / totalPortfolioWeight,
    intWeight: weightedInt / totalPortfolioWeight,
  };
}

function getNetExpectedReturn(scenario: Scenario): number {
  return scenario.expected_return - (scenario.management_fee_pct ?? 0);
}

function getNetReturnFromGross(grossReturn: number, scenario: Scenario): number {
  return grossReturn - (scenario.management_fee_pct ?? 0);
}

function getAverageReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.reduce((sum, value) => sum + value, 0) / returns.length;
}

export function buildReturnSequenceFromPeriods(
  totalYears: number,
  periods: ReturnPeriod[],
  scenario: Scenario,
  startYear: number = new Date().getFullYear()
): number[] {
  if (totalYears <= 0 || periods.length === 0) {
    return [];
  }

  const sortedPeriods = [...periods].sort((left, right) => left.from_year - right.from_year);

  return Array.from({ length: totalYears }, (_, yearIndex) => {
    const calendarYear = startYear + yearIndex;
    const matchingPeriod = sortedPeriods.find(period => calendarYear >= period.from_year && calendarYear <= period.to_year);
    if (matchingPeriod) {
      return getNetReturnFromGross(matchingPeriod.return_rate, scenario);
    }

    const previousPeriod = [...sortedPeriods].reverse().find(period => calendarYear > period.to_year);
    if (previousPeriod) {
      return getNetReturnFromGross(previousPeriod.return_rate, scenario);
    }

    return getNetReturnFromGross(sortedPeriods[0].return_rate, scenario);
  });
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
  inflationRate: number,
  yearsBeforeEnd: number = 2
): number {
  const targetAge = planEndAge - Math.max(1, yearsBeforeEnd);
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

function computeRrspMeltdownSchedule(
  currentAge: number,
  targetExhaustAge: number,
  rrspBalance: number,
  expectedReturn: number
): number {
  // Smooth melt-down target: an annuity draw that exhausts RRSP by target age.
  if (rrspBalance <= 0) {
    return 0;
  }

  if (currentAge >= targetExhaustAge) {
    return rrspBalance;
  }

  const remainingYears = Math.max(1, targetExhaustAge - currentAge + 1);
  const r = expectedReturn / 100;

  let annuityTarget: number;
  if (Math.abs(r) < 1e-9) {
    annuityTarget = rrspBalance / remainingYears;
  } else {
    annuityTarget = rrspBalance * (r / (1 - Math.pow(1 + r, -remainingYears)));
  }

  return Math.max(0, annuityTarget);
}

function computeForwardRRIFIncome(
  fromAge: number,
  rrspBalance: number,
  expectedReturn: number,
  years: number
): number {
  if (rrspBalance <= 0) return 0;
  let balance = rrspBalance;
  let totalIncome = 0;
  const r = expectedReturn / 100;
  for (let i = 0; i < years; i++) {
    const currentAge = fromAge + i;
    if (currentAge < 72) continue;
    const rrifRate = RRIF_MINIMUM_RATES[Math.min(currentAge, 95)] ?? 0.2;
    const income = balance * rrifRate;
    totalIncome += income;
    balance = Math.max(0, (balance - income) * (1 + r));
    if (balance <= 0) break;
  }
  return years > 0 ? totalIncome / years : 0;
}

function getSpouseRetirementAge(scenario: Scenario): number {
  return scenario.spouse_retirement_age ?? scenario.retirement_age;
}

export function runSingleProjection(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  healthcareSteps: HealthcareStep[] = [],
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
  const spouseRetirementAge = getSpouseRetirementAge(scenario);
  const expenseMultiplier = overrides?.expenseMultiplier ?? 1.0;
  const disableForcedWithdrawals = overrides?.disableForcedWithdrawals ?? false;
  const disableBracketFilling = overrides?.disableBracketFilling ?? false;
  const additionalMonthlySavings = overrides?.additionalMonthlySavings ?? 0;
  const effectiveWithdrawalStrategy = overrides?.withdrawalStrategy ?? scenario.withdrawal_strategy;

  const totalYears = (effectiveRetirementAge - scenario.current_age) + scenario.plan_duration;
  const netExpectedReturn = getNetExpectedReturn(scenario);
  const derivedReturnSequence = (!returnSequence && scenario.return_type === 'linear' && (scenario.return_periods?.length ?? 0) > 0)
    ? buildReturnSequenceFromPeriods(totalYears, scenario.return_periods ?? [], scenario)
    : undefined;
  const effectiveReturnSequence = returnSequence ?? derivedReturnSequence;

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
  const rrspExhaustYearsBeforeEnd = Math.max(1, scenario.rrsp_exhaustion_years_before_end ?? 2);
  const retirementYearIndex = effectiveRetirementAge - scenario.current_age;

  const rrspAtRetirement = (() => {
    let bal = balances.rrsp + balances.rrsp_spouse;
    for (let y = 0; y < retirementYearIndex; y++) {
      const annualReturn = (effectiveReturnSequence?.[y] ?? netExpectedReturn) / 100;
      bal *= (1 + annualReturn);
      const age = scenario.current_age + y;
      const spouseAge = scenario.spouse_age != null ? scenario.spouse_age + y : age;
      const contribThisYear = savingsAccounts
        .filter(a => a.account_type === 'rrsp' && ((a.person === 'spouse' ? spouseAge : age) <= a.contribution_end_age))
        .reduce((s, a) => s + a.monthly_contribution * 12, 0);
      bal += contribThisYear;
    }
    return Math.max(0, bal);
  })();

  const retirementReturnAssumption = effectiveReturnSequence
    ? getAverageReturn(effectiveReturnSequence.slice(retirementYearIndex)) || netExpectedReturn
    : netExpectedReturn;

  const rrspExhaustionAnnualBase = (overrides?.disableRrspExhaustion)
    ? 0
    : computeRrspExhaustionTarget(
        rrspAtRetirement,
        effectiveRetirementAge,
        planEndAge,
        retirementReturnAssumption,
        scenario.inflation_rate,
        rrspExhaustYearsBeforeEnd
      );

  const initialTfsaBalance = balances.tfsa;
  let cumulativeTfsaContributed = initialTfsaBalance;

  for (let year = 0; year < totalYears; year++) {
    const age = scenario.current_age + year;
    const spouseAge = isCouple && scenario.spouse_age != null ? scenario.spouse_age + year : age;
    const effectiveInflation = inflationSequence ? inflationSequence[year] : scenario.inflation_rate;

    const primarySalary = getIncomeForAge(
      age, incomeSources.filter(s => s.person === 'primary'), year, effectiveInflation
    );
    const spouseSalary = isCouple
      ? getIncomeForAge(spouseAge, incomeSources.filter(s => s.person === 'spouse'), year, effectiveInflation)
      : 0;
    const salary = primarySalary + spouseSalary;

    const cpp = age >= cppStartAge ? adjustForInflation(cppAmount, year, effectiveInflation) : 0;
    const oasBase = age >= oasStartAge ? adjustForInflation(applyOAS75Bump(oasAmount, age), year, effectiveInflation) : 0;
    const oas = oasBase;
    const spouseCpp = (isCouple && spouseAge >= spouseCppStartAge) ? adjustForInflation(spouseCppAmount, year, effectiveInflation) : 0;
    const spouseOas = (isCouple && spouseAge >= spouseOasStartAge) ? adjustForInflation(applyOAS75Bump(spouseOasAmount, spouseAge), year, effectiveInflation) : 0;

    const totalCpp = cpp + spouseCpp;
    const totalOas = oas + spouseOas;

    const dbPensionStartAge = scenario.db_pension_start_age ?? scenario.retirement_age;
    const dbPensionBase = scenario.has_db_pension && scenario.db_pension_amount && age >= dbPensionStartAge
      ? (scenario.db_pension_indexed ? adjustForInflation(scenario.db_pension_amount, year, effectiveInflation) : scenario.db_pension_amount)
      : 0;

    const spouseDbPensionStartAge = scenario.spouse_db_pension_start_age ?? spouseRetirementAge;
    const spouseDbPensionBase = isCouple && scenario.spouse_has_db_pension && scenario.spouse_db_pension_amount && spouseAge >= spouseDbPensionStartAge
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
    const contributions = calculateContributions(age, spouseAge, savingsAccounts, year, effectiveInflation);
    const primaryRrspSalaryDeduction = contributions.rrsp_salary_deduction_primary;
    const spouseRrspSalaryDeduction = contributions.rrsp_salary_deduction_spouse;
    const totalRrspSalaryDeduction = primaryRrspSalaryDeduction + spouseRrspSalaryDeduction;
    const totalAfterTaxSalaryFundedContributions = contributions.salary_funded_after_tax_primary + contributions.salary_funded_after_tax_spouse;
    const totalSalaryFundedContributions = totalRrspSalaryDeduction + totalAfterTaxSalaryFundedContributions;
    const primaryTaxableSalary = Math.max(0, primarySalary - primaryRrspSalaryDeduction);
    const spouseTaxableSalary = Math.max(0, spouseSalary - spouseRrspSalaryDeduction);
    const taxableSalary = primaryTaxableSalary + spouseTaxableSalary;

    const preGisOtherIncome = taxableSalary + totalCpp + totalDbPension + rrifWithdrawalEstimate + nonRegGainEstimate;
    const gisResult = calculateGISBenefit(
      preGisOtherIncome, isCouple, age, oasReceiving, year, effectiveInflation
    );
    const gisAmount = gisResult.gisAmount;

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
    const healthcareExpenses = getHealthcareExpensesForAge(age, healthcareSteps, year, scenario.healthcare_inflation ?? effectiveInflation);
    const totalExpensesNeeded = livingExpenses + healthcareExpenses + oneTimeExpenses;
    const totalCashNeed = totalExpensesNeeded + totalSalaryFundedContributions;

    const guaranteedIncome = salary + totalCpp + totalOas + totalDbPension + gisAmount + inheritance;

    const baseTaxableIncome = primaryTaxableSalary + cpp + oas + dbPensionBase;

    const preWithdrawalRrsp = balances.rrsp + balances.rrsp_spouse;
    const preWithdrawalTfsa = balances.tfsa;
    const preWithdrawalFhsa = balances.fhsa;
    const preWithdrawalNonReg = balances.non_reg_primary + balances.non_reg_spouse;
    const preWithdrawalNonRegPrimary = balances.non_reg_primary;
    const preWithdrawalNonRegSpouse = balances.non_reg_spouse;

    const isRetired = age >= effectiveRetirementAge;
    const calculateTaxTotals = (candidateWithdrawals: WithdrawalResult) => {
      const candidatePrimaryTaxableIncome =
        primaryTaxableSalary + cpp + oas + dbPensionBase + candidateWithdrawals.rrsp + candidateWithdrawals.cap_gain_primary;
      const candidateSpouseTaxableIncome =
        spouseTaxableSalary + spouseCpp + spouseOas + spouseDbPensionBase + candidateWithdrawals.rrsp_spouse + candidateWithdrawals.cap_gain_spouse;
      const candidatePensionIncomeForCredit = cpp + candidateWithdrawals.rrsp + dbPensionBase;

      if (isCouple && age >= 65) {
        const primaryCalc = calculateTotalTax(
          candidatePrimaryTaxableIncome,
          scenario.province,
          primarySalary,
          oas,
          year,
          effectiveInflation,
          undefined,
          age,
          candidatePensionIncomeForCredit
        );
        const spousePensionForCredit = spouseCpp + candidateWithdrawals.rrsp_spouse + spouseDbPensionBase;
        const spouseCalc = calculateTotalTax(
          candidateSpouseTaxableIncome,
          scenario.province,
          spouseSalary,
          spouseOas,
          year,
          effectiveInflation,
          undefined,
          spouseAge,
          spousePensionForCredit
        );

        return {
          federalTax: primaryCalc.federal + spouseCalc.federal,
          provincialTax: primaryCalc.provincial + spouseCalc.provincial,
          cppEiOasTax:
            primaryCalc.cpp + primaryCalc.ei + primaryCalc.oasClawback +
            spouseCalc.cpp + spouseCalc.ei + spouseCalc.oasClawback,
          totalTax: primaryCalc.federal + spouseCalc.federal + primaryCalc.provincial + spouseCalc.provincial +
            primaryCalc.cpp + primaryCalc.ei + primaryCalc.oasClawback + spouseCalc.cpp + spouseCalc.ei + spouseCalc.oasClawback,
        };
      }

      const primaryCalc = calculateTotalTax(
        candidatePrimaryTaxableIncome,
        scenario.province,
        primarySalary,
        oas,
        year,
        effectiveInflation,
        undefined,
        age,
        candidatePensionIncomeForCredit
      );

      let federalTax = primaryCalc.federal;
      let provincialTax = primaryCalc.provincial;
      let cppEiOasTax = primaryCalc.cpp + primaryCalc.ei + primaryCalc.oasClawback;
      let totalTax = primaryCalc.total;

      if (isCouple) {
        const spousePensionForCredit = spouseCpp + spouseDbPensionBase;
        const spouseCalc = calculateTotalTax(
          candidateSpouseTaxableIncome,
          scenario.province,
          spouseSalary,
          spouseOas,
          year,
          effectiveInflation,
          undefined,
          spouseAge,
          spousePensionForCredit
        );
        federalTax += spouseCalc.federal;
        provincialTax += spouseCalc.provincial;
        cppEiOasTax += spouseCalc.cpp + spouseCalc.ei + spouseCalc.oasClawback;
        totalTax += spouseCalc.total;
      }

      return { federalTax, provincialTax, cppEiOasTax, totalTax };
    };

    const balancesBeforeWithdrawals: AccountBalances = { ...balances };
    let requestedWithdrawalNeed = Math.max(0, totalCashNeed - guaranteedIncome);
    let previousGap = Number.POSITIVE_INFINITY;
    let withdrawals: WithdrawalResult = {
      tfsa: 0,
      fhsa: 0,
      rrsp: 0,
      rrsp_spouse: 0,
      non_reg_primary: 0,
      non_reg_spouse: 0,
      rrifMinimum: 0,
      bracketTop: 0,
      total: 0,
      cap_gain_primary: 0,
      cap_gain_spouse: 0,
    };

    for (let attempt = 0; attempt < 8; attempt++) {
      const trialBalances: AccountBalances = { ...balancesBeforeWithdrawals };
      const trialWithdrawals = calculateOptimizedWithdrawals(
        trialBalances,
        requestedWithdrawalNeed,
        age,
        baseTaxableIncome,
        scenario.province,
        year,
        effectiveInflation,
        oas,
        isCouple,
        spouseTaxableSalary + spouseCpp + spouseOas + spouseDbPensionBase,
        gisResult,
        rrspExhaustionAnnualBase,
        isRetired,
        retirementYearIndex,
        effectiveWithdrawalStrategy,
        disableForcedWithdrawals,
        disableBracketFilling,
        scenario.life_expectancy,
        scenario.spouse_life_expectancy,
        scenario.retirement_age,
        retirementReturnAssumption,
        planEndAge,
        rrspExhaustYearsBeforeEnd
      );
      const trialTaxes = calculateTaxTotals(trialWithdrawals);
      const trialNonRegWithdrawal = trialWithdrawals.non_reg_primary + trialWithdrawals.non_reg_spouse;
      const trialAfterTaxIncomeBeforeSalaryFunding =
        guaranteedIncome +
        trialWithdrawals.rrsp +
        trialWithdrawals.rrsp_spouse +
        trialNonRegWithdrawal -
        trialTaxes.totalTax +
        trialWithdrawals.tfsa +
        trialWithdrawals.fhsa;
      const remainingGap = Math.max(0, totalCashNeed - trialAfterTaxIncomeBeforeSalaryFunding);

      withdrawals = trialWithdrawals;
      Object.assign(balances, trialBalances);

      if (remainingGap <= 1) {
        break;
      }

      if (remainingGap >= previousGap - 1) {
        break;
      }

      previousGap = remainingGap;
      requestedWithdrawalNeed += remainingGap;
    }

    const yearAllocations = allocations
      ? getGlidePathAllocations(allocations, age, scenario.current_age, scenario)
      : allocations;

    const returnRate = effectiveReturnSequence ? effectiveReturnSequence[year] : netExpectedReturn;
    applyReturns(balances, returnRate, yearAllocations);

    const rrspMarketReturn = preWithdrawalRrsp * (returnRate / 100);
    const tfsaForeignWeight = getAccountForeignEquityWeight('tfsa', yearAllocations);
    const tfsaDrag = tfsaForeignWeight * FOREIGN_WITHHOLDING_DRAG * 100;
    const tfsaMarketReturn = preWithdrawalTfsa * ((returnRate - tfsaDrag) / 100);
    const fhsaMarketReturn = preWithdrawalFhsa * (returnRate / 100);
    const nonRegPrimaryForeignWeight = getAccountForeignEquityWeight('non_reg', yearAllocations, 'primary');
    const nonRegPrimaryDrag = nonRegPrimaryForeignWeight * FOREIGN_WITHHOLDING_DRAG * 100;
    const nonRegMarketReturnPrimary = preWithdrawalNonRegPrimary * ((returnRate - nonRegPrimaryDrag) / 100);
    const nonRegSpouseForeignWeight = getAccountForeignEquityWeight('non_reg', yearAllocations, 'spouse');
    const nonRegSpouseDrag = nonRegSpouseForeignWeight * FOREIGN_WITHHOLDING_DRAG * 100;
    const nonRegMarketReturnSpouse = preWithdrawalNonRegSpouse * ((returnRate - nonRegSpouseDrag) / 100);
    const nonRegMarketReturn = nonRegMarketReturnPrimary + nonRegMarketReturnSpouse;

    const pensionIncomeForCredit = cpp + withdrawals.rrsp + dbPensionBase;
  const primaryTaxableIncome = primaryTaxableSalary + cpp + oas + dbPensionBase + withdrawals.rrsp + withdrawals.cap_gain_primary;
  const spouseTaxableIncomeBase = spouseTaxableSalary + spouseCpp + spouseOas + spouseDbPensionBase + withdrawals.rrsp_spouse + withdrawals.cap_gain_spouse;

    let federalTax: number;
    let provincialTax: number;
    let cppEiOasTax: number;
    let totalTax: number;

    if (isCouple && age >= 65) {
      const primaryCalc = calculateTotalTax(
        primaryTaxableIncome,
        scenario.province,
        primarySalary,
        oas,
        year,
        effectiveInflation,
        undefined,
        age,
        pensionIncomeForCredit
      );
      const spousePensionForCredit = spouseCpp + withdrawals.rrsp_spouse + spouseDbPensionBase;
      const spouseCalc = calculateTotalTax(
        spouseTaxableIncomeBase,
        scenario.province,
        spouseSalary,
        spouseOas,
        year,
        effectiveInflation,
        undefined,
        spouseAge,
        spousePensionForCredit
      );

      federalTax = primaryCalc.federal + spouseCalc.federal;
      provincialTax = primaryCalc.provincial + spouseCalc.provincial;
      cppEiOasTax =
        primaryCalc.cpp + primaryCalc.ei + primaryCalc.oasClawback +
        spouseCalc.cpp + spouseCalc.ei + spouseCalc.oasClawback;
      totalTax = federalTax + provincialTax + cppEiOasTax;
    } else {
      const primaryCalc = calculateTotalTax(primaryTaxableIncome, scenario.province, primarySalary, oas, year, effectiveInflation, undefined, age, pensionIncomeForCredit);
      federalTax = primaryCalc.federal;
      provincialTax = primaryCalc.provincial;
      cppEiOasTax = primaryCalc.cpp + primaryCalc.ei + primaryCalc.oasClawback;
      totalTax = primaryCalc.total;

      if (isCouple) {
        const spouseTaxable = spouseTaxableIncomeBase;
        const spousePensionForCredit = spouseCpp + spouseDbPensionBase;
        const spouseCalc = calculateTotalTax(spouseTaxable, scenario.province, spouseSalary, spouseOas, year, effectiveInflation, undefined, spouseAge, spousePensionForCredit);
        federalTax += spouseCalc.federal;
        provincialTax += spouseCalc.provincial;
        cppEiOasTax += spouseCalc.cpp + spouseCalc.ei + spouseCalc.oasClawback;
        totalTax += spouseCalc.total;
      }
    }

    const nonRegWithdrawal = withdrawals.non_reg_primary + withdrawals.non_reg_spouse;
    const afterTaxIncomeBeforeSalaryFunding = guaranteedIncome + withdrawals.rrsp + withdrawals.rrsp_spouse + nonRegWithdrawal - totalTax + withdrawals.tfsa + withdrawals.fhsa;
    const afterTaxIncome = afterTaxIncomeBeforeSalaryFunding - totalSalaryFundedContributions;
    const expenseShortfall = Math.max(0, totalExpensesNeeded - afterTaxIncome);

    const isNetExpensesOnly = effectiveWithdrawalStrategy === 'net_expenses_only';
    let surplus = afterTaxIncome - totalExpensesNeeded;
    let surplusToNonReg = 0;

    if (isNetExpensesOnly) {
      surplus = afterTaxIncome - totalExpensesNeeded;
      surplusToNonReg = surplus > 0 ? surplus : 0;
    } else {
      surplusToNonReg = surplus > 0 ? surplus : 0;
    }

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
      fhsa_withdrawal: withdrawals.fhsa,
      rrsp_withdrawal: withdrawals.rrsp + withdrawals.rrsp_spouse,
      rrsp_withdrawal_primary: withdrawals.rrsp,
      rrsp_withdrawal_spouse: withdrawals.rrsp_spouse,
      non_reg_withdrawal: nonRegWithdrawal,
      non_reg_withdrawal_primary: withdrawals.non_reg_primary,
      non_reg_withdrawal_spouse: withdrawals.non_reg_spouse,
      non_reg_capital_gain_inclusion: withdrawals.cap_gain_primary + withdrawals.cap_gain_spouse,
      non_reg_capital_gain_inclusion_primary: withdrawals.cap_gain_primary,
      non_reg_capital_gain_inclusion_spouse: withdrawals.cap_gain_spouse,
      rrsp_salary_deduction: totalRrspSalaryDeduction,
      rrsp_salary_deduction_primary: primaryRrspSalaryDeduction,
      rrsp_salary_deduction_spouse: spouseRrspSalaryDeduction,
      salary_deducted_contributions: totalSalaryFundedContributions,
      salary_deducted_after_tax_contributions: totalAfterTaxSalaryFundedContributions,
      total_withdrawals: withdrawals.total,
      provincial_tax: provincialTax,
      federal_tax: federalTax,
      cpp_ei_tax: cppEiOasTax,
      total_tax: totalTax,
      after_tax_income: afterTaxIncome,
      living_expenses: livingExpenses,
      one_time_expenses: oneTimeExpenses,
      healthcare_expenses: healthcareExpenses,
      total_expenses: totalExpensesNeeded,
      net_cash_flow: afterTaxIncome - totalExpensesNeeded,
      expense_shortfall: expenseShortfall,
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
      non_reg_market_return: nonRegMarketReturn,
      non_reg_market_return_primary: nonRegMarketReturnPrimary,
      non_reg_market_return_spouse: nonRegMarketReturnSpouse
    });
  }

  return projections;
}

export async function runMonteCarloSimulation(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  healthcareSteps: HealthcareStep[] = [],
  oneTimeEvents: OneTimeEvent[],
  onProgress?: (completed: number, total: number) => void,
  allocations?: AssetAllocation[],
  overrides?: ProjectionOverrides
): Promise<MonteCarloResult> {
  const effectiveRetirementAge = overrides?.retirementAge ?? scenario.retirement_age;
  const iterations = scenario.monte_carlo_iterations;
  const totalYears = (effectiveRetirementAge - scenario.current_age) + scenario.plan_duration;
  const netExpectedReturn = getNetExpectedReturn(scenario);
  const hasCustomAllocations = Boolean(allocations && allocations.length > 0);
  const geoFromScenario = (!hasCustomAllocations && scenario.cad_equity_weight != null && scenario.us_equity_weight != null)
    ? (() => {
        const normalized = normalizeGeoMix(
          scenario.cad_equity_weight,
          scenario.us_equity_weight,
          scenario.int_equity_weight
        );
        return {
          cadWeight: normalized.cadWeight * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
          usWeight: normalized.usWeight * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
          intWeight: normalized.intWeight * DEFAULT_MONTE_CARLO_EQUITY_WEIGHT,
        };
      })()
    : null;
  const { usWeight, cadWeight, intWeight } = geoFromScenario ?? getPortfolioGeoWeights(allocations || [], savingsAccounts);

  const result = await runMonteCarloMemoryEfficient(
    iterations,
    () => {
      const returnSequence = generateReturnSequence(
        totalYears, netExpectedReturn, scenario.return_std_dev || 10, usWeight, cadWeight, intWeight
      );
      const inflationSequence = generateStochasticInflationSequence(totalYears, scenario.inflation_rate);
      return runSingleProjection(
        scenario, incomeSources, savingsAccounts, expenseLadder, healthcareSteps, oneTimeEvents,
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
  retirement_withdrawals: number;
  retirement_taxes_paid: number;
  recommendation_score: number;
  total_withdrawals: number;
  total_taxes_paid: number;
  final_net_worth: number;
}

export interface CppOasOptimizationResult {
  isCouple: boolean;
  phase1Person: 'primary' | 'spouse';
  phase1Label: string;
  phase1Rows: CppOasOptimizationRow[];
  phase2Person?: 'primary' | 'spouse';
  phase2Label?: string;
  phase2Rows?: CppOasOptimizationRow[];
}

interface CppOasOptimizationOptions {
  showTodayDollars?: boolean;
  inflationRate?: number;
}

function scoreOptimizationRows(rows: Omit<CppOasOptimizationRow, 'recommendation_score'>[]): CppOasOptimizationRow[] {
  const minWithdrawals = Math.min(...rows.map(r => r.retirement_withdrawals));
  const maxWithdrawals = Math.max(...rows.map(r => r.retirement_withdrawals));
  const minTaxes = Math.min(...rows.map(r => r.retirement_taxes_paid));
  const maxTaxes = Math.max(...rows.map(r => r.retirement_taxes_paid));
  const withdrawalRange = maxWithdrawals - minWithdrawals;
  const taxRange = maxTaxes - minTaxes;

  return rows
    .map(row => {
      const withdrawalScore = withdrawalRange > 0 ? (row.retirement_withdrawals - minWithdrawals) / withdrawalRange : 1;
      const taxScore = taxRange > 0 ? (maxTaxes - row.retirement_taxes_paid) / taxRange : 1;
      return { ...row, recommendation_score: withdrawalScore * 0.6 + taxScore * 0.4 };
    })
    .sort((a, b) => b.recommendation_score - a.recommendation_score);
}

export function runCppOasOptimization(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  healthcareSteps: HealthcareStep[] = [],
  oneTimeEvents: OneTimeEvent[],
  options: CppOasOptimizationOptions = {}
): CppOasOptimizationResult {
  const showTodayDollars = options.showTodayDollars ?? false;
  const inflationRate = options.inflationRate ?? scenario.inflation_rate;
  const isCouple = scenario.profile_type === 'couple';

  const combinations: Array<{ cpp: number; oas: number }> = [];
  for (let cpp = 60; cpp <= 70; cpp += 1) {
    for (let oas = 65; oas <= 70; oas += 1) {
      combinations.push({ cpp, oas });
    }
  }

  const pv = (amount: number, yearIndex: number) =>
    showTodayDollars ? presentValue(amount, yearIndex, inflationRate) : amount;

  const runCombinations = (getScenario: (cpp: number, oas: number) => Scenario): CppOasOptimizationRow[] => {
    const rows = combinations.map(({ cpp, oas }) => {
      const comboScenario = getScenario(cpp, oas);
      const projections = runSingleProjection(
        comboScenario, incomeSources, savingsAccounts, expenseLadder, healthcareSteps, oneTimeEvents
      );
      const lastSalaryAge = projections.reduce((m, p) => p.salary > 0 ? Math.max(m, p.age) : m, -1);
      const retirementStartAge = lastSalaryAge >= 0 ? lastSalaryAge + 1 : scenario.retirement_age;
      const retProjns = projections.filter(p => p.age >= retirementStartAge);
      const retirementWithdrawals = retProjns.reduce((s, p) => s + pv(p.total_withdrawals, p.year - 1), 0);
      const retirementTaxesPaid = retProjns.reduce((s, p) => s + pv(p.total_tax, p.year - 1), 0);
      return {
        cpp_start_age: cpp,
        oas_start_age: oas,
        retirement_withdrawals: retirementWithdrawals,
        retirement_taxes_paid: retirementTaxesPaid,
        recommendation_score: 0,
        total_withdrawals: retirementWithdrawals,
        total_taxes_paid: retirementTaxesPaid,
        final_net_worth: pv(projections[projections.length - 1]?.total_balance || 0, projections.length - 1)
      };
    });
    return scoreOptimizationRows(rows);
  };

  if (!isCouple) {
    const phase1Rows = runCombinations((cpp, oas) => ({ ...scenario, cpp_start_age: cpp, oas_start_age: oas }));
    return { isCouple: false, phase1Person: 'primary', phase1Label: 'Primary', phase1Rows };
  }

  // Couple: determine who retires first (by years from today to retirement)
  const primaryYearsToRet = scenario.retirement_age - scenario.current_age;
  const spouseYearsToRet = (scenario.spouse_retirement_age ?? scenario.retirement_age) - (scenario.spouse_age ?? scenario.current_age);
  const primaryFirst = primaryYearsToRet <= spouseYearsToRet;

  if (primaryFirst) {
    // Phase 1: optimize primary CPP/OAS
    const phase1Rows = runCombinations((cpp, oas) => ({ ...scenario, cpp_start_age: cpp, oas_start_age: oas }));
    const best = phase1Rows[0];
    // Phase 2: fix primary at best, optimize spouse CPP/OAS
    const bestPrimaryBase = { ...scenario, cpp_start_age: best.cpp_start_age, oas_start_age: best.oas_start_age };
    const phase2Rows = runCombinations((cpp, oas) => ({
      ...bestPrimaryBase, spouse_cpp_start_age: cpp, spouse_oas_start_age: oas
    }));
    return {
      isCouple: true,
      phase1Person: 'primary', phase1Label: 'Primary',
      phase1Rows,
      phase2Person: 'spouse', phase2Label: 'Spouse',
      phase2Rows
    };
  } else {
    // Phase 1: optimize spouse CPP/OAS
    const phase1Rows = runCombinations((cpp, oas) => ({ ...scenario, spouse_cpp_start_age: cpp, spouse_oas_start_age: oas }));
    const best = phase1Rows[0];
    // Phase 2: fix spouse at best, optimize primary CPP/OAS
    const bestSpouseBase = { ...scenario, spouse_cpp_start_age: best.cpp_start_age, spouse_oas_start_age: best.oas_start_age };
    const phase2Rows = runCombinations((cpp, oas) => ({
      ...bestSpouseBase, cpp_start_age: cpp, oas_start_age: oas
    }));
    return {
      isCouple: true,
      phase1Person: 'spouse', phase1Label: 'Spouse',
      phase1Rows,
      phase2Person: 'primary', phase2Label: 'Primary',
      phase2Rows
    };
  }
}
