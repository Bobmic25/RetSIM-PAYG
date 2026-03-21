/*
  # Retirement Simulator Schema

  ## Overview
  Creates the database structure for storing Canadian retirement planning scenarios,
  including user profiles, income sources, savings accounts, expenses, and simulation results.

  ## New Tables
  
  ### 1. `scenarios`
  Main table storing retirement planning scenarios
  - `id` (uuid, primary key) - Unique scenario identifier
  - `user_id` (uuid) - Reference to auth.users
  - `name` (text) - Scenario name
  - `profile_type` (text) - 'individual' or 'couple'
  - `current_age` (integer) - Current age of primary person
  - `spouse_age` (integer, nullable) - Spouse age if couple
  - `retirement_age` (integer) - Target retirement age
  - `plan_duration` (integer) - Years post-retirement to plan for
  - `province` (text) - Province/territory for tax calculations
  - `inflation_rate` (numeric) - Annual inflation rate (default 2.5%)
  - `return_type` (text) - 'linear' or 'monte_carlo'
  - `expected_return` (numeric) - Expected annual return %
  - `return_std_dev` (numeric, nullable) - Standard deviation for Monte Carlo
  - `monte_carlo_iterations` (integer) - Number of MC simulations (default 10000)
  - `withdrawal_strategy` (text) - 'maximize_spending' or 'maximize_estate'
  - `cpp_start_age` (integer) - Age to start CPP (60-70)
  - `cpp_amount_65` (numeric) - CPP amount if taken at 65
  - `oas_start_age` (integer) - Age to start OAS (65-70)
  - `spouse_cpp_start_age` (integer, nullable)
  - `spouse_cpp_amount_65` (numeric, nullable)
  - `spouse_oas_start_age` (integer, nullable)
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. `income_sources`
  Income sources (salary, pension, etc.)
  - `id` (uuid, primary key)
  - `scenario_id` (uuid, foreign key)
  - `person` (text) - 'primary' or 'spouse'
  - `source_type` (text) - 'salary', 'pension', 'rental', 'other'
  - `name` (text) - Description
  - `amount` (numeric) - Annual amount
  - `start_age` (integer) - Age when income starts
  - `end_age` (integer, nullable) - Age when income ends
  - `growth_rate` (numeric) - Annual growth rate %

  ### 3. `savings_accounts`
  Current savings and contribution plans
  - `id` (uuid, primary key)
  - `scenario_id` (uuid, foreign key)
  - `person` (text) - 'primary' or 'spouse'
  - `account_type` (text) - 'rrsp', 'tfsa', 'fhsa', 'non_reg'
  - `current_balance` (numeric) - Current balance
  - `monthly_contribution` (numeric) - Monthly contribution amount
  - `contribution_end_age` (integer) - Age when contributions stop

  ### 4. `expense_ladder`
  Age-based expense planning (the 10-step ladder)
  - `id` (uuid, primary key)
  - `scenario_id` (uuid, foreign key)
  - `start_age` (integer) - Starting age for this bracket
  - `end_age` (integer) - Ending age for this bracket
  - `living_expenses` (numeric) - Annual living expenses
  - `travel_expenses` (numeric) - Annual travel expenses
  - `other_expenses` (numeric) - Other annual expenses

  ### 5. `one_time_events`
  One-time income or expenses
  - `id` (uuid, primary key)
  - `scenario_id` (uuid, foreign key)
  - `event_type` (text) - 'inheritance' or 'expense'
  - `name` (text) - Event description
  - `age` (integer) - Age when event occurs
  - `amount` (numeric) - Dollar amount

  ## Security
  - Enable RLS on all tables
  - Users can only access their own scenarios and related data
*/

-- Create scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  profile_type text NOT NULL DEFAULT 'individual',
  current_age integer NOT NULL,
  spouse_age integer,
  retirement_age integer NOT NULL,
  plan_duration integer NOT NULL DEFAULT 30,
  province text NOT NULL DEFAULT 'ON',
  inflation_rate numeric NOT NULL DEFAULT 2.5,
  return_type text NOT NULL DEFAULT 'linear',
  expected_return numeric NOT NULL DEFAULT 6.0,
  return_std_dev numeric,
  monte_carlo_iterations integer DEFAULT 10000,
  withdrawal_strategy text NOT NULL DEFAULT 'maximize_spending',
  cpp_start_age integer NOT NULL DEFAULT 65,
  cpp_amount_65 numeric NOT NULL DEFAULT 0,
  oas_start_age integer NOT NULL DEFAULT 65,
  spouse_cpp_start_age integer,
  spouse_cpp_amount_65 numeric,
  spouse_oas_start_age integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scenarios"
  ON scenarios FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scenarios"
  ON scenarios FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scenarios"
  ON scenarios FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own scenarios"
  ON scenarios FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create income_sources table
CREATE TABLE IF NOT EXISTS income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  person text NOT NULL DEFAULT 'primary',
  source_type text NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  start_age integer NOT NULL,
  end_age integer,
  growth_rate numeric DEFAULT 0
);

ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own income sources"
  ON income_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = income_sources.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own income sources"
  ON income_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = income_sources.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own income sources"
  ON income_sources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = income_sources.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = income_sources.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own income sources"
  ON income_sources FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = income_sources.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

-- Create savings_accounts table
CREATE TABLE IF NOT EXISTS savings_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  person text NOT NULL DEFAULT 'primary',
  account_type text NOT NULL,
  current_balance numeric NOT NULL DEFAULT 0,
  monthly_contribution numeric DEFAULT 0,
  contribution_end_age integer NOT NULL
);

ALTER TABLE savings_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own savings accounts"
  ON savings_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = savings_accounts.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own savings accounts"
  ON savings_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = savings_accounts.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own savings accounts"
  ON savings_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = savings_accounts.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = savings_accounts.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own savings accounts"
  ON savings_accounts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = savings_accounts.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

-- Create expense_ladder table
CREATE TABLE IF NOT EXISTS expense_ladder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  start_age integer NOT NULL,
  end_age integer NOT NULL,
  living_expenses numeric DEFAULT 0,
  travel_expenses numeric DEFAULT 0,
  other_expenses numeric DEFAULT 0
);

ALTER TABLE expense_ladder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expense ladder"
  ON expense_ladder FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = expense_ladder.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own expense ladder"
  ON expense_ladder FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = expense_ladder.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own expense ladder"
  ON expense_ladder FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = expense_ladder.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = expense_ladder.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own expense ladder"
  ON expense_ladder FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = expense_ladder.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

-- Create one_time_events table
CREATE TABLE IF NOT EXISTS one_time_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  name text NOT NULL,
  age integer NOT NULL,
  amount numeric NOT NULL
);

ALTER TABLE one_time_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own one-time events"
  ON one_time_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = one_time_events.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own one-time events"
  ON one_time_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = one_time_events.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own one-time events"
  ON one_time_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = one_time_events.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = one_time_events.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own one-time events"
  ON one_time_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      WHERE scenarios.id = one_time_events.scenario_id
      AND scenarios.user_id = auth.uid()
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scenarios_user_id ON scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_income_sources_scenario_id ON income_sources(scenario_id);
CREATE INDEX IF NOT EXISTS idx_savings_accounts_scenario_id ON savings_accounts(scenario_id);
CREATE INDEX IF NOT EXISTS idx_expense_ladder_scenario_id ON expense_ladder(scenario_id);
CREATE INDEX IF NOT EXISTS idx_one_time_events_scenario_id ON one_time_events(scenario_id);