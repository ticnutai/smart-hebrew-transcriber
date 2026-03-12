import { lazy, Suspense, useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AppSidebar from "./components/AppSidebar";
import AppLayout from "./components/AppLayout";
import { Loader2 } from "lucide-react";
import CloudKeySync from "./components/CloudKeySync";
import UserFloatingBadge from "./components/UserFloatingBadge";
import { SmartConsole } from "./components/SmartConsole";
import { TranscriptionAnalytics } from "./components/TranscriptionAnalytics";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { useTheme } from "./hooks/useTheme";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Settings = lazy(() => import("./pages/Settings"));
const TextEditor = lazy(() => import("./pages/TextEditor"));
const Folders = lazy(() => import("./pages/Folders"));
const NotFound = lazy(() => import("./pages/NotFound"));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const App = () => {
  // Initialize theme on app load
  useTheme();
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CloudKeySync />
          <UserFloatingBadge />
          <SmartConsole />
          <TranscriptionAnalytics />
          <PWAInstallButton />
          <AppSidebar />
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transcribe" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/text-editor" element={<ProtectedRoute><TextEditor /></ProtectedRoute>} />
                <Route path="/folders" element={<ProtectedRoute><Folders /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
