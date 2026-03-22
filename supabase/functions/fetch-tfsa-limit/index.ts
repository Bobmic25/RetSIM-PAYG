import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CRA_TFSA_ROOM_URL = "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html?wbdisable=true";

function parseTfsaLimitFromText(text: string, year: number): number | null {
  const directHeading = new RegExp(`${year}\\s+TFSA dollar limit[\\s\\S]{0,200}?\\$\\s*([0-9][0-9,]*)`, "i");
  const directMatch = text.match(directHeading);
  if (directMatch) {
    const amount = Number(directMatch[1].replace(/,/g, ""));
    if (Number.isFinite(amount)) return amount;
  }

  const tableRange = new RegExp(`${year}(?:\\s*(?:to|-)\\s*\\d{4})?[\\s|]+\\$\\s*([0-9][0-9,]*)`, "i");
  const tableMatch = text.match(tableRange);
  if (tableMatch) {
    const amount = Number(tableMatch[1].replace(/,/g, ""));
    if (Number.isFinite(amount)) return amount;
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const year = new Date().getFullYear();
    const response = await fetch(CRA_TFSA_ROOM_URL, {
      headers: {
        "User-Agent": "RetSIM TFSA Limit Fetcher",
      },
    });

    if (!response.ok) {
      throw new Error(`CRA request failed with HTTP ${response.status}`);
    }

    const text = await response.text();
    const annualLimit = parseTfsaLimitFromText(text, year) ?? parseTfsaLimitFromText(text, 2026);

    if (!annualLimit) {
      throw new Error("Unable to parse TFSA annual limit from CRA page");
    }

    return new Response(JSON.stringify({
      success: true,
      year: parseTfsaLimitFromText(text, year) ? year : 2026,
      annualLimit,
      sourceUrl: CRA_TFSA_ROOM_URL.replace('?wbdisable=true', ''),
      fetchedAt: new Date().toISOString(),
      notes: 'Live TFSA annual limit fetched from CRA.',
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});