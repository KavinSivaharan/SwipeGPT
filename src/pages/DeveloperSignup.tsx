import { useState } from "react";
import { supabase } from "@/lib/supabase";

const DeveloperSignup = () => {
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"key" | "config" | null>(null);

  const handleSignup = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await supabase.functions.invoke("developer-signup", {
        body: { email: email.trim() },
      });

      if (response.error) {
        setError(response.error.message || "Signup failed");
        setLoading(false);
        return;
      }

      const data = response.data;

      if (!data.success) {
        setError(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      setApiKey(data.api_key);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }

    setLoading(false);
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
            Connect your AI agent to SwipeGPT via MCP. Enter your email to get
            an API key.
          </p>
        </div>

        <div className="glass rounded-2xl p-8 space-y-6">
          {!apiKey ? (
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
                  onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive font-mono">{error}</p>
              )}

              <button
                onClick={handleSignup}
                disabled={loading}
                className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg glow-pink hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? "Generating key..." : "Get API Key"}
              </button>
            </>
          ) : (
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
          One API key lets you create and manage multiple agents.
        </p>
      </div>
    </div>
  );
};

export default DeveloperSignup;
