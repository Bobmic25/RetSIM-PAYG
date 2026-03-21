export type ProfileType = 'individual' | 'couple';
export type ReturnType = 'linear' | 'monte_carlo';
export type WithdrawalStrategy = 'maximize_spending' | 'maximize_estate' | 'tax_efficient' | 'net_expenses_only';
export type AccountType = 'rrsp' | 'tfsa' | 'fhsa' | 'non_reg';
export type IncomeSourceType = 'salary' | 'pension' | 'rental' | 'other';
export type EventType = 'inheritance' | 'expense';
export type Person = 'primary' | 'spouse';
export type AssetClass = 'stocks' | 'bonds' | 'cash' | 'real_estate' | 'other';

export interface Scenario {
  id?: string;
  user_id?: string;
  name: string;
  profile_type: ProfileType;
  current_age: number;
  spouse_age?: number;
  retirement_age: number;
  plan_duration: number;
  province: Province;
  inflation_rate: number;
  return_type: ReturnType;
  expected_return: number;
  return_std_dev?: number;
  monte_carlo_iterations: number;
  withdrawal_strategy: WithdrawalStrategy;
  cpp_start_age: number;
  cpp_amount_65: number;
  oas_start_age: number;
  oas_amount_65?: number;
  spouse_cpp_start_age?: number;
  spouse_cpp_amount_65?: number;
  spouse_oas_start_age?: number;
  spouse_oas_amount_65?: number;
  has_db_pension?: boolean;
  db_pension_amount?: number;
  db_pension_start_age?: number;
  db_pension_indexed?: boolean;
  spouse_has_db_pension?: boolean;
  spouse_db_pension_amount?: number;
  spouse_db_pension_start_age?: number;
  spouse_db_pension_indexed?: boolean;
  life_expectancy?: number;
  spouse_life_expectancy?: number;
  healthcare_inflation?: number;
  legacy_goal?: number;
  glide_path_enabled?: boolean;
  glide_target_age?: number;
  glide_target_stocks?: number;
  glide_target_bonds?: number;
  cad_equity_weight?: number;
  us_equity_weight?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AssetAllocation {
  id?: string;
  scenario_id?: string;
  account_type: AccountType;
  person?: Person;
  stocks: number;
  bonds: number;
  cash: number;
  real_estate: number;
  other: number;
  us_equity_weight: number;
  cad_equity_weight: number;
}

export interface HealthcareCost {
  id?: string;
  scenario_id?: string;
  age: number;
  annual_cost: number;
  is_insured: boolean;
}

export interface IncomeSource {
  id?: string;
  scenario_id?: string;
  person: Person;
  source_type: IncomeSourceType;
  name: string;
  amount: number;
  start_age: number;
  end_age?: number;
  growth_rate: number;
}

export interface SavingsAccount {
  id?: string;
  scenario_id?: string;
  person: Person;
  account_type: AccountType;
  current_balance: number;
  monthly_contribution: number;
  contribution_end_age: number;
  inflation_linked?: boolean;
}

export interface ExpenseLadder {
  id?: string;
  scenario_id?: string;
  start_age: number;
  end_age: number;
  living_expenses: number;
  travel_expenses: number;
  other_expenses: number;
}

export interface OneTimeEvent {
  id?: string;
  scenario_id?: string;
  event_type: EventType;
  name: string;
  age: number;
  amount: number;
  tax_rate?: number;
}

export interface YearlyProjection {
  year: number;
  age: number;
  salary: number;
  cpp: number;
  oas: number;
  db_pension: number;
  inheritance: number;
  total_income: number;
  tfsa_withdrawal: number;
  rrsp_withdrawal: number;
  non_reg_withdrawal: number;
  non_reg_withdrawal_primary?: number;
  non_reg_withdrawal_spouse?: number;
  total_withdrawals: number;
  provincial_tax: number;
  federal_tax: number;
  cpp_ei_tax: number;
  total_tax: number;
  after_tax_income: number;
  living_expenses: number;
  one_time_expenses: number;
  healthcare_expenses: number;
  total_expenses: number;
  net_cash_flow: number;
  rrsp_contribution: number;
  tfsa_contribution: number;
  fhsa_contribution: number;
  non_reg_contribution: number;
  non_reg_contribution_primary?: number;
  non_reg_contribution_spouse?: number;
  non_reg_surplus: number;
  rrsp_balance: number;
  tfsa_balance: number;
  fhsa_balance: number;
  non_reg_balance: number;
  non_reg_balance_primary?: number;
  non_reg_balance_spouse?: number;
  non_reg_acb: number;
  non_reg_acb_primary?: number;
  non_reg_acb_spouse?: number;
  non_reg_capital_gain_inclusion: number;
  non_reg_capital_gain_inclusion_primary?: number;
  non_reg_capital_gain_inclusion_spouse?: number;
  primary_salary: number;
  total_balance: number;
  survival_probability?: number;
  terminal_tax?: number;
  net_estate_value?: number;
  gis_benefit?: number;
  rrsp_market_return?: number;
  tfsa_market_return?: number;
  fhsa_market_return?: number;
  non_reg_market_return?: number;
}

export interface MonteCarloResult {
  percentile_10: YearlyProjection[];
  percentile_50: YearlyProjection[];
  percentile_90: YearlyProjection[];
  success_rate: number;
  iterations: number;
}

export type Province = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NT' | 'NS' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';
