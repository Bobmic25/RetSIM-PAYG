import {
  YearlyProjection,
  Scenario,
  MonteCarloResult,
  IncomeSource,
  SavingsAccount,
  ExpenseLadder,
  HealthcareStep,
  OneTimeEvent,
  AssetAllocation,
} from '../types/retirement';
import { ProjectionOverrides } from './projectionEngine';
import { runSingleProjection } from './projectionEngine';

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  benefit: string;
  overrides: ProjectionOverrides;
  priority: number;
  projected_value_add: number;
  projected_tax_savings: number;
  kind: 'improvement' | 'tradeoff';
}

export interface ComparativeAnalysisContext {
  incomeSources: IncomeSource[];
  savingsAccounts: SavingsAccount[];
  expenseLadder: ExpenseLadder[];
  healthcareSteps: HealthcareStep[];
  oneTimeEvents: OneTimeEvent[];
  assetAllocations: AssetAllocation[];
}

function isEffectivelyEqual(left: number, right: number, tolerance: number = 1): boolean {
  return Math.abs(left - right) <= tolerance;
}

function dedupeSuggestionsByOutcome(suggestions: Suggestion[]): Suggestion[] {
  const deduped: Suggestion[] = [];

  for (const suggestion of suggestions) {
    const alreadyRepresented = deduped.some(existing =>
      existing.kind === suggestion.kind &&
      isEffectivelyEqual(existing.projected_value_add, suggestion.projected_value_add) &&
      isEffectivelyEqual(existing.projected_tax_savings, suggestion.projected_tax_savings)
    );

    if (!alreadyRepresented) {
      deduped.push(suggestion);
    }
  }

  return deduped;
}

function formatComparisonBenefit(projectedValueAdd: number, projectedTaxSavings: number, fallback: string): string {
  if (!Number.isFinite(projectedValueAdd) || !Number.isFinite(projectedTaxSavings)) {
    return fallback;
  }

  const estateImpact = projectedValueAdd >= 0
    ? `increases your estate value by ${formatCurrency(projectedValueAdd)}`
    : `reduces your estate value by ${formatCurrency(Math.abs(projectedValueAdd))}`;

  const taxImpact = projectedTaxSavings >= 0
    ? `reduces lifetime tax by ${formatCurrency(projectedTaxSavings)}`
    : `increases lifetime tax by ${formatCurrency(Math.abs(projectedTaxSavings))}`;

  return `This strategy ${estateImpact} and ${taxImpact}.`;
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(Math.round(value));
  const prefix = value < 0 ? '-' : '';
  return `${prefix}$${absValue.toLocaleString()}`;
}

export function generateSuggestions(
  projections: YearlyProjection[],
  scenario: Scenario,
  monteCarloResult?: MonteCarloResult,
  comparisonContext?: ComparativeAnalysisContext
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!projections || projections.length === 0) {
    return suggestions;
  }

  const lastProjection = projections[projections.length - 1];
  const retirementYearIndex = scenario.retirement_age - scenario.current_age;
  const retiredProjections = projections.slice(retirementYearIndex);

  // Calculate total non-reg surplus during retirement
  const totalNonRegSurplus = retiredProjections.reduce((sum, p) => sum + (p.non_reg_surplus || 0), 0);

  // 1. Minimal Tax (No Re-investing) Suggestion
  if (totalNonRegSurplus > 50000) {
    suggestions.push({
      id: 'minimal_tax',
      title: 'Minimal Tax (Match Expenses Only)',
      description: `Your current plan withdraws $${Math.round(totalNonRegSurplus).toLocaleString()} more than needed, which is then re-invested in non-registered accounts. This creates unnecessary tax complexity.`,
      benefit: 'Reduce lifetime taxes by only withdrawing what you need for expenses.',
      overrides: {
        disableForcedWithdrawals: true,
        disableBracketFilling: true,
        disableRrspExhaustion: false
      },
      priority: 2,
      projected_value_add: 0,
      projected_tax_savings: 0,
      kind: 'improvement',
    });
  }

  // 2. Tax Meltdown Optimization
  const terminalTax = lastProjection.terminal_tax || 0;
  if (terminalTax > 200000) {
    suggestions.push({
      id: 'tax_meltdown',
      title: 'Aggressive RRSP Meltdown',
      description: `Your plan has a terminal tax of $${Math.round(terminalTax).toLocaleString()} at the end, indicating a large tax bomb on remaining RRSP assets.`,
      benefit: 'Smooth out tax burden by increasing early RRSP withdrawals, potentially saving tens of thousands in taxes.',
      overrides: {
        disableForcedWithdrawals: false,
        disableBracketFilling: false
      },
      priority: 1,
      projected_value_add: 0,
      projected_tax_savings: 0,
      kind: 'improvement',
    });
  }

  // 3. Lifestyle Upgrade
  const finalNetWorth = lastProjection.net_estate_value || lastProjection.total_balance;
  const inflationAdjustment = Math.pow(1 + scenario.inflation_rate / 100, projections.length);
  const finalNetWorthTodaysDollars = finalNetWorth / inflationAdjustment;

  if (finalNetWorthTodaysDollars > 1000000) {
    suggestions.push({
      id: 'lifestyle_upgrade',
      title: 'Lifestyle Upgrade',
      description: `Your final net worth is projected at $${Math.round(finalNetWorthTodaysDollars).toLocaleString()} in today's dollars. You can afford to enjoy more during retirement.`,
      benefit: 'Increase your annual spending by 20% while still maintaining a strong financial position.',
      overrides: {
        expenseMultiplier: 1.20
      },
      priority: 3,
      projected_value_add: 0,
      projected_tax_savings: 0,
      kind: 'improvement',
    });
  }

  // 4. Safety Buffer
  if (monteCarloResult && monteCarloResult.success_rate < 80) {
    const currentRetirementAge = scenario.retirement_age;
    const suggestedRetirementAge = currentRetirementAge + 2;

    suggestions.push({
      id: 'safety_buffer_delay',
      title: 'Delay Retirement for Safety',
      description: `Your Monte Carlo success rate is ${Math.round(monteCarloResult.success_rate)}%, which is below the recommended 80% threshold.`,
      benefit: `Delaying retirement to age ${suggestedRetirementAge} will significantly improve your plan's resilience to market volatility.`,
      overrides: {
        retirementAge: suggestedRetirementAge
      },
      priority: 1,
      projected_value_add: 0,
      projected_tax_savings: 0,
      kind: 'improvement',
    });
  }

  // Alternative: Increase savings if success rate is low and not yet retired
  if (monteCarloResult && monteCarloResult.success_rate < 80 && scenario.current_age < scenario.retirement_age) {
    const yearsToRetirement = scenario.retirement_age - scenario.current_age;
    if (yearsToRetirement > 5) {
      suggestions.push({
        id: 'safety_buffer_savings',
        title: 'Increase Monthly Savings',
        description: `Your Monte Carlo success rate is ${Math.round(monteCarloResult.success_rate)}%, below the 80% safety threshold.`,
        benefit: 'Increasing monthly savings by $500 will build a stronger financial cushion for retirement.',
        overrides: {
          additionalMonthlySavings: 500
        },
        priority: 2,
        projected_value_add: 0,
        projected_tax_savings: 0,
        kind: 'improvement',
      });
    }
  }

  // 6. Satisfy Net Expenses Only - always suggest if not already using this strategy
  if (scenario.withdrawal_strategy !== 'net_expenses_only') {
    suggestions.push({
      id: 'net_expenses_only',
      title: 'Satisfy Net Expenses Only',
      description: 'Your current strategy may withdraw more than required for living expenses, sending the excess into taxable non-registered accounts. Switching to "Satisfy Net Expenses Only" targets net spending needs while still respecting the configured RRSP exhaustion schedule.',
      benefit: 'Reduce bracket-filling behavior while keeping the plan on its RRSP depletion timeline instead of letting registered balances pile up to later years.',
      overrides: {
        withdrawalStrategy: 'net_expenses_only',
        disableBracketFilling: true
      },
      priority: 4,
      projected_value_add: 0,
      projected_tax_savings: 0,
      kind: 'improvement',
    });
  }

  // 7. Minimize Lifetime Tax - suggest when OAS clawback appears in retirement years
  const oasClawbackYears = retiredProjections.filter(p => p.cpp_ei_tax > (p.oas * 0.15)).length;
  if (
    oasClawbackYears >= 3 &&
    scenario.withdrawal_strategy !== 'minimize_lifetime_tax' &&
    scenario.withdrawal_strategy !== 'rrsp_meltdown'
  ) {
    suggestions.push({
      id: 'minimize_lifetime_tax',
      title: 'Minimize Lifetime Tax (OAS Clawback Detected)',
      description: `Your plan shows OAS clawbacks in ${oasClawbackYears} retirement years, likely from forced RRIF income pushing taxable income above the threshold. Proactive early RRSP draws can reduce this.`,
      benefit: 'Spreading RRSP income across more years reduces the peak taxable income that triggers OAS clawbacks, lowering total lifetime tax.',
      overrides: {
        withdrawalStrategy: 'minimize_lifetime_tax'
      },
      priority: 1,
      projected_value_add: 0,
      projected_tax_savings: 0,
      kind: 'improvement',
    });
  }

  // Sort by priority (lower number = higher priority)
  const sortedSuggestions = suggestions.sort((a, b) => a.priority - b.priority);

  if (!comparisonContext) {
    return sortedSuggestions;
  }

  return runComparativeAnalysis(sortedSuggestions, projections, scenario, comparisonContext);
}

export function runComparativeAnalysis(
  suggestions: Suggestion[],
  baselineProjections: YearlyProjection[],
  scenario: Scenario,
  comparisonContext: ComparativeAnalysisContext
): Suggestion[] {
  if (suggestions.length === 0 || baselineProjections.length === 0) {
    return suggestions;
  }

  const baselineMetrics = calculateComparisonMetrics(baselineProjections);

  const analyzedSuggestions = suggestions.map(suggestion => {
    const scenarioOverrides: Partial<Scenario> = {};
    if (suggestion.overrides.retirementAge != null) {
      scenarioOverrides.retirement_age = suggestion.overrides.retirementAge;
    }
    if (suggestion.overrides.withdrawalStrategy != null) {
      scenarioOverrides.withdrawal_strategy = suggestion.overrides.withdrawalStrategy;
    }

    const comparativeScenario = {
      ...scenario,
      ...scenarioOverrides,
    };

    const comparativeProjection = runSingleProjection(
      comparativeScenario,
      comparisonContext.incomeSources,
      comparisonContext.savingsAccounts,
      comparisonContext.expenseLadder,
      comparisonContext.healthcareSteps,
      comparisonContext.oneTimeEvents,
      undefined,
      undefined,
      undefined,
      comparisonContext.assetAllocations,
      undefined,
      suggestion.overrides
    );

    const comparativeMetrics = calculateComparisonMetrics(comparativeProjection);
    const projectedValueAdd = comparativeMetrics.finalNetWorth - baselineMetrics.finalNetWorth;
    const projectedTaxSavings = baselineMetrics.lifetimeTaxes - comparativeMetrics.lifetimeTaxes;
    const kind = projectedValueAdd >= 0 && projectedTaxSavings >= 0 ? 'improvement' : 'tradeoff';

    return {
      ...suggestion,
      projected_value_add: projectedValueAdd,
      projected_tax_savings: projectedTaxSavings,
      kind,
      benefit: formatComparisonBenefit(projectedValueAdd, projectedTaxSavings, suggestion.benefit),
    };
  });

  return dedupeSuggestionsByOutcome(analyzedSuggestions).sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'improvement' ? -1 : 1;
    }
    return left.priority - right.priority;
  });
}

export interface ComparisonMetrics {
  lifetimeTaxes: number;
  lifetimeWithdrawals: number;
  finalNetWorth: number;
  terminalTax: number;
  totalNonRegSurplus: number;
  averageAnnualSpending: number;
}

export function calculateComparisonMetrics(projections: YearlyProjection[]): ComparisonMetrics {
  if (!projections || projections.length === 0) {
    return {
      lifetimeTaxes: 0,
      lifetimeWithdrawals: 0,
      finalNetWorth: 0,
      terminalTax: 0,
      totalNonRegSurplus: 0,
      averageAnnualSpending: 0
    };
  }

  const lastProjection = projections[projections.length - 1];

  return {
    lifetimeTaxes: projections.reduce((sum, p) => sum + p.total_tax, 0),
    lifetimeWithdrawals: projections.reduce((sum, p) => sum + p.total_withdrawals, 0),
    finalNetWorth: lastProjection.net_estate_value || lastProjection.total_balance,
    terminalTax: lastProjection.terminal_tax || 0,
    totalNonRegSurplus: projections.reduce((sum, p) => sum + (p.non_reg_surplus || 0), 0),
    averageAnnualSpending: projections.reduce((sum, p) => sum + p.total_expenses, 0) / projections.length
  };
}
