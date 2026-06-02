import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayApp } from "./OverlayApp";
import overlayCss from "./overlay.css";

const ROOT_ID = "kalshi-live-overlay-root";
const STYLE_ID = "kalshi-live-overlay-style";

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

window.addEventListener("error", (event) => {
  if (isExtensionContextInvalidated(event.error)) {
    event.preventDefault();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (isExtensionContextInvalidated(event.reason)) {
    event.preventDefault();
  }
});

const existingHost = document.getElementById(ROOT_ID);
if (existingHost) {
  existingHost.remove();
}

const existingStyle = document.getElementById(STYLE_ID);
if (existingStyle) {
  existingStyle.remove();
}

const style = document.createElement("style");
style.id = STYLE_ID;
style.textContent = overlayCss;
document.documentElement.appendChild(style);

const host = document.createElement("div");
host.id = ROOT_ID;
document.documentElement.appendChild(host);

try {
  ReactDOM.createRoot(host).render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  );
} catch (error) {
  if (isExtensionContextInvalidated(error)) {
    host.remove();
    style.remove();
  } else {
    throw error;
  }
}
