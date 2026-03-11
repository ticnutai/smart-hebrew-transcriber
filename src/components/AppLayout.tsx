import { useState, useEffect, ReactNode } from "react";

const SIDEBAR_WIDTH = 260;

const AppLayout = ({ children }: { children: ReactNode }) => {
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem("sidebar-pinned") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      setIsPinned((e as CustomEvent).detail);
    };
    window.addEventListener("sidebar-pin-change", handler);
    return () => window.removeEventListener("sidebar-pin-change", handler);
  }, []);

  return (
    <div
      className="min-h-screen transition-all duration-300"
      style={{ marginRight: isPinned ? SIDEBAR_WIDTH : 0 }}
    >
      {children}
    </div>
  );
};

export default AppLayout;
