import type {
  AssetAllocation,
  ExpenseLadder,
  HealthcareStep,
  IncomeSource,
  MonteCarloResult,
  OneTimeEvent,
  Scenario,
  YearlyProjection,
  SavingsAccount,
} from '../types/retirement';
import { runMonteCarloSimulation, MonteCarloPathSet } from './projectionEngine';

const TARGET_SUCCESS_RATE = 90;
const RECOMMENDATION_THRESHOLD = 85;
const SEARCH_ITERATION_FLOOR = 40;
const SEARCH_ITERATION_CAP = 90;
const TRAVEL_OTHER_STEP_PERCENT = 5;
const LIVING_STEP_PERCENT = 3;
const MAX_EVENT_DEFERRAL_CANDIDATES = 2;

export interface SuccessOptimizationDelta {
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  refreshTrigger: true;
}

export interface SuccessOptimizationAdjustment {
  kind: 'travel' | 'other' | 'living' | 'event_deferral';
  label: string;
  annualAmount?: number;
  percent?: number;
  eventName?: string;
  originalAge?: number;
  deferredByYears?: number;
}

export interface RetirementSuccessOptimizationResult {
  headline: string;
  body: string;
  buttonLabel: string;
  triggerReason: 'low_success_rate' | 'median_shortfall' | 'both';
  baselineSuccessRate: number;
  optimizedSuccessRate: number;
  baselineMedianRunOutAge: number | null;
  optimizedMedianRunOutAge: number | null;
  targetSuccessRate: number;
  targetAchieved: boolean;
  worstCasePassesToLifeExpectancy: boolean;
  delta: SuccessOptimizationDelta;
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  adjustments: SuccessOptimizationAdjustment[];
}

interface OptimizationInputs {
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  healthcareSteps: HealthcareStep[];
  oneTimeEvents: OneTimeEvent[];
  assetAllocations: AssetAllocation[];
  baselineMonteCarloResult: MonteCarloResult & { pathSet?: MonteCarloPathSet };
}

interface CandidateState {
  expenseLadder: ExpenseLadder[];
  oneTimeEvents: OneTimeEvent[];
  adjustments: SuccessOptimizationAdjustment[];
}

interface EvaluatedCandidate extends CandidateState {
  successRate: number;
  medianRunOutAge: number | null;
  worstCasePassesToLifeExpectancy: boolean;
  worstCaseFinalBalance: number;
  burdenScore: number;
}

export function getLifeExpectancyTargetAge(scenario: Scenario): number {
  return scenario.life_expectancy ?? (scenario.retirement_age + scenario.plan_duration);
}

export function getMedianRunOutAge(projections: YearlyProjection[], targetAge?: number): number | null {
  for (const year of projections) {
    if (year.total_balance <= -0.01 || (year.expense_shortfall ?? 0) > 0.01) {
      return year.age;
    }
  }

  const lastAge = projections[projections.length - 1]?.age;
  if (targetAge != null && lastAge != null && lastAge < targetAge) {
    return lastAge;
  }

  return null;
}

export function shouldRecommendSuccessOptimization(
  scenario: Scenario,
  monteCarloResult: MonteCarloResult | undefined
): { shouldRecommend: boolean; triggerReason: RetirementSuccessOptimizationResult['triggerReason']; medianRunOutAge: number | null } {
  if (!monteCarloResult) {
    return { shouldRecommend: false, triggerReason: 'low_success_rate', medianRunOutAge: null };
  }

  const targetAge = getLifeExpectancyTargetAge(scenario);
  const medianRunOutAge = getMedianRunOutAge(monteCarloResult.percentile_50, targetAge);
  const lowSuccessRate = monteCarloResult.success_rate < RECOMMENDATION_THRESHOLD;
  const medianFallsShort = medianRunOutAge != null && medianRunOutAge < targetAge;

  return {
    shouldRecommend: lowSuccessRate || medianFallsShort,
    triggerReason: lowSuccessRate && medianFallsShort ? 'both' : lowSuccessRate ? 'low_success_rate' : 'median_shortfall',
    medianRunOutAge,
  };


export function applyExpenseReductionFromAge(
  expenseLadder: ExpenseLadder[],
  fromAge: number,
  field: 'living_expenses' | 'travel_expenses' | 'other_expenses',
  reductionPercent: number
): ExpenseLadder[] {
  const multiplier = Math.max(0, 1 - reductionPercent / 100);
  const next: ExpenseLadder[] = [];

  for (const row of expenseLadder) {
    if (row.end_age < fromAge) {
      next.push({ ...row });
      continue;
    }

    if (row.start_age >= fromAge) {
      next.push({
        ...row,
        [field]: Math.max(0, roundCurrency(row[field] * multiplier)),
      });
      continue;
    }

    next.push({
      ...row,
      end_age: fromAge - 1,
    });
    next.push({
      ...row,
      start_age: fromAge,
      [field]: Math.max(0, roundCurrency(row[field] * multiplier)),
    });
  }

  return mergeAdjacentExpenseRows(next);
}

export function deferExpenseEvent(events: OneTimeEvent[], eventIndex: number, years: number): OneTimeEvent[] {
  return events.map((event, index) => {
    if (index !== eventIndex || event.event_type !== 'expense') {
      return { ...event };
    }

    return {
      ...event,
      age: event.age + years,
    };
  });
}

export function getDownturnEventIndices(result: MonteCarloResult, oneTimeEvents: OneTimeEvent[]): number[] {
  const downturnAges = new Set<number>();

  result.percentile_10.forEach((year, index, allYears) => {
    const previousBalance = index > 0 ? allYears[index - 1].total_balance : year.total_balance;
    if ((year.portfolio_return ?? 0) < 0 || year.total_balance < previousBalance) {
      downturnAges.add(year.age);
    }
  });

  return oneTimeEvents
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.event_type === 'expense' && downturnAges.has(event.age))
    .map(({ index }) => index);
}
  const recommendation = shouldRecommendSuccessOptimization(scenario, baselineMonteCarloResult);
  if (!recommendation.shouldRecommend) {
    return null;
  }

  const targetAge = getLifeExpectancyTargetAge(scenario);
  const searchIterations = Math.max(
    SEARCH_ITERATION_FLOOR,
    Math.min(SEARCH_ITERATION_CAP, Math.round((scenario.monte_carlo_iterations || 0) * 0.15))
  );

  const baselineCandidate: EvaluatedCandidate = {
    expenseLadder: cloneExpenseLadder(expenseLadder),
    oneTimeEvents: cloneOneTimeEvents(oneTimeEvents),
    adjustments: [],
    successRate: baselineMonteCarloResult.success_rate,
    medianRunOutAge: recommendation.medianRunOutAge,
    worstCasePassesToLifeExpectancy: passesWorstCaseToAge(baselineMonteCarloResult.percentile_10, targetAge),
    worstCaseFinalBalance: baselineMonteCarloResult.percentile_10[baselineMonteCarloResult.percentile_10.length - 1]?.total_balance ?? 0,
    burdenScore: 0,
  };

  let bestCandidate = baselineCandidate;
  // Use the baseline MC pathSet for all candidate evaluations if present
  const pathSet = baselineMonteCarloResult.pathSet;

  bestCandidate = await searchExpenseReductionStage({
    scenario,
    incomeSources,
    savingsAccounts,
    healthcareSteps,
    assetAllocations,
    targetAge,
    baselineExpenseLadder: expenseLadder,
    currentCandidate: bestCandidate,
    oneTimeEvents,
    field: 'travel_expenses',
    kind: 'travel',
    label: 'Reduce travel spending',
    maxPercent: 100,
    stepPercent: TRAVEL_OTHER_STEP_PERCENT,
    searchIterations,
    pathSet,
  });

  bestCandidate = await searchExpenseReductionStage({
    scenario,
    incomeSources,
    savingsAccounts,
    healthcareSteps,
    assetAllocations,
    targetAge,
    baselineExpenseLadder: bestCandidate.expenseLadder,
    currentCandidate: bestCandidate,
    oneTimeEvents: bestCandidate.oneTimeEvents,
    field: 'other_expenses',
    kind: 'other',
    label: 'Reduce other discretionary spending',
    maxPercent: 100,
    stepPercent: TRAVEL_OTHER_STEP_PERCENT,
    searchIterations,
    pathSet,
  });

  bestCandidate = await searchExpenseReductionStage({
    scenario,
    incomeSources,
    savingsAccounts,
    healthcareSteps,
    assetAllocations,
    targetAge,
    baselineExpenseLadder: bestCandidate.expenseLadder,
    currentCandidate: bestCandidate,
    oneTimeEvents: bestCandidate.oneTimeEvents,
    field: 'living_expenses',
    kind: 'living',
    label: 'Reduce living expenses',
    maxPercent: 15,
    stepPercent: LIVING_STEP_PERCENT,
    searchIterations,
    pathSet,
  });

  bestCandidate = await searchEventDeferrals({
    scenario,
    incomeSources,
    savingsAccounts,
    healthcareSteps,
    assetAllocations,
    targetAge,
    baselineMonteCarloResult,
    currentCandidate: bestCandidate,
    searchIterations,
    pathSet,
  });

  const validatedCandidate = await evaluateCandidate(
    scenario,
    incomeSources,
    savingsAccounts,
    bestCandidate.expenseLadder,
    healthcareSteps,
    bestCandidate.oneTimeEvents,
    assetAllocations,
    targetAge,
    bestCandidate.adjustments,
    scenario.monte_carlo_iterations,
    pathSet
  );

  const baselineSuccessRate = baselineMonteCarloResult.success_rate;
  const optimizedSuccessRate = validatedCandidate.successRate;
  const delta: SuccessOptimizationDelta = {
    expenseLadder: validatedCandidate.expenseLadder,
    oneTimeEvents: validatedCandidate.oneTimeEvents,
    refreshTrigger: true,
  };

  return {
    headline: 'Optimization Available: Secure Your Plan.',
    body: buildRecommendationBody(
      baselineSuccessRate,
      optimizedSuccessRate,
      validatedCandidate.adjustments,
      baselineMonteCarloResult,
      targetAge,
      isTargetAchieved(validatedCandidate)
    ),
    buttonLabel: 'Apply Optimization',
    triggerReason: recommendation.triggerReason,
    baselineSuccessRate,
    optimizedSuccessRate,
    baselineMedianRunOutAge: recommendation.medianRunOutAge,
    optimizedMedianRunOutAge: validatedCandidate.medianRunOutAge,
    targetSuccessRate: TARGET_SUCCESS_RATE,
    targetAchieved: isTargetAchieved(validatedCandidate),
    worstCasePassesToLifeExpectancy: validatedCandidate.worstCasePassesToLifeExpectancy,
    delta,
    expenseLadder: validatedCandidate.expenseLadder,
    oneTimeEvents: validatedCandidate.oneTimeEvents,
    adjustments: validatedCandidate.adjustments,
  };
}

async function searchExpenseReductionStage({
  scenario,
  incomeSources,
  savingsAccounts,
  healthcareSteps,
  assetAllocations,
  targetAge,
  baselineExpenseLadder,
  currentCandidate,
  oneTimeEvents,
  field,
  kind,
  label,
  maxPercent,
  stepPercent,
  searchIterations,
  pathSet?: MonteCarloPathSet,
}: {
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  healthcareSteps: HealthcareStep[];
  assetAllocations: AssetAllocation[];
  targetAge: number;
  baselineExpenseLadder: ExpenseLadder[];
  currentCandidate: EvaluatedCandidate;
  oneTimeEvents: OneTimeEvent[];
  field: 'living_expenses' | 'travel_expenses' | 'other_expenses';
  kind: SuccessOptimizationAdjustment['kind'];
  label: string;
  maxPercent: number;
  stepPercent: number;
  searchIterations: number;
}): Promise<EvaluatedCandidate> {
  let bestCandidate = currentCandidate;
  const retirementAge = scenario.retirement_age;

  for (let percent = stepPercent; percent <= maxPercent; percent += stepPercent) {
    const candidateExpenseLadder = applyExpenseReductionFromAge(baselineExpenseLadder, retirementAge, field, percent);
    const annualAmount = estimateAnnualReductionAtAge(baselineExpenseLadder, candidateExpenseLadder, retirementAge, field);
    const evaluated = await evaluateCandidate(
      scenario,
      incomeSources,
      savingsAccounts,
      candidateExpenseLadder,
      healthcareSteps,
      oneTimeEvents,
      assetAllocations,
      targetAge,
      replaceAdjustment(currentCandidate.adjustments, {
        kind,
        label,
        annualAmount,
        percent,
      }),
      searchIterations,
      pathSet
    );

    if (isBetterCandidate(evaluated, bestCandidate)) {
      bestCandidate = evaluated;
    }

    if (isTargetAchieved(evaluated)) {
      return evaluated;
    }
  }

  return bestCandidate;
}

async function searchEventDeferrals({
  scenario,
  incomeSources,
  savingsAccounts,
  healthcareSteps,
  assetAllocations,
  targetAge,
  baselineMonteCarloResult,
  currentCandidate,
  searchIterations,
  pathSet?: MonteCarloPathSet,
}: {
  scenario: Scenario;
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  healthcareSteps: HealthcareStep[];
  assetAllocations: AssetAllocation[];
  targetAge: number;
  baselineMonteCarloResult: MonteCarloResult;
  currentCandidate: EvaluatedCandidate;
  searchIterations: number;
}): Promise<EvaluatedCandidate> {
  let bestCandidate = currentCandidate;
  const eligibleIndices = getDownturnEventIndices(baselineMonteCarloResult, currentCandidate.oneTimeEvents)
    .slice(0, MAX_EVENT_DEFERRAL_CANDIDATES);

  for (const eventIndex of eligibleIndices) {
    const event = currentCandidate.oneTimeEvents[eventIndex];
    if (!event) {
      continue;
    }

    let bestForEvent = bestCandidate;
    for (let years = 1; years <= 3; years += 1) {
      const deferredEvents = deferExpenseEvent(bestCandidate.oneTimeEvents, eventIndex, years);
      const evaluated = await evaluateCandidate(
        scenario,
        incomeSources,
        savingsAccounts,
        bestCandidate.expenseLadder,
        healthcareSteps,
        deferredEvents,
        assetAllocations,
        targetAge,
        [
          ...bestCandidate.adjustments,
          {
            kind: 'event_deferral',
            label: 'Defer one-time event',
            eventName: event.name || 'one-time expense',
            originalAge: event.age,
            deferredByYears: years,
          },
        ],
        searchIterations,
        pathSet
      );

      if (isBetterCandidate(evaluated, bestForEvent)) {
        bestForEvent = evaluated;
      }

      if (isTargetAchieved(evaluated)) {
        return evaluated;
      }
    }

    if (isBetterCandidate(bestForEvent, bestCandidate)) {
      bestCandidate = bestForEvent;
    }
  }

  return bestCandidate;
}

async function evaluateCandidate(
  scenario: Scenario,
  incomeSources: IncomeSource[],
  savingsAccounts: SavingsAccount[],
  expenseLadder: ExpenseLadder[],
  healthcareSteps: HealthcareStep[],
  oneTimeEvents: OneTimeEvent[],
  assetAllocations: AssetAllocation[],
  targetAge: number,
  adjustments: SuccessOptimizationAdjustment[],
  iterations: number,
  pathSet?: MonteCarloPathSet
): Promise<EvaluatedCandidate> {
  const result = await runMonteCarloSimulation(
    {
      ...scenario,
      monte_carlo_iterations: iterations,
    },
    incomeSources,
    savingsAccounts,
    expenseLadder,
    healthcareSteps,
    oneTimeEvents,
    undefined,
    assetAllocations,
    undefined,
    pathSet
  );

  return {
    expenseLadder,
    oneTimeEvents,
    adjustments: adjustments.filter(isMeaningfulAdjustment),
    successRate: result.success_rate,
    medianRunOutAge: getMedianRunOutAge(result.percentile_50, targetAge),
    worstCasePassesToLifeExpectancy: passesWorstCaseToAge(result.percentile_10, targetAge),
    worstCaseFinalBalance: result.percentile_10[result.percentile_10.length - 1]?.total_balance ?? 0,
    burdenScore: calculateBurdenScore(adjustments),
  };
}

function buildRecommendationBody(
  baselineSuccessRate: number,
  optimizedSuccessRate: number,
  adjustments: SuccessOptimizationAdjustment[],
  baselineMonteCarloResult: MonteCarloResult,
  targetAge: number,
  targetAchieved: boolean
): string {
  const downturnRange = describeDownturnWindow(baselineMonteCarloResult, targetAge);
  const adjustmentSummary = describeAdjustments(adjustments);
  const targetSentence = targetAchieved
    ? 'The optimized path keeps the 10th percentile above zero through the life expectancy target.'
    : 'This is the strongest plan found within the configured reduction limits, but it does not fully clear the 90% target.';

  return `Sequence of returns risk is concentrated ${downturnRange}. ${adjustmentSummary} This improves success from ${baselineSuccessRate.toFixed(1)}% to ${optimizedSuccessRate.toFixed(1)}%. ${targetSentence}`;
}

function describeDownturnWindow(result: MonteCarloResult, targetAge: number): string {
  const downturnAges = result.percentile_10
    .filter((year, index, years) => {
      const previousBalance = index > 0 ? years[index - 1].total_balance : year.total_balance;
      return year.age <= targetAge && (((year.portfolio_return ?? 0) < 0) || year.total_balance < previousBalance);
    })
    .map(year => year.age);

  if (downturnAges.length === 0) {
    return 'in the early retirement years';
  }

  return `between ages ${Math.min(...downturnAges)} and ${Math.max(...downturnAges)}`;
}

function describeAdjustments(adjustments: SuccessOptimizationAdjustment[]): string {
  const parts = adjustments.map(adjustment => {
    if (adjustment.kind === 'event_deferral') {
      return `Deferring ${adjustment.eventName ?? 'a one-time expense'} by ${adjustment.deferredByYears} year${adjustment.deferredByYears === 1 ? '' : 's'}`;
    }

    if (!adjustment.annualAmount || adjustment.annualAmount <= 0) {
      return null;
    }

    const label = adjustment.kind === 'travel'
      ? 'Reducing travel'
      : adjustment.kind === 'other'
        ? 'reducing other discretionary spending'
        : 'reducing living expenses';
    const suffix = adjustment.kind === 'living' && adjustment.percent != null
      ? ` (${adjustment.percent}% cut)`
      : '';
    return `${label} by ${formatCurrency(adjustment.annualAmount)} per year${suffix}`;
  }).filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return 'A staged spending adjustment is available.';
  }

  if (parts.length === 1) {
    return `${parts[0]}.`;
  }

  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

function replaceAdjustment(
  adjustments: SuccessOptimizationAdjustment[],
  nextAdjustment: SuccessOptimizationAdjustment
): SuccessOptimizationAdjustment[] {
  const filtered = adjustments.filter(adjustment => adjustment.kind !== nextAdjustment.kind);
  return [...filtered, nextAdjustment];
}

function isMeaningfulAdjustment(adjustment: SuccessOptimizationAdjustment): boolean {
  if (adjustment.kind === 'event_deferral') {
    return Boolean(adjustment.deferredByYears && adjustment.deferredByYears > 0);
  }

  return Boolean(adjustment.annualAmount && adjustment.annualAmount > 0);
}

function calculateBurdenScore(adjustments: SuccessOptimizationAdjustment[]): number {
  return adjustments.reduce((sum, adjustment) => {
    if (adjustment.kind === 'event_deferral') {
      return sum + (adjustment.deferredByYears ?? 0) * 250;
    }

    return sum + (adjustment.annualAmount ?? 0);
  }, 0);
}

function estimateAnnualReductionAtAge(
  baselineExpenseLadder: ExpenseLadder[],
  candidateExpenseLadder: ExpenseLadder[],
  age: number,
  field: 'living_expenses' | 'travel_expenses' | 'other_expenses'
): number {
  const baselineRow = baselineExpenseLadder.find(row => age >= row.start_age && age <= row.end_age);
  const candidateRow = candidateExpenseLadder.find(row => age >= row.start_age && age <= row.end_age);
  const baselineAmount = baselineRow?.[field] ?? 0;
  const candidateAmount = candidateRow?.[field] ?? 0;
  return Math.max(0, roundCurrency(baselineAmount - candidateAmount));
}

function isBetterCandidate(left: EvaluatedCandidate, right: EvaluatedCandidate): boolean {
  const leftTarget = isTargetAchieved(left);
  const rightTarget = isTargetAchieved(right);

  if (leftTarget !== rightTarget) {
    return leftTarget;
  }

  if (leftTarget && rightTarget && left.burdenScore !== right.burdenScore) {
    return left.burdenScore < right.burdenScore;
  }

  if (Math.abs(left.successRate - right.successRate) > 0.05) {
    return left.successRate > right.successRate;
  }

  if (left.worstCasePassesToLifeExpectancy !== right.worstCasePassesToLifeExpectancy) {
    return left.worstCasePassesToLifeExpectancy;
  }

  if (Math.abs(left.worstCaseFinalBalance - right.worstCaseFinalBalance) > 1) {
    return left.worstCaseFinalBalance > right.worstCaseFinalBalance;
  }

  return left.burdenScore < right.burdenScore;
}

function isTargetAchieved(candidate: EvaluatedCandidate): boolean {
  return candidate.successRate >= TARGET_SUCCESS_RATE && candidate.worstCasePassesToLifeExpectancy;
}

function passesWorstCaseToAge(projections: YearlyProjection[], targetAge: number): boolean {
  const targetProjection = projections.filter(year => year.age <= targetAge);
  const lastAge = targetProjection[targetProjection.length - 1]?.age ?? projections[projections.length - 1]?.age;

  if (lastAge == null || lastAge < targetAge) {
    return false;
  }

  return targetProjection.every(year => year.total_balance >= -0.01 && (year.expense_shortfall ?? 0) <= 0.01);
}

function mergeAdjacentExpenseRows(rows: ExpenseLadder[]): ExpenseLadder[] {
  const sorted = [...rows].sort((left, right) => left.start_age - right.start_age);
  const merged: ExpenseLadder[] = [];

  for (const row of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.end_age + 1 === row.start_age &&
      last.living_expenses === row.living_expenses &&
      last.travel_expenses === row.travel_expenses &&
      last.other_expenses === row.other_expenses
    ) {
      last.end_age = row.end_age;
      continue;
    }

    merged.push({ ...row });
  }

  return merged;
}

function cloneExpenseLadder(expenseLadder: ExpenseLadder[]): ExpenseLadder[] {
  return expenseLadder.map(row => ({ ...row }));
}

function cloneOneTimeEvents(oneTimeEvents: OneTimeEvent[]): OneTimeEvent[] {
  return oneTimeEvents.map(event => ({ ...event }));
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

function formatCurrency(value: number): string {
  const rounded = Math.round(Math.abs(value));
  return `$${rounded.toLocaleString()}`;
}