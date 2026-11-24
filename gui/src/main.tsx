import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./utils/nativeBridge";
import "./index.css";
import "./mobile.css";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
