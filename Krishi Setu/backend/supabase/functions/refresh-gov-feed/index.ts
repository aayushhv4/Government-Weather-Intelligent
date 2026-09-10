// KrishiSetu — Refresh Government Mandi Feed (Edge Function template)
//
// This is the SERVER-SIDE refresh the app needs: the frontend only READS
// public.gov_mandi_feed_cache (see govFeedCache in the HTML app), but nothing
// in the project currently fills that table. Deploy this Edge Function and
// schedule it (see supabase/README.md) to populate the cache from the official
// data.gov.in AGMARKNET API.
//
// SETUP (one-time, in Supabase Dashboard -> Edge Functions):
//   1. Create the secret  GOV_API_KEY  = your free data.gov.in API key
//      (https://data.gov.in/developers/mini-api)
//   2. Deploy:  supabase functions deploy refresh-gov-feed --no-verify-jwt
//   3. Schedule (see the cron snippet in supabase/README.md).
//
// NOTE: field mapping below mirrors exactly what the frontend reads
// (commodity, state, district, market, arrival_date, min_price, modal_price,
// max_price). Verify against the live API response on the first successful run.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"; // AGMARKNET daily price API
const API_KEY = Deno.env.get("GOV_API_KEY") ?? "";

serve(async () => {
  if (!API_KEY) {
    return new Response("GOV_API_KEY secret is not configured.", { status: 500 });
  }

  const url =
    `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${API_KEY}&format=json&limit=5000`;

  let body;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return new Response(`data.gov.in responded with ${res.status}.`, { status: 502 });
    }
    body = await res.json();
  } catch (e) {
    return new Response(`Fetch failed: ${String(e)}`, { status: 502 });
  }

  const records = Array.isArray(body?.records) ? body.records : [];
  if (!records.length) {
    return new Response("No records returned by data.gov.in.", { status: 502 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const now = new Date().toISOString();
  const { error } = await supabase.from("gov_mandi_feed_cache").upsert({
    id: true,
    records,
    fetched_at: now,
    source: "data.gov.in AGMARKNET",
    updated_at: now,
  });

  if (error) {
    return new Response(`Cache upsert failed: ${error.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, records: records.length, fetched_at: now }), {
    headers: { "Content-Type": "application/json" },
  });
});