export type ProfileType = 'individual' | 'couple';
export type ReturnType = 'linear' | 'monte_carlo';
export type WithdrawalStrategy = 'maximize_spending' | 'maximize_estate' | 'tax_efficient' | 'net_expenses_only' | 'rrsp_meltdown' | 'minimize_lifetime_tax';
export type AccountType = 'rrsp' | 'tfsa' | 'fhsa' | 'non_reg';
export type IncomeSourceType = 'salary' | 'pension' | 'rental' | 'other';
export type EventType = 'inheritance' | 'expense' | 'downsizing';
export type Person = 'primary' | 'spouse';
export type AssetClass = 'stocks' | 'bonds' | 'cash' | 'real_estate' | 'other';
export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export interface ReturnPeriod {
  from_year: number;
  to_year: number;
  return_rate: number;
}

export interface HealthcareStep {
  from_age: number;
  to_age: number;
  annual_cost: number;
  is_insured: boolean;
  description: string;
}

export interface Mortgage {
  balance: number;
  rate: number;
  amortization_end_age: number;
}

export interface Scenario {
  id?: string;
  user_id?: string;
  name: string;
  profile_type: ProfileType;
  current_age: number;
  spouse_age?: number;
  retirement_age: number;
  spouse_retirement_age?: number;
  plan_duration: number;
  province: Province;
  inflation_rate: number;
  return_type: ReturnType;
  expected_return: number;
  management_fee_pct?: number;
  return_std_dev?: number;
  return_periods?: ReturnPeriod[];
  monte_carlo_iterations: number;
  withdrawal_strategy: WithdrawalStrategy;
  rrsp_exhaustion_years_before_end?: number;
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
  primary_has_dtc?: boolean;
  medical_expenses_annual?: number;
  charitable_donations_annual?: number;
  mortgage?: Mortgage;
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
  int_equity_weight?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AssetAllocation {
  id?: string;
  scenario_id?: string;
  account_type: AccountType;
  person?: Person;
  risk_profile?: RiskProfile;
  stocks: number;
  bonds: number;
  cash: number;
  real_estate: number;
  other: number;
  us_equity_weight: number;
  cad_equity_weight: number;
  int_equity_weight: number;
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
  deduct_from_salary?: boolean;
  is_primary_residence?: boolean;
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
  expense_reduction_pct?: number;
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
  fhsa_withdrawal?: number;
  rrsp_withdrawal: number;
  rrsp_withdrawal_primary?: number;
  rrsp_withdrawal_spouse?: number;
  non_reg_withdrawal: number;
  non_reg_withdrawal_primary?: number;
  non_reg_withdrawal_spouse?: number;
  total_withdrawals: number;
  provincial_tax: number;
  federal_tax: number;
  cpp_ei_tax: number;
  total_tax: number;
  after_tax_income: number;
  mortgage_payment?: number;
  living_expenses: number;
  one_time_expenses: number;
  healthcare_expenses: number;
  total_expenses: number;
  net_cash_flow: number;
  expense_shortfall?: number;
  rrsp_contribution: number;
  tfsa_contribution: number;
  fhsa_contribution: number;
  non_reg_contribution: number;
  non_reg_contribution_primary?: number;
  non_reg_contribution_spouse?: number;
  non_reg_surplus: number;
  primary_surplus_to_tfsa?: number;
  spouse_surplus_to_tfsa?: number;
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
  rrsp_salary_deduction?: number;
  rrsp_salary_deduction_primary?: number;
  rrsp_salary_deduction_spouse?: number;
  salary_deducted_contributions?: number;
  salary_deducted_after_tax_contributions?: number;
  primary_salary: number;
  total_balance: number;
  mortgage_balance?: number;
  primary_residence_balance?: number;
  survival_probability?: number;
  terminal_tax?: number;
  net_estate_value?: number;
  gis_benefit?: number;
  rrsp_market_return?: number;
  tfsa_market_return?: number;
  fhsa_market_return?: number;
  non_reg_market_return?: number;
  non_reg_market_return_primary?: number;
  non_reg_market_return_spouse?: number;
}

export interface MonteCarloResult {
  percentile_10: YearlyProjection[];
  percentile_50: YearlyProjection[];
  percentile_90: YearlyProjection[];
  success_rate: number;
  iterations: number;
}

export interface SavedComparisonResult {
  name: string;
  projections: YearlyProjection[];
  color: string;
}

export interface ComparisonSeriesDefinition {
  key: string;
  label: string;
  color: string;
  sourceType: 'strategy' | 'saved';
  strokeDasharray?: string;
}

export interface ComparisonDataPoint {
  age: number;
  [key: string]: number | string | undefined;
}

export interface ComparisonDataset {
  cashFlowData: ComparisonDataPoint[];
  taxData: ComparisonDataPoint[];
  series: ComparisonSeriesDefinition[];
  strategyProjections: Record<WithdrawalStrategy, YearlyProjection[]>;
}

export type Province = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NT' | 'NS' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';
