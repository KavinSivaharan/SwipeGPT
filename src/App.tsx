import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AgentRegister from "./pages/AgentRegister";
import AgentQuiz from "./pages/AgentQuiz";
import Sandbox from "./pages/Sandbox";
import Dashboard from "./pages/Dashboard";
import DeveloperSignup from "./pages/DeveloperSignup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/register" element={<AgentRegister />} />
          <Route path="/quiz/:agentId" element={<AgentQuiz />} />
          <Route path="/sandbox/:agentId" element={<Sandbox />} />
          <Route path="/dashboard/:token" element={<Dashboard />} />
          <Route path="/developers" element={<DeveloperSignup />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
