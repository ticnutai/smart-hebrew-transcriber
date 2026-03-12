import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debugLogger";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
    debugLog.info('Auth', `👤 Admin check: ${!!data ? 'admin' : 'user'}`);
  };

  useEffect(() => {
    const authStart = Date.now();
    debugLog.info('Auth', '🔐 מאתחל auth listener...');

    // Single source of truth: onAuthStateChange handles all auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const elapsed = Date.now() - authStart;
        debugLog.info('Auth', `🔐 Auth event: ${event} (${elapsed}ms)`, {
          hasSession: !!session,
          email: session?.user?.email ?? null,
        });
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await checkAdmin(session.user.id);
        } else {
          setIsAdmin(false);
        }
        setIsLoading(false);
      }
    );

    // Trigger initial session check (will flow through onAuthStateChange)
    supabase.auth.getSession();

    // Fallback: if auth never responds, stop loading after 5 seconds
    const timeout = setTimeout(() => {
      debugLog.warn('Auth', '⚠ Auth timeout — 5s ללא תגובה, ממשיך בלי auth');
      setIsLoading(false);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const logout = useCallback(async () => {
    debugLog.info('Auth', '🚪 מתנתק...');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    debugLog.info('Auth', '🚪 התנתק בהצלחה');
  }, []);

  const value = useMemo(() => ({
    isAuthenticated: !!session,
    user,
    session,
    isAdmin,
    isLoading,
    logout,
  }), [session, user, isAdmin, isLoading, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
