/*
  # Add Defined Benefit (DB) Pension Fields to Scenarios

  ## Summary
  Adds optional DB pension plan configuration columns to the scenarios table for both the primary person and spouse.

  ## Changes

  ### Modified Table: `scenarios`

  New columns for primary person:
  - `has_db_pension` (boolean) — whether the primary person has a DB pension plan
  - `db_pension_amount` (numeric) — annual pension amount at retirement (today's dollars)
  - `db_pension_start_age` (integer) — age when pension payments begin
  - `db_pension_indexed` (boolean) — whether pension is indexed to inflation

  New columns for spouse:
  - `spouse_has_db_pension` (boolean)
  - `spouse_db_pension_amount` (numeric)
  - `spouse_db_pension_start_age` (integer)
  - `spouse_db_pension_indexed` (boolean)

  ## Notes
  - All columns are nullable with safe defaults so existing scenarios are fully backward-compatible
  - No data is lost; this is a purely additive migration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'has_db_pension'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN has_db_pension boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'db_pension_amount'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN db_pension_amount numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'db_pension_start_age'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN db_pension_start_age integer DEFAULT 65;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'db_pension_indexed'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN db_pension_indexed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'spouse_has_db_pension'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN spouse_has_db_pension boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'spouse_db_pension_amount'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN spouse_db_pension_amount numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'spouse_db_pension_start_age'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN spouse_db_pension_start_age integer DEFAULT 65;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'spouse_db_pension_indexed'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN spouse_db_pension_indexed boolean DEFAULT false;
  END IF;
END $$;
