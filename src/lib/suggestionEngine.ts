import { YearlyProjection, Scenario, MonteCarloResult } from '../types/retirement';
import { ProjectionOverrides } from './projectionEngine';

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  benefit: string;
  overrides: ProjectionOverrides;
  priority: number;
}

export function generateSuggestions(
  projections: YearlyProjection[],
  scenario: Scenario,
  monteCarloResult?: MonteCarloResult
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
      priority: 2
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
      priority: 1
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
      priority: 3
    });
  }

  // 4. Safety Buffer
  if (monteCarloResult && monteCarloResult.success_rate < 0.80) {
    const currentRetirementAge = scenario.retirement_age;
    const suggestedRetirementAge = currentRetirementAge + 2;

    suggestions.push({
      id: 'safety_buffer_delay',
      title: 'Delay Retirement for Safety',
      description: `Your Monte Carlo success rate is ${Math.round(monteCarloResult.success_rate * 100)}%, which is below the recommended 80% threshold.`,
      benefit: `Delaying retirement to age ${suggestedRetirementAge} will significantly improve your plan's resilience to market volatility.`,
      overrides: {
        retirementAge: suggestedRetirementAge
      },
      priority: 1
    });
  }

  // Alternative: Increase savings if success rate is low and not yet retired
  if (monteCarloResult && monteCarloResult.success_rate < 0.80 && scenario.current_age < scenario.retirement_age) {
    const yearsToRetirement = scenario.retirement_age - scenario.current_age;
    if (yearsToRetirement > 5) {
      suggestions.push({
        id: 'safety_buffer_savings',
        title: 'Increase Monthly Savings',
        description: `Your Monte Carlo success rate is ${Math.round(monteCarloResult.success_rate * 100)}%, below the 80% safety threshold.`,
        benefit: 'Increasing monthly savings by $500 will build a stronger financial cushion for retirement.',
        overrides: {
          additionalMonthlySavings: 500
        },
        priority: 2
      });
    }
  }

<<<<<<< HEAD
  // 6. Satisfy Net Expenses Only - always suggest if not already using this strategy
  if (scenario.withdrawal_strategy !== 'net_expenses_only') {
    suggestions.push({
      id: 'net_expenses_only',
      title: 'Satisfy Net Expenses Only',
      description: 'Your current strategy may withdraw more than required for living expenses, sending the excess into taxable non-registered accounts. Switching to "Satisfy Net Expenses Only" withdraws the precise gross amount needed to cover your spending after tax.',
      benefit: 'Eliminate unnecessary withdrawals and re-investment cycles, reducing lifetime tax drag and preserving registered account room.',
      overrides: {
        withdrawalStrategy: 'net_expenses_only',
        disableBracketFilling: true,
        disableForcedWithdrawals: true
      },
      priority: 4
    });
  }

=======
>>>>>>> 538bd4e4bae1dbe4b52073e48f26dde06939678c
  // Sort by priority (lower number = higher priority)
  return suggestions.sort((a, b) => a.priority - b.priority);
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
