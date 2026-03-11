import { useState, useEffect, useRef, useCallback } from "react";
import { useCloudPreferences } from "@/hooks/useCloudPreferences";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Mic,
  FileText,
  Settings,
  LogIn,
  LogOut,
  Pin,
  PinOff,
  User,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const SIDEBAR_WIDTH = 260;
const TRIGGER_ZONE = 16;

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
}

const navItems: NavItem[] = [
  { label: "דשבורד", icon: LayoutDashboard, path: "/" },
  { label: "תמלול", icon: Mic, path: "/transcribe" },
  { label: "עורך טקסט", icon: FileText, path: "/text-editor" },
  { label: "הגדרות", icon: Settings, path: "/settings" },
];

export const useSidebarPinned = () => {
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem("sidebar-pinned") === "true";
    } catch {
      return false;
    }
  });
  return isPinned;
};

const AppSidebar = () => {
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem("sidebar-pinned") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-pinned", String(isPinned));
    } catch {}
    window.dispatchEvent(new CustomEvent("sidebar-pin-change", { detail: isPinned }));
  }, [isPinned]);

  useEffect(() => {
    if (isPinned) setIsOpen(true);
  }, [isPinned]);

  const handleMouseEnterTrigger = useCallback(() => {
    clearTimeout(closeTimerRef.current);
    setIsOpen(true);
  }, []);

  const handleMouseEnterSidebar = useCallback(() => {
    clearTimeout(closeTimerRef.current);
  }, []);

  const handleMouseLeaveSidebar = useCallback(() => {
    if (isPinned) return;
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 300);
  }, [isPinned]);

  const handleMouseLeaveTrigger = useCallback(() => {
    if (isPinned) return;
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 300);
  }, [isPinned]);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "";

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Trigger zone - invisible strip on the right edge */}
      {!isPinned && (
        <div
          ref={triggerRef}
          className="fixed top-0 right-0 h-full z-[60]"
          style={{ width: TRIGGER_ZONE }}
          onMouseEnter={handleMouseEnterTrigger}
          onMouseLeave={handleMouseLeaveTrigger}
        />
      )}

      {/* Overlay when open and not pinned */}
      {isOpen && !isPinned && (
        <div
          className="fixed inset-0 z-[59] bg-black/20 backdrop-blur-[1px] transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        dir="rtl"
        className={cn(
          "fixed top-0 right-0 h-full z-[60] flex flex-col",
          "bg-card border-l border-border shadow-xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: SIDEBAR_WIDTH }}
        onMouseEnter={handleMouseEnterSidebar}
        onMouseLeave={handleMouseLeaveSidebar}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-base font-bold text-foreground tracking-tight">
            ניווט
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPinned((p) => !p)}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                isPinned
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title={isPinned ? "שחרר" : "הצמד"}
            >
              {isPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
            </button>
            {!isPinned && (
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>

        <Separator />

        {/* Nav items */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-3">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  if (!isPinned) setIsOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-right",
                  isActive(item.path)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </ScrollArea>

        <Separator />

        {/* Footer - user info */}
        <div className="px-3 py-3">
          {isLoading ? null : isAuthenticated ? (
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {displayName}
                </p>
              </div>
              <button
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="התנתק"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                navigate("/login");
                if (!isPinned) setIsOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors w-full"
            >
              <LogIn className="w-5 h-5" />
              <span>התחבר</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default AppSidebar;
