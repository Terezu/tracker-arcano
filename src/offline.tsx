import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import { LifeCounter } from "./life/LifeCounter";
import { prepareOffline } from "./life/offline";
// This entry point has no Authentication/Firestore imports or protected workspace.
if (import.meta.env.PROD) void prepareOffline().catch(() => {});
createRoot(document.getElementById("root")!).render(<StrictMode><div className="app-shell"><LifeCounter isolated /></div></StrictMode>);
