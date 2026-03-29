import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./context/AppContext";
import App from "./App";
import "./global.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
