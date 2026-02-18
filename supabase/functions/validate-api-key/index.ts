import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { api_key } = await req.json();

    if (!api_key || typeof api_key !== "string") {
      return jsonResponse({ error: "api_key is required" }, 400);
    }

    const { data, error } = await supabase
      .from("developers")
      .select("id, email")
      .eq("api_key", api_key)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: "Validation failed", details: error.message }, 500);
    }

    if (!data) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }

    return jsonResponse({ valid: true, developer_id: data.id, email: data.email });
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Something went wrong" }, 500);
  }
});
