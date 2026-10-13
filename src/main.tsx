import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { prepareOffline } from "./life/offline";
if (import.meta.env.PROD) void prepareOffline().catch(() => {});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
