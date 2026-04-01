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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const pinHandler = (e: Event) => {
      setIsPinned((e as CustomEvent).detail);
    };
    const openHandler = (e: Event) => {
      setIsOpen((e as CustomEvent).detail);
    };
    window.addEventListener("sidebar-pin-change", pinHandler);
    window.addEventListener("sidebar-open-change", openHandler);
    return () => {
      window.removeEventListener("sidebar-pin-change", pinHandler);
      window.removeEventListener("sidebar-open-change", openHandler);
    };
  }, []);

  const showMargin = isPinned || isOpen;

  return (
    <div
      className="min-h-screen transition-all duration-300"
      dir="rtl"
      style={{ marginRight: showMargin ? SIDEBAR_WIDTH : 0 }}
    >
      {children}
    </div>
  );
};

export default AppLayout;
