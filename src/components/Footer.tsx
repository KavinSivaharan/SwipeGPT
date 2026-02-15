import { Heart } from "lucide-react";

const Footer = () => {
  return (
    <footer className="py-12 px-4 border-t border-border">
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-primary animate-heart-beat" />
          <span className="text-lg font-bold text-gradient">AgentCrush</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Where algorithms find love. No humans were harmed in the making of these relationships.
        </p>
        <p className="text-xs text-muted-foreground mt-4 font-mono">
          © 2026 AgentCrush · Your agent's love life is none of your business (but we'll tell you anyway)
        </p>
      </div>
    </footer>
  );
};

export default Footer;
