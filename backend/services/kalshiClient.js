import { existsSync, readFileSync } from "fs";
import crypto from "crypto";
import { dirname, isAbsolute, join } from "path";
import { fileURLToPath } from "url";

const KALSHI_BASE_URLS = {
  demo: "https://external-api.demo.kalshi.co/trade-api/v2",
  production: "https://external-api.kalshi.com/trade-api/v2"
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_ROOT = join(__dirname, "..");

function normalizeKalshiMode(value) {
  return value === "real" ? "real" : "mock";
}

function normalizeKalshiEnv(value) {
  return value === "production" ? "production" : "demo";
}

function normalizeKalshiPublicEnv(value) {
  if (value === "demo" || value === "production") {
    return value;
  }

  return "production";
}

class KalshiClient {
  constructor() {
    this.loggedCredentialWarning = false;
  }

  getMode() {
    return normalizeKalshiMode(process.env.KALSHI_MODE?.toLowerCase());
  }

  getEnvironment() {
    return normalizeKalshiEnv(process.env.KALSHI_ENV?.toLowerCase());
  }

  getBaseUrl() {
    return KALSHI_BASE_URLS[this.getEnvironment()];
  }

  getPublicEnvironment() {
    return normalizeKalshiPublicEnv(
      process.env.KALSHI_PUBLIC_ENV?.toLowerCase() || process.env.KALSHI_ENV?.toLowerCase()
    );
  }

  getPublicBaseUrl() {
    return KALSHI_BASE_URLS[this.getPublicEnvironment()];
  }

  getApiKeyId() {
    return process.env.KALSHI_API_KEY_ID?.trim() || "";
  }

  getPrivateKeyPath() {
    return process.env.KALSHI_PRIVATE_KEY_PATH?.trim() || "";
  }

  getResolvedPrivateKeyPath() {
    const privateKeyPath = this.getPrivateKeyPath();

    if (!privateKeyPath) {
      return "";
    }

    return isAbsolute(privateKeyPath) ? privateKeyPath : join(BACKEND_ROOT, privateKeyPath);
  }

  getWebsocketEnabled() {
    return process.env.KALSHI_ENABLE_WEBSOCKET === "true";
  }

  hasApiKeyId() {
    return Boolean(this.getApiKeyId());
  }

  hasPrivateKeyPath() {
    return Boolean(this.getResolvedPrivateKeyPath());
  }

  hasCredentials() {
    return Boolean(this.hasApiKeyId() && this.getPrivateKeyPem());
  }

  getPrivateKeyPem() {
    const privateKeyPath = this.getResolvedPrivateKeyPath();

    if (!privateKeyPath || !existsSync(privateKeyPath)) {
      return "";
    }

    try {
      return readFileSync(privateKeyPath, "utf8");
    } catch {
      return "";
    }
  }

  isConfiguredForRealMode() {
    return this.getMode() === "real" && this.hasCredentials();
  }

  logCredentialWarningOnce() {
    if (this.loggedCredentialWarning) {
      return;
    }

    console.warn(
      "[kalshi] Missing KALSHI_API_KEY_ID or readable KALSHI_PRIVATE_KEY_PATH. Falling back to mock Kalshi mode."
    );
    this.loggedCredentialWarning = true;
  }

  createSignature(timestamp, method, path) {
    const privateKeyPem = this.getPrivateKeyPem();

    if (!privateKeyPem) {
      return "";
    }

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${timestamp}${method.toUpperCase()}${path}`);
    sign.end();

    return sign.sign(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
      },
      "base64"
    );
  }

  async kalshiGet(path) {
    return this.request(path, { method: "GET" });
  }

  async publicGet(path) {
    return this.publicRequest(path, { method: "GET" });
  }

  async request(path, options = {}) {
    if (!this.isConfiguredForRealMode()) {
      this.logCredentialWarningOnce();
      throw new Error("Kalshi client is not configured for real mode.");
    }

    const method = (options.method || "GET").toUpperCase();
    const timestamp = String(Date.now());
    const url = new URL(`${this.getBaseUrl()}${path}`);
    const signature = this.createSignature(timestamp, method, url.pathname);

    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        "KALSHI-ACCESS-KEY": this.getApiKeyId(),
        "KALSHI-ACCESS-SIGNATURE": signature,
        "KALSHI-ACCESS-TIMESTAMP": timestamp
      }
    });

    if (!response.ok) {
      throw new Error(`Kalshi API responded with ${response.status}`);
    }

    return response.json();
  }

  async publicRequest(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const url = new URL(`${this.getPublicBaseUrl()}${path}`);
    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Kalshi public API responded with ${response.status}`);
    }

    return response.json();
  }

  async getBalance() {
    return this.kalshiGet("/portfolio/balance");
  }

  async getPositions() {
    return this.kalshiGet("/portfolio/positions");
  }

  async getMarket(ticker) {
    return this.kalshiGet(`/markets/${encodeURIComponent(ticker)}`);
  }

  async getMarkets(query = {}) {
    const url = new URL(`${this.getBaseUrl()}/markets`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const pathWithQuery = `/markets${url.search ? url.search : ""}`;

    return this.kalshiGet(pathWithQuery);
  }

  async getPublicMarket(ticker) {
    return this.publicGet(`/markets/${encodeURIComponent(ticker)}`);
  }

  async getPublicEvent(eventTicker) {
    return this.publicGet(`/events/${encodeURIComponent(eventTicker)}`);
  }

  async getPublicEventLiveData(eventTicker) {
    return this.publicGet(`/events/${encodeURIComponent(eventTicker)}/live_data`);
  }

  async getPublicMarkets(query = {}) {
    const url = new URL(`${this.getPublicBaseUrl()}/markets`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const pathWithQuery = `/markets${url.search ? url.search : ""}`;

    return this.publicGet(pathWithQuery);
  }

  async getPublicOrderbook(ticker, query = {}) {
    const url = new URL(`${this.getPublicBaseUrl()}/markets/${encodeURIComponent(ticker)}/orderbook`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const pathWithQuery = `/markets/${encodeURIComponent(ticker)}/orderbook${url.search ? url.search : ""}`;

    return this.publicGet(pathWithQuery);
  }
}

export const kalshiClient = new KalshiClient();
