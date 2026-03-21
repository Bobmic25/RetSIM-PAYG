/*
  # Create tax_data_cache table

  ## Purpose
  Stores fetched and validated Canadian tax rate data (CRA) so the retirement
  simulator can use up-to-date rates rather than only hard-coded constants.

  ## New Tables

  ### `tax_data_cache`
  One row per tax year. Shared by all users (public read, service-role write).

  Columns:
  - `id` — UUID primary key
  - `tax_year` — Integer (e.g. 2026). Unique per row.
  - `federal_brackets` — JSONB array of {min, max, rate} objects
  - `provincial_brackets` — JSONB map of province code → array of {min, max, rate}
  - `federal_bpa` — Federal Basic Personal Amount (max)
  - `federal_bpa_min` — Federal BPA minimum (for high-income phase-out)
  - `federal_bpa_phase_out_start` — Income level where BPA begins to reduce
  - `federal_bpa_phase_out_end` — Income level where BPA reaches minimum
  - `provincial_bpa` — JSONB map of province code → BPA amount
  - `cpp_ympe` — CPP Year's Maximum Pensionable Earnings (Tier 1)
  - `cpp_ympe2` — CPP Tier 2 ceiling
  - `cpp_basic_exemption` — CPP basic annual exemption
  - `cpp_rate` — CPP contribution rate (employee share)
  - `cpp2_rate` — CPP Tier 2 contribution rate
  - `ei_max_insurable` — EI maximum insurable earnings
  - `ei_rate` — EI premium rate (employee)
  - `oas_clawback_threshold` — Income where OAS clawback begins
  - `oas_max_clawback_threshold` — Income where OAS is fully clawed back
  - `source_url` — URL of the CRA page this data originates from
  - `fetched_at` — Timestamp of last successful data fetch/update
  - `notes` — Free-text notes about the data (budget cycle, manual overrides, etc.)

  ## Security
  - RLS enabled
  - All authenticated users can SELECT (read) tax data
  - Only service role can INSERT/UPDATE/DELETE (managed via Edge Function)

  ## Notes
  1. The simulator falls back to hard-coded 2026 constants if no row exists for the current year.
  2. Rows are never deleted; a new tax year creates a new row.
  3. `fetched_at` is used by the frontend to display "Last verified: [date]" to users.
*/

CREATE TABLE IF NOT EXISTS tax_data_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year integer NOT NULL UNIQUE,
  federal_brackets jsonb NOT NULL DEFAULT '[]',
  provincial_brackets jsonb NOT NULL DEFAULT '{}',
  federal_bpa numeric NOT NULL DEFAULT 0,
  federal_bpa_min numeric NOT NULL DEFAULT 0,
  federal_bpa_phase_out_start numeric NOT NULL DEFAULT 0,
  federal_bpa_phase_out_end numeric NOT NULL DEFAULT 0,
  provincial_bpa jsonb NOT NULL DEFAULT '{}',
  cpp_ympe numeric NOT NULL DEFAULT 0,
  cpp_ympe2 numeric NOT NULL DEFAULT 0,
  cpp_basic_exemption numeric NOT NULL DEFAULT 3500,
  cpp_rate numeric NOT NULL DEFAULT 0,
  cpp2_rate numeric NOT NULL DEFAULT 0,
  ei_max_insurable numeric NOT NULL DEFAULT 0,
  ei_rate numeric NOT NULL DEFAULT 0,
  oas_clawback_threshold numeric NOT NULL DEFAULT 0,
  oas_max_clawback_threshold numeric NOT NULL DEFAULT 0,
  source_url text NOT NULL DEFAULT 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT ''
);

ALTER TABLE tax_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read tax data"
  ON tax_data_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read tax data"
  ON tax_data_cache
  FOR SELECT
  TO anon
  USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_data_cache' AND column_name = 'fetched_at'
  ) THEN
    ALTER TABLE tax_data_cache ADD COLUMN fetched_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

INSERT INTO tax_data_cache (
  tax_year,
  federal_brackets,
  provincial_brackets,
  federal_bpa,
  federal_bpa_min,
  federal_bpa_phase_out_start,
  federal_bpa_phase_out_end,
  provincial_bpa,
  cpp_ympe,
  cpp_ympe2,
  cpp_basic_exemption,
  cpp_rate,
  cpp2_rate,
  ei_max_insurable,
  ei_rate,
  oas_clawback_threshold,
  oas_max_clawback_threshold,
  source_url,
  fetched_at,
  notes
) VALUES (
  2026,
  '[
    {"min": 0,      "max": 58523,    "rate": 0.14},
    {"min": 58523,  "max": 117046,   "rate": 0.205},
    {"min": 117046, "max": 181474,   "rate": 0.26},
    {"min": 181474, "max": 258502,   "rate": 0.29},
    {"min": 258502, "max": null,     "rate": 0.33}
  ]',
  '{
    "AB": [{"min":0,"max":148269,"rate":0.10},{"min":148269,"max":177922,"rate":0.12},{"min":177922,"max":237230,"rate":0.13},{"min":237230,"max":355845,"rate":0.14},{"min":355845,"max":null,"rate":0.15}],
    "BC": [{"min":0,"max":47937,"rate":0.0506},{"min":47937,"max":95875,"rate":0.077},{"min":95875,"max":110076,"rate":0.105},{"min":110076,"max":133664,"rate":0.1229},{"min":133664,"max":181232,"rate":0.147},{"min":181232,"max":252752,"rate":0.168},{"min":252752,"max":null,"rate":0.205}],
    "MB": [{"min":0,"max":47000,"rate":0.108},{"min":47000,"max":100000,"rate":0.1275},{"min":100000,"max":null,"rate":0.174}],
    "NB": [{"min":0,"max":49958,"rate":0.094},{"min":49958,"max":99916,"rate":0.14},{"min":99916,"max":185064,"rate":0.16},{"min":185064,"max":null,"rate":0.195}],
    "NL": [{"min":0,"max":43198,"rate":0.087},{"min":43198,"max":86395,"rate":0.145},{"min":86395,"max":154244,"rate":0.158},{"min":154244,"max":215943,"rate":0.173},{"min":215943,"max":275870,"rate":0.183},{"min":275870,"max":551739,"rate":0.193},{"min":551739,"max":1103478,"rate":0.198},{"min":1103478,"max":null,"rate":0.208}],
    "NT": [{"min":0,"max":50597,"rate":0.059},{"min":50597,"max":101198,"rate":0.086},{"min":101198,"max":164525,"rate":0.122},{"min":164525,"max":null,"rate":0.1405}],
    "NS": [{"min":0,"max":29590,"rate":0.0879},{"min":29590,"max":59180,"rate":0.1495},{"min":59180,"max":93000,"rate":0.1667},{"min":93000,"max":150000,"rate":0.175},{"min":150000,"max":null,"rate":0.21}],
    "NU": [{"min":0,"max":53268,"rate":0.04},{"min":53268,"max":106537,"rate":0.07},{"min":106537,"max":173205,"rate":0.09},{"min":173205,"max":null,"rate":0.115}],
    "ON": [{"min":0,"max":51446,"rate":0.0505},{"min":51446,"max":102894,"rate":0.0915},{"min":102894,"max":150000,"rate":0.1116},{"min":150000,"max":220000,"rate":0.1216},{"min":220000,"max":null,"rate":0.1316}],
    "PE": [{"min":0,"max":32656,"rate":0.0968},{"min":32656,"max":64313,"rate":0.1363},{"min":64313,"max":105000,"rate":0.1665},{"min":105000,"max":null,"rate":0.187}],
    "QC": [{"min":0,"max":51780,"rate":0.14},{"min":51780,"max":103545,"rate":0.19},{"min":103545,"max":126000,"rate":0.24},{"min":126000,"max":null,"rate":0.2575}],
    "SK": [{"min":0,"max":52057,"rate":0.105},{"min":52057,"max":148734,"rate":0.125},{"min":148734,"max":null,"rate":0.145}],
    "YT": [{"min":0,"max":55867,"rate":0.064},{"min":55867,"max":111733,"rate":0.09},{"min":111733,"max":173205,"rate":0.109},{"min":173205,"max":500000,"rate":0.128},{"min":500000,"max":null,"rate":0.15}]
  }',
  16452,
  14829,
  181474,
  258502,
  '{"AB":21870,"BC":11981,"MB":15780,"NB":12458,"NL":10818,"NT":16593,"NS":8481,"NU":17925,"ON":11865,"PE":12000,"QC":17183,"SK":17661,"YT":16452}',
  74600,
  81200,
  3500,
  0.0595,
  0.04,
  65700,
  0.0166,
  95323,
  155396,
  'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html',
  now(),
  'Seed data: 2026 CRA announced federal rates (Budget 2024/2025). Loaded at initial migration.'
) ON CONFLICT (tax_year) DO NOTHING;
