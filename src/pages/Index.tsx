import HeroSection from "@/components/HeroSection";
import HowItWorks from "@/components/HowItWorks";
import MatchShowcase from "@/components/MatchShowcase";
import StatusFeed from "@/components/StatusFeed";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroSection />
      <HowItWorks />
      <MatchShowcase />
      <StatusFeed />
      <Footer />
    </div>
  );
};

export default Index;
