import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TAX_DATA_2026 = {
  tax_year: 2026,
  federal_brackets: [
    { min: 0, max: 58523, rate: 0.14 },
    { min: 58523, max: 117046, rate: 0.205 },
    { min: 117046, max: 181474, rate: 0.26 },
    { min: 181474, max: 258502, rate: 0.29 },
    { min: 258502, max: null, rate: 0.33 },
  ],
  provincial_brackets: {
    AB: [{ min: 0, max: 148269, rate: 0.10 }, { min: 148269, max: 177922, rate: 0.12 }, { min: 177922, max: 237230, rate: 0.13 }, { min: 237230, max: 355845, rate: 0.14 }, { min: 355845, max: null, rate: 0.15 }],
    BC: [{ min: 0, max: 47937, rate: 0.0506 }, { min: 47937, max: 95875, rate: 0.077 }, { min: 95875, max: 110076, rate: 0.105 }, { min: 110076, max: 133664, rate: 0.1229 }, { min: 133664, max: 181232, rate: 0.147 }, { min: 181232, max: 252752, rate: 0.168 }, { min: 252752, max: null, rate: 0.205 }],
    MB: [{ min: 0, max: 47000, rate: 0.108 }, { min: 47000, max: 100000, rate: 0.1275 }, { min: 100000, max: null, rate: 0.174 }],
    NB: [{ min: 0, max: 49958, rate: 0.094 }, { min: 49958, max: 99916, rate: 0.14 }, { min: 99916, max: 185064, rate: 0.16 }, { min: 185064, max: null, rate: 0.195 }],
    NL: [{ min: 0, max: 43198, rate: 0.087 }, { min: 43198, max: 86395, rate: 0.145 }, { min: 86395, max: 154244, rate: 0.158 }, { min: 154244, max: 215943, rate: 0.173 }, { min: 215943, max: 275870, rate: 0.183 }, { min: 275870, max: 551739, rate: 0.193 }, { min: 551739, max: 1103478, rate: 0.198 }, { min: 1103478, max: null, rate: 0.208 }],
    NT: [{ min: 0, max: 50597, rate: 0.059 }, { min: 50597, max: 101198, rate: 0.086 }, { min: 101198, max: 164525, rate: 0.122 }, { min: 164525, max: null, rate: 0.1405 }],
    NS: [{ min: 0, max: 29590, rate: 0.0879 }, { min: 29590, max: 59180, rate: 0.1495 }, { min: 59180, max: 93000, rate: 0.1667 }, { min: 93000, max: 150000, rate: 0.175 }, { min: 150000, max: null, rate: 0.21 }],
    NU: [{ min: 0, max: 53268, rate: 0.04 }, { min: 53268, max: 106537, rate: 0.07 }, { min: 106537, max: 173205, rate: 0.09 }, { min: 173205, max: null, rate: 0.115 }],
    ON: [{ min: 0, max: 51446, rate: 0.0505 }, { min: 51446, max: 102894, rate: 0.0915 }, { min: 102894, max: 150000, rate: 0.1116 }, { min: 150000, max: 220000, rate: 0.1216 }, { min: 220000, max: null, rate: 0.1316 }],
    PE: [{ min: 0, max: 32656, rate: 0.0968 }, { min: 32656, max: 64313, rate: 0.1363 }, { min: 64313, max: 105000, rate: 0.1665 }, { min: 105000, max: null, rate: 0.187 }],
    QC: [{ min: 0, max: 51780, rate: 0.14 }, { min: 51780, max: 103545, rate: 0.19 }, { min: 103545, max: 126000, rate: 0.24 }, { min: 126000, max: null, rate: 0.2575 }],
    SK: [{ min: 0, max: 52057, rate: 0.105 }, { min: 52057, max: 148734, rate: 0.125 }, { min: 148734, max: null, rate: 0.145 }],
    YT: [{ min: 0, max: 55867, rate: 0.064 }, { min: 55867, max: 111733, rate: 0.09 }, { min: 111733, max: 173205, rate: 0.109 }, { min: 173205, max: 500000, rate: 0.128 }, { min: 500000, max: null, rate: 0.15 }],
  },
  federal_bpa: 16452,
  federal_bpa_min: 14829,
  federal_bpa_phase_out_start: 181474,
  federal_bpa_phase_out_end: 258502,
  provincial_bpa: { AB: 21870, BC: 11981, MB: 15780, NB: 12458, NL: 10818, NT: 16593, NS: 8481, NU: 17925, ON: 11865, PE: 12000, QC: 17183, SK: 17661, YT: 16452 },
  cpp_ympe: 74600,
  cpp_ympe2: 81200,
  cpp_basic_exemption: 3500,
  cpp_rate: 0.0595,
  cpp2_rate: 0.04,
  ei_max_insurable: 65700,
  ei_rate: 0.0166,
  oas_clawback_threshold: 95323,
  oas_max_clawback_threshold: 155396,
  source_url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html",
  notes: "2026 CRA announced federal rates (Budget 2024/2025). Manually verified against CRA published tables.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: existing, error: fetchError } = await supabase
      .from("tax_data_cache")
      .select("id, tax_year, fetched_at, notes")
      .eq("tax_year", TAX_DATA_2026.tax_year)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const payload = {
      ...TAX_DATA_2026,
      fetched_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("tax_data_cache")
        .update(payload)
        .eq("tax_year", TAX_DATA_2026.tax_year)
        .select("id, tax_year, fetched_at, notes")
        .single();
      if (error) throw error;
      result = { action: "updated", record: data };
    } else {
      const { data, error } = await supabase
        .from("tax_data_cache")
        .insert(payload)
        .select("id, tax_year, fetched_at, notes")
        .single();
      if (error) throw error;
      result = { action: "inserted", record: data };
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
