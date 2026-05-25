import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayApp } from "./OverlayApp";
import overlayCss from "./overlay.css";

const ROOT_ID = "kalshi-live-overlay-root";

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

window.addEventListener("unhandledrejection", (event) => {
  if (isExtensionContextInvalidated(event.reason)) {
    event.preventDefault();
  }
});

if (!document.getElementById(ROOT_ID)) {
  const style = document.createElement("style");
  style.textContent = overlayCss;
  document.documentElement.appendChild(style);

  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);

  ReactDOM.createRoot(host).render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  );
}
