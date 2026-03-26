import { describe, expect, it } from 'vitest';

import type {
  ExpenseLadder,
  IncomeSource,
  OneTimeEvent,
  SavingsAccount,
  Scenario,
} from '../../types/retirement';
import {
  generateHistoricalWindows,
  runGoalSeekingSimulation,
  runSingleProjection,
} from '../projectionEngine';

function createBaseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    name: 'Test Scenario',
    profile_type: 'individual',
    current_age: 65,
    retirement_age: 65,
    spouse_retirement_age: 65,
    plan_duration: 5,
    province: 'ON',
    inflation_rate: 2,
    return_type: 'linear',
    expected_return: 5,
    management_fee_pct: 0,
    return_std_dev: 10,
    return_periods: [],
    monte_carlo_iterations: 100,
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
    life_expectancy: 90,
    healthcare_inflation: 3,
    legacy_goal: 0,
    ...overrides,
  };
}

function createSavingsAccounts(balance: number): SavingsAccount[] {
  return [
    {
      person: 'primary',
      account_type: 'rrsp',
      current_balance: balance,
      monthly_contribution: 0,
      contribution_end_age: 65,
    },
  ];
}

function createExpenseLadder(living: number, travel = 0, other = 0): ExpenseLadder[] {
  return [
    {
      start_age: 65,
      end_age: 95,
      living_expenses: living,
      travel_expenses: travel,
      other_expenses: other,
    },
  ];
}

const noIncome: IncomeSource[] = [];
const noEvents: OneTimeEvent[] = [];

describe('projection engine advanced modes', () => {
  it('generates rolling historical windows', () => {
    const scenario = createBaseScenario({ return_type: 'historical_backtesting', plan_duration: 4 });
    const windows = generateHistoricalWindows(4, scenario, createSavingsAccounts(250000));

    expect(windows.length).toBeGreaterThan(80);
    expect(windows[0]?.startYear).toBe(1925);
    expect(windows[1]?.startYear).toBe(1926);
    expect(windows[0]?.returnSequence).toHaveLength(4);
  });

  it('solves for a sustainable spending level in goal-seeking mode', () => {
    const scenario = createBaseScenario({ return_type: 'goal_seeking', plan_duration: 8, legacy_goal: 25000 });
    const result = runGoalSeekingSimulation(
      scenario,
      noIncome,
      createSavingsAccounts(650000),
      createExpenseLadder(50000),
      [],
      noEvents
    );

    expect(result.optimized_spending).toBeDefined();
    expect(result.optimized_spending!).toBeGreaterThanOrEqual(20000);
    expect(result.optimized_spending!).toBeLessThanOrEqual(500000);
    expect(result.percentile_50[result.percentile_50.length - 1]?.net_estate_value ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('logs preservation guardrails for underfunded plans', () => {
    const scenario = createBaseScenario({ return_type: 'dynamic_guardrails', plan_duration: 4, expected_return: 1 });
    const projections = runSingleProjection(
      scenario,
      noIncome,
      createSavingsAccounts(30000),
      createExpenseLadder(20000, 20000, 15000),
      [],
      noEvents
    );

    const triggerYear = projections.find(year => year.messages?.some(message => message.includes('Preservation Rule')));
    expect(triggerYear).toBeDefined();
    expect(triggerYear!.spending_adjustment_factor).toBeLessThan(1);
  });

  it('applies adaptive withdrawal rules after negative returns', () => {
    const scenario = createBaseScenario({ return_type: 'adaptive_withdrawal', plan_duration: 4, expected_return: 0 });
    const projections = runSingleProjection(
      scenario,
      noIncome,
      createSavingsAccounts(140000),
      createExpenseLadder(42000, 4000, 4000),
      [],
      noEvents,
      [-20, 5, 5, 5]
    );

    const inflationRuleYear = projections.find(year => year.messages?.some(message => message.includes('Inflation Rule')));
    const tenPercentRuleYear = projections.find(year => year.messages?.some(message => message.includes('10% Rule')));

    expect(inflationRuleYear).toBeDefined();
    expect(tenPercentRuleYear).toBeDefined();
  });
});