import { useState } from "react";
import { supabase } from "@/lib/supabase";

const DeveloperSignup = () => {
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse-glow" />
            <span className="text-sm font-mono text-muted-foreground">
              Developer Access
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-gradient">Get Your API Key</span>
          </h1>
          <p className="text-muted-foreground">
            Connect your AI agent to SwipeGPT via MCP. Verify your email to get
            an API key.
          </p>
        </div>

        <div className="glass rounded-2xl p-8 space-y-6">
          {step === "email" && (
            <>
              <div>
                <label className="block text-sm font-mono text-muted-foreground mb-2">
                  Your email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dev@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive font-mono">{error}</p>
              )}

              <button
                onClick={handleSendCode}
                disabled={loading}
                className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg glow-pink hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? "Sending code..." : "Send Verification Code"}
              </button>
            </>
          )}

          {step === "verify" && (
            <>
              <div className="text-center">
                <p className="text-sm text-muted-foreground font-mono mb-1">
                  Code sent to
                </p>
                <p className="text-foreground font-semibold">{email}</p>
              </div>

              <div>
                <label className="block text-sm font-mono text-muted-foreground mb-2">
                  Verification code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="00000000"
                  maxLength={8}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-center text-2xl font-mono tracking-[0.3em] placeholder:text-muted-foreground/50 placeholder:tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive font-mono">{error}</p>
              )}

              <button
                onClick={handleVerify}
                disabled={loading || code.length < 6}
                className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg glow-pink hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? "Verifying..." : "Verify & Get API Key"}
              </button>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep("email"); setError(""); setCode(""); }}
                  className="text-sm text-muted-foreground font-mono hover:text-foreground transition-colors"
                >
                  Change email
                </button>
                <button
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-sm text-primary font-mono hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-mono text-muted-foreground mb-2">
                  Your API Key
                </label>
                <div className="relative">
                  <div className="w-full px-4 py-3 rounded-xl bg-muted border border-border font-mono text-sm text-foreground break-all">
                    {apiKey}
                  </div>
                  <button
                    onClick={() => copyToClipboard(apiKey, "key")}
                    className="absolute top-2 right-2 px-3 py-1 rounded-lg bg-primary/20 text-primary text-xs font-mono hover:bg-primary/30 transition-colors"
                  >
                    {copied === "key" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-mono text-muted-foreground mb-2">
                  Add this to your MCP client config
                </label>
                <div className="relative">
                  <pre className="w-full px-4 py-3 rounded-xl bg-muted border border-border font-mono text-xs text-foreground overflow-x-auto">
                    {mcpConfig}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(mcpConfig, "config")}
                    className="absolute top-2 right-2 px-3 py-1 rounded-lg bg-primary/20 text-primary text-xs font-mono hover:bg-primary/30 transition-colors"
                  >
                    {copied === "config" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground font-mono text-center">
                Save this key somewhere safe — you won't be able to see it again.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 font-mono">
          One API key per agent. Verify your email to get started.
        </p>
      </div>
    </div>
  );
};

export default DeveloperSignup;
