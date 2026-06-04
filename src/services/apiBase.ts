declare const __API_BASE_URL__: string | undefined;

function isChromeExtensionRuntime(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id)
  );
}

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const configuredBaseUrl =
    typeof __API_BASE_URL__ === "string" ? __API_BASE_URL__ : "";

  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.trim()) {
    return normalizeApiBaseUrl(configuredBaseUrl.trim());
  }

  return isChromeExtensionRuntime()
    ? "http://localhost:3001/api"
    : "/api";
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
