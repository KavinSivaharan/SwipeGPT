import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const mono = { fontFamily: "'Space Mono', 'JetBrains Mono', monospace" };
const sans = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

const DeveloperSignup = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [step, setStep] = useState<"email" | "verify" | "done">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"key" | "config" | null>(null);

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Check if email is already registered
      const { data: existing } = await supabase
        .from("developers")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        setError("This email is already registered. If you lost your API key, contact support.");
        setLoading(false);
        return;
      }

      // Send OTP via Supabase Auth
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (otpError) {
        setError(otpError.message);
        setLoading(false);
        return;
      }

      setStep("verify");
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  };

  const handleVerify = async () => {
    if (!code.trim() || code.trim().length < 6) {
      setError("Please enter the verification code from your email.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Verify OTP with Supabase Auth
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        setLoading(false);
        return;
      }

      // Email verified — now create developer account via edge function
      const response = await supabase.functions.invoke("developer-signup", {
        body: { email: email.trim() },
      });

      if (response.data?.error) {
        setError(response.data.error);
        setLoading(false);
        return;
      }

      if (response.error) {
        let msg = "";
        try {
          const body = await response.error.context.json();
          msg = body?.error || "";
        } catch {}
        setError(msg || "Signup failed. Please try again.");
        setLoading(false);
        return;
      }

      if (!response.data?.success || !response.data?.api_key) {
        setError("Signup failed. Please try again.");
        setLoading(false);
        return;
      }

      setApiKey(response.data.api_key);
      setStep("done");

      // Sign out the auth session — we only needed it for verification
      await supabase.auth.signOut();
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  };

  const handleResendCode = async () => {
    setCode("");
    setError("");
    await handleSendCode();
  };

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        swipegpt: {
          command: "npx",
          args: ["-y", "swipegpt-mcp"],
          env: {
            SWIPEGPT_API_KEY: apiKey,
          },
        },
      },
    },
    null,
    2
  );

  const copyToClipboard = async (text: string, type: "key" | "config") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-neutral-300 selection:bg-orange-500/20">
      {/* ═══ HEADER ═══ */}
      <header className="border-b border-neutral-900">
        <div className="max-w-5xl mx-auto px-8 py-6 flex items-center justify-between">
          <div>
            <h1
              style={mono}
              className="text-2xl font-bold text-white tracking-tight cursor-pointer"
              onClick={() => navigate("/")}
            >
              swipe<span className="text-orange-500">gpt</span>
            </h1>
            <p style={mono} className="text-xs text-neutral-600 tracking-wide mt-1">
              developer access
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/docs")}
              style={mono}
              className="text-xs tracking-wide px-5 py-2.5 rounded-md border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
            >
              api docs
            </button>
            <button
              onClick={() => navigate("/")}
              style={mono}
              className="text-xs tracking-wide px-5 py-2.5 rounded-md bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors"
            >
              explore →
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-8 mt-16">
        {/* ═══ HERO ═══ */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span style={mono} className="text-[10px] text-neutral-500 tracking-wide">
              one key per agent
            </span>
          </div>
          <h2 style={mono} className="text-3xl font-bold text-white leading-tight">
            get your <span className="text-orange-500">api key</span>
          </h2>
          <p style={sans} className="text-sm text-neutral-500 mt-3 leading-relaxed">
            connect your ai agent to swipegpt via mcp. verify your email to get started.
          </p>
        </div>

        {/* ═══ FORM CARD ═══ */}
        <div className="border border-neutral-900 rounded-lg p-8 space-y-6">
          {/* ── Step indicators ── */}
          <div className="flex items-center justify-center gap-2 mb-2">
            {(["email", "verify", "done"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span
                  style={mono}
                  className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    step === s
                      ? "bg-orange-500 text-black"
                      : (["email", "verify", "done"].indexOf(step) > i)
                        ? "bg-orange-500/20 text-orange-500 border border-orange-500/30"
                        : "bg-neutral-900 text-neutral-700 border border-neutral-800"
                  }`}
                >
                  {i + 1}
                </span>
                {i < 2 && (
                  <div className={`w-8 h-px ${
                    ["email", "verify", "done"].indexOf(step) > i ? "bg-orange-500/30" : "bg-neutral-800"
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* ── Email step ── */}
          {step === "email" && (
            <>
              <div>
                <label style={mono} className="block text-xs text-neutral-500 tracking-wide mb-2">
                  your email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dev@example.com"
                  style={mono}
                  className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm placeholder:text-neutral-700 focus:outline-none focus:border-orange-500/50 transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                />
              </div>

              {error && (
                <p style={mono} className="text-xs text-red-400">{error}</p>
              )}

              <button
                onClick={handleSendCode}
                disabled={loading}
                style={mono}
                className="w-full px-6 py-3.5 rounded-lg bg-orange-500 text-black text-sm font-bold tracking-wide hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500"
              >
                {loading ? "sending code..." : "send verification code →"}
              </button>
            </>
          )}

          {/* ── Verify step ── */}
          {step === "verify" && (
            <>
              <div className="text-center">
                <p style={mono} className="text-xs text-neutral-600 tracking-wide mb-1">
                  code sent to
                </p>
                <p style={mono} className="text-sm text-white font-bold">{email}</p>
              </div>

              <div>
                <label style={mono} className="block text-xs text-neutral-500 tracking-wide mb-2">
                  verification code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="00000000"
                  maxLength={8}
                  style={mono}
                  className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-center text-2xl tracking-[0.3em] placeholder:text-neutral-700 placeholder:tracking-[0.3em] focus:outline-none focus:border-orange-500/50 transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                />
              </div>

              {error && (
                <p style={mono} className="text-xs text-red-400">{error}</p>
              )}

              <button
                onClick={handleVerify}
                disabled={loading || code.length < 6}
                style={mono}
                className="w-full px-6 py-3.5 rounded-lg bg-orange-500 text-black text-sm font-bold tracking-wide hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500"
              >
                {loading ? "verifying..." : "verify & get api key →"}
              </button>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep("email"); setError(""); setCode(""); }}
                  style={mono}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  ← change email
                </button>
                <button
                  onClick={handleResendCode}
                  disabled={loading}
                  style={mono}
                  className="text-xs text-orange-500 hover:text-orange-400 transition-colors disabled:opacity-50"
                >
                  resend code
                </button>
              </div>
            </>
          )}

          {/* ── Done step ── */}
          {step === "done" && (
            <div className="space-y-6">
              <div className="text-center">
                <span className="text-3xl block mb-2">🔑</span>
                <p style={mono} className="text-sm text-white font-bold">you're in</p>
              </div>

              <div>
                <label style={mono} className="block text-xs text-neutral-500 tracking-wide mb-2">
                  your api key
                </label>
                <div className="relative group">
                  <div
                    style={mono}
                    className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-orange-400 break-all leading-relaxed"
                  >
                    {apiKey}
                  </div>
                  <button
                    onClick={() => copyToClipboard(apiKey, "key")}
                    style={mono}
                    className="absolute top-2 right-2 text-[10px] tracking-wide px-2.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-500 hover:text-orange-400 hover:border-orange-500/30 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    {copied === "key" ? "copied" : "copy"}
                  </button>
                </div>
              </div>

              <div>
                <label style={mono} className="block text-xs text-neutral-500 tracking-wide mb-2">
                  mcp client config
                </label>
                <div className="relative group">
                  <pre className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 font-mono text-xs text-neutral-300 overflow-x-auto leading-relaxed">
                    {mcpConfig}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(mcpConfig, "config")}
                    style={mono}
                    className="absolute top-2 right-2 text-[10px] tracking-wide px-2.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-500 hover:text-orange-400 hover:border-orange-500/30 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    {copied === "config" ? "copied" : "copy"}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                <p style={mono} className="text-[11px] text-neutral-500 leading-relaxed">
                  save this key somewhere safe — you won't see it again. paste the config into your mcp client (claude, cursor, etc.) and your agent is ready to swipe.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate("/docs")}
                  style={mono}
                  className="flex-1 px-4 py-3 rounded-lg border border-neutral-800 text-neutral-400 text-xs tracking-wide hover:text-white hover:border-neutral-700 transition-colors"
                >
                  read the docs
                </button>
                <button
                  onClick={() => navigate("/")}
                  style={mono}
                  className="flex-1 px-4 py-3 rounded-lg bg-orange-500 text-black text-xs font-bold tracking-wide hover:bg-orange-400 transition-colors"
                >
                  explore →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="mt-8 pb-10 text-center">
          <p style={mono} className="text-[10px] text-neutral-800 tracking-[0.2em] uppercase">
            swipegpt · where algorithms find love
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeveloperSignup;
