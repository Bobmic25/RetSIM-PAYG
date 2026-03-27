import { describe, expect, it } from 'vitest';

import type { ExpenseLadder, MonteCarloResult, OneTimeEvent, Scenario } from '../../types/retirement';
import {
  applyExpenseReductionFromAge,
  deferExpenseEvent,
  getDownturnEventIndices,
  getMedianRunOutAge,
  shouldRecommendSuccessOptimization,
} from '../successOptimization';

function createScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    name: 'Optimization Scenario',
    profile_type: 'individual',
    current_age: 60,
    retirement_age: 65,
    spouse_retirement_age: 65,
    plan_duration: 30,
    province: 'ON',
    inflation_rate: 2,
    return_type: 'monte_carlo',
    expected_return: 5,
    management_fee_pct: 0,
    return_std_dev: 10,
    return_periods: [],
    monte_carlo_iterations: 250,
    withdrawal_strategy: 'maximize_spending',
    rrsp_exhaustion_years_before_end: 2,
    cpp_start_age: 65,
    cpp_amount_65: 12000,
    oas_start_age: 65,
    oas_amount_65: 8505,
    medical_expenses_annual: 0,
    charitable_donations_annual: 0,
    include_primary_residence: false,
    primary_residence_value: 0,
    cad_equity_weight: 60,
    us_equity_weight: 40,
    int_equity_weight: 0,
    life_expectancy: 92,
    healthcare_inflation: 3,
    legacy_goal: 0,
    ...overrides,
  };
}

function createMonteCarloResult(overrides: Partial<MonteCarloResult> = {}): MonteCarloResult {
  return {
    mode: 'monte_carlo',
    percentile_10: [
      { age: 65, total_balance: 100000, expense_shortfall: 0, year: 1 } as any,
      { age: 66, total_balance: 90000, expense_shortfall: 0, year: 2, portfolio_return: -8 } as any,
      { age: 67, total_balance: 85000, expense_shortfall: 0, year: 3, portfolio_return: -3 } as any,
    ],
    percentile_50: [
      { age: 65, total_balance: 200000, expense_shortfall: 0, year: 1 } as any,
      { age: 66, total_balance: 150000, expense_shortfall: 0, year: 2 } as any,
      { age: 67, total_balance: -10, expense_shortfall: 0, year: 3 } as any,
    ],
    percentile_90: [
      { age: 65, total_balance: 300000, expense_shortfall: 0, year: 1 } as any,
      { age: 66, total_balance: 330000, expense_shortfall: 0, year: 2 } as any,
      { age: 67, total_balance: 360000, expense_shortfall: 0, year: 3 } as any,
    ],
    success_rate: 62,
    iterations: 250,
    ...overrides,
  };
}

describe('success optimization helpers', () => {
  it('splits the ladder at retirement age before applying cuts', () => {
    const ladder: ExpenseLadder[] = [
      {
        start_age: 60,
        end_age: 70,
        living_expenses: 50000,
        travel_expenses: 10000,
        other_expenses: 5000,
      },
    ];

    const reduced = applyExpenseReductionFromAge(ladder, 65, 'travel_expenses', 50);

    expect(reduced).toEqual([
      {
        start_age: 60,
        end_age: 64,
        living_expenses: 50000,
        travel_expenses: 10000,
        other_expenses: 5000,
      },
      {
        start_age: 65,
        end_age: 70,
        living_expenses: 50000,
        travel_expenses: 5000,
        other_expenses: 5000,
      },
    ]);
  });

  it('defers only the targeted one-time expense event', () => {
    const events: OneTimeEvent[] = [
      { event_type: 'expense', name: 'Car', age: 66, amount: 30000 },
      { event_type: 'inheritance', name: 'Estate', age: 70, amount: 50000 },
    ];

    const deferred = deferExpenseEvent(events, 0, 2);

    expect(deferred[0].age).toBe(68);
    expect(deferred[1].age).toBe(70);
  });

  it('detects downturn-aligned expense events from the 10th percentile path', () => {
    const result = createMonteCarloResult();
    const events: OneTimeEvent[] = [
      { event_type: 'expense', name: 'Car', age: 66, amount: 30000 },
      { event_type: 'expense', name: 'Renovation', age: 72, amount: 25000 },
    ];

    expect(getDownturnEventIndices(result, events)).toEqual([0]);
  });

  it('recommends optimization when success is weak or the median runs out before life expectancy', () => {
    const scenario = createScenario();
    const result = createMonteCarloResult();
    const recommendation = shouldRecommendSuccessOptimization(scenario, result);

    expect(recommendation.shouldRecommend).toBe(true);
    expect(recommendation.triggerReason).toBe('both');
    expect(recommendation.medianRunOutAge).toBe(67);
    expect(getMedianRunOutAge(result.percentile_50, scenario.life_expectancy)).toBe(67);
  });
});