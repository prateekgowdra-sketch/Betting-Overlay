import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const KALSHI_BASE_URLS = {
  demo: "https://external-api.demo.kalshi.co/trade-api/v2",
  production: "https://external-api.kalshi.com/trade-api/v2"
};

function normalizeKalshiMode(value) {
  return value === "real" ? "real" : "mock";
}

function normalizeKalshiEnv(value) {
  return value === "production" ? "production" : "demo";
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

  getApiKeyId() {
    return process.env.KALSHI_API_KEY_ID?.trim() || "";
  }

  getPrivateKeyPath() {
    return process.env.KALSHI_PRIVATE_KEY_PATH?.trim() || "";
  }

  hasCredentials() {
    return Boolean(this.getApiKeyId() && this.getPrivateKeyPem());
  }

  getPrivateKeyPem() {
    const privateKeyPath = this.getPrivateKeyPath();

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

  async request(path, options = {}) {
    if (!this.isConfiguredForRealMode()) {
      this.logCredentialWarningOnce();
      throw new Error("Kalshi client is not configured for real mode.");
    }

    const method = (options.method || "GET").toUpperCase();
    const timestamp = String(Date.now());
    const url = new URL(`${this.getBaseUrl()}${path}`);
    const signPath = path.split("?")[0];
    const signature = this.createSignature(timestamp, method, signPath);

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

  async getBalance() {
    return this.request("/portfolio/balance");
  }

  async getPositions() {
    return this.request("/portfolio/positions");
  }

  async getMarket(ticker) {
    return this.request(`/markets/${encodeURIComponent(ticker)}`);
  }

  async getMarkets(query = {}) {
    const url = new URL(`${this.getBaseUrl()}/markets`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const pathWithQuery = `/markets${url.search ? url.search : ""}`;

    return this.request(pathWithQuery, {
      method: "GET"
    });
  }
}

export const kalshiClient = new KalshiClient();
