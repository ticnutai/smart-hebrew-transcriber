import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { debugLog } from "./lib/debugLogger";
import App from "./App.tsx";
import "./index.css";

debugLog.info('Boot', `🚀 אתחול אפליקציה — ${new Date().toLocaleTimeString('he-IL')}`, {
  url: location.href,
  userAgent: navigator.userAgent,
  sessionId: debugLog.getSessionId(),
});

const stopBoot = debugLog.time('Boot', 'React mount');
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
stopBoot();
