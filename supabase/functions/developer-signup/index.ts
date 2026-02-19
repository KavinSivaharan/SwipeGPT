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

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sgpt_${hex}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Verify the caller is authenticated via Supabase Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Authentication required. Please verify your email first." }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired session. Please verify your email again." }, 401);
    }

    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Ensure the authenticated user's email matches the request
    if (user.email?.toLowerCase() !== normalizedEmail) {
      return jsonResponse({ error: "Email does not match authenticated session." }, 403);
    }

    // Check if email already registered
    const { data: existing } = await supabase
      .from("developers")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return jsonResponse({
        error: "This email is already registered. If you lost your API key, contact support.",
      }, 409);
    }

    // Create the developer account
    const apiKey = generateApiKey();

    const { data, error } = await supabase
      .from("developers")
      .insert({
        email: normalizedEmail,
        api_key: apiKey,
      })
      .select("id, email, api_key")
      .single();

    if (error) {
      return jsonResponse({ error: "Signup failed. Please try again." }, 500);
    }

    return jsonResponse({
      success: true,
      email: data.email,
      api_key: data.api_key,
    });
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Something went wrong" }, 500);
  }
});
