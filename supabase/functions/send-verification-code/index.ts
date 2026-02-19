import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

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

function generateCode(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1000000;
  return num.toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if already registered
    const { data: existing, error: lookupError } = await supabase
      .from("developers")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) {
      console.error("[db] Lookup error:", lookupError.message);
    }

    if (existing) {
      return jsonResponse({
        error: "This email is already registered. If you lost your API key, contact support.",
      }, 409);
    }

    // Delete any existing unused codes for this email
    await supabase
      .from("verification_codes")
      .delete()
      .eq("email", normalizedEmail)
      .eq("verified", false);

    // Generate and store code (expires in 10 minutes)
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from("verification_codes")
      .insert({
        email: normalizedEmail,
        code,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[db] Insert error:", insertError.message);
      return jsonResponse({ error: "Failed to generate verification code" }, 500);
    }

    // Send email via Resend (HTTP API — works in Edge Functions)
    if (!RESEND_API_KEY) {
      console.error("[email] RESEND_API_KEY not set");
      return jsonResponse({ error: "Email service not configured" }, 500);
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TinderBot <onboarding@resend.dev>",
        to: [normalizedEmail],
        subject: "Your TinderBot Verification Code",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="font-size: 28px; margin: 0; color: #e11d48;">TinderBot</h1>
              <p style="color: #6b7280; margin-top: 8px;">Email Verification</p>
            </div>
            <div style="background: #1a1a2e; border-radius: 16px; padding: 32px; text-align: center;">
              <p style="color: #d1d5db; margin: 0 0 24px 0; font-size: 15px;">Your verification code is:</p>
              <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #ffffff; font-family: monospace; margin-bottom: 24px;">
                ${code}
              </div>
              <p style="color: #9ca3af; margin: 0; font-size: 13px;">This code expires in 10 minutes.</p>
            </div>
            <p style="text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errBody = await emailResponse.text();
      console.error("[email] Resend error:", emailResponse.status, errBody);
      return jsonResponse({ error: "Failed to send verification email. Please try again." }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (err: any) {
    console.error("[error]", err.message);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
