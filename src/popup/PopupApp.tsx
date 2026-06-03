import { useEffect, useMemo, useState } from "react";
import {
  BackendStatusResponse,
  backendApi,
  KalshiMarketsResponse
} from "../services/backendApi";
import {
  AppSettings,
  getAppSettings,
  getKalshiWatchlist,
  saveAppSettings,
  saveKalshiWatchlist
} from "../shared/storage";
import {
  KalshiMarketSide,
  KalshiMarketSnapshot,
  KalshiSportFilterOption,
  KalshiWatchlistItem
} from "../shared/types";

function formatProviderLabel(provider?: string): string {
  switch (provider) {
    case "balldontlie":
      return "BALLDONTLIE";
    case "kalshi":
      return "Kalshi";
    case "the_odds_api":
      return "The Odds API";
    case "sportsdataio":
      return "SportsDataIO";
    case "mock":
    default:
      return "Mock Feed";
  }
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === "number" ? `${value}c` : "--";
}

function formatVolume(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getDisplayTitle(item: { displayTitle?: string | null; title: string }): string {
  return item.displayTitle || item.title;
}

function getDefaultEntryPrice(side: KalshiMarketSide, market: KalshiMarketSnapshot): number {
  if (side === "YES") {
    return market.yesAskCents ?? market.yesBidCents ?? market.lastPriceCents ?? 50;
  }

  if (typeof market.noAskCents === "number") {
    return market.noAskCents;
  }

  if (typeof market.noBidCents === "number") {
    return market.noBidCents;
  }

  if (typeof market.lastPriceCents === "number") {
    return Math.max(0, Math.min(100, 100 - market.lastPriceCents));
  }

  return 50;
}

async function loadSearchResults(
  query: string,
  status: string,
  sport?: string,
  competition?: string,
  scope?: string
): Promise<KalshiMarketsResponse> {
  return backendApi.getKalshiSportsMarkets({
    limit: 30,
    status,
    sport: sport || undefined,
    competition: competition || undefined,
    scope: scope || undefined,
    search: query.trim() || undefined
  });
}

export function PopupApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [watchlist, setWatchlist] = useState<KalshiWatchlistItem[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatusResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [sportFilters, setSportFilters] = useState<KalshiSportFilterOption[]>([]);
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [searchResults, setSearchResults] = useState<KalshiMarketSnapshot[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchError, setSearchError] = useState("");
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      getAppSettings(),
      getKalshiWatchlist(),
      backendApi.getBackendStatus().catch(() => null),
      backendApi.getKalshiSportsFilters().catch(() => null),
      loadSearchResults("", "open").catch(() => null)
    ]).then(([nextSettings, nextWatchlist, nextBackendStatus, nextSportFilters, initialResults]) => {
      const marketTrackerSettings =
        nextSettings.dataMode === "markets"
          ? nextSettings
          : {
              ...nextSettings,
              dataMode: "markets" as const
            };

      setSettings(marketTrackerSettings);
      setWatchlist(nextWatchlist);
      setBackendStatus(nextBackendStatus);
      setSportFilters(nextSportFilters?.sports ?? []);

      if (initialResults) {
        setSearchResults(initialResults.markets);
        setSearchCursor(initialResults.cursor);
      }

      if (marketTrackerSettings !== nextSettings) {
        void saveAppSettings(marketTrackerSettings);
      }
    });
  }, []);

  async function persistSettings(next: AppSettings) {
    setSettings(next);
    setIsSaving(true);
    await saveAppSettings(next);
    setIsSaving(false);
  }

  async function persistWatchlist(next: KalshiWatchlistItem[]) {
    setWatchlist(next);
    setIsSaving(true);
    await saveKalshiWatchlist(next);
    setIsSaving(false);
  }

  async function runSearch(
    nextQuery = searchQuery,
    nextStatus = statusFilter,
    nextSport = selectedSport,
    nextCompetition = selectedCompetition,
    nextScope = selectedScope
  ) {
    setIsLoadingResults(true);
    setSearchError("");

    try {
      const response = await loadSearchResults(
        nextQuery,
        nextStatus,
        nextSport,
        nextCompetition,
        nextScope
      );
      setSearchResults(response.markets);
      setSearchCursor(response.cursor);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
      setSearchResults([]);
      setSearchCursor(null);
    } finally {
      setIsLoadingResults(false);
    }
  }

  const watchlistSummary = useMemo(() => {
    if (watchlist.length === 0) {
      return "No watched markets yet";
    }

    return `${watchlist.length} watched market${watchlist.length === 1 ? "" : "s"}`;
  }, [watchlist]);

  if (!settings) {
    return <div className="popup-shell loading">Loading market tracker...</div>;
  }

  const watchlistByTicker = new Map(watchlist.map((item) => [item.ticker, item]));
  const selectedSportFilter =
    sportFilters.find((sport) => sport.sportKey === selectedSport) ?? null;
  const competitionOptions = selectedSportFilter?.competitions ?? [];
  const scopeOptions = selectedSportFilter?.scopes ?? [];
  const resultsWithState = searchResults.map((market) => ({
    market,
    isWatched: watchlistByTicker.has(market.ticker)
  }));

  async function addMarketToWatchlist(market: KalshiMarketSnapshot) {
    if (watchlistByTicker.has(market.ticker)) {
      return;
    }

    const defaultContracts = 0;
    const defaultEntryPriceCents = getDefaultEntryPrice("YES", market);
    const nextItem: KalshiWatchlistItem = {
      id: `watch-${market.ticker}-${Date.now()}`,
      ticker: market.ticker,
      eventTicker: market.eventTicker ?? null,
      title: market.title,
      displayTitle: market.displayTitle ?? null,
      sport: market.sport ?? null,
      competition: market.competition ?? null,
      scope: market.scope ?? null,
      userSide: "YES",
      entryPriceCents: defaultEntryPriceCents,
      contracts: defaultContracts,
      amountRisked: roundCurrency((defaultContracts * defaultEntryPriceCents) / 100),
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await persistWatchlist([...watchlist, nextItem]);
  }

  async function updateWatchlistItem(
    ticker: string,
    updater: (item: KalshiWatchlistItem) => KalshiWatchlistItem
  ) {
    await persistWatchlist(
      watchlist.map((item) =>
        item.ticker === ticker
          ? {
              ...updater(item),
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
  }

  async function removeWatchlistItem(ticker: string) {
    await persistWatchlist(watchlist.filter((item) => item.ticker !== ticker));
  }

  async function toggleWatchlistMarket(market: KalshiMarketSnapshot) {
    if (watchlistByTicker.has(market.ticker)) {
      await removeWatchlistItem(market.ticker);
      return;
    }

    await addMarketToWatchlist(market);
  }

  return (
    <div className="popup-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Kalshi First</div>
          <h1>Market Tracker</h1>
          <p>Search public Kalshi markets, add them to your watchlist, and let the overlay refresh YES/NO prices every 15 seconds.</p>
          <p>
            Backend provider: <strong>{formatProviderLabel(backendStatus?.sportsDataProvider)}</strong>
            {backendStatus?.kalshiPublicEnv ? ` · Public market env: ${backendStatus.kalshiPublicEnv}` : ""}
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Overlay Mode</h2>
          <span className={`saving-pill ${isSaving ? "active" : ""}`}>{isSaving ? "Saving" : "Ready"}</span>
        </div>

        <div className="field-grid single-column">
          <label>
            Active mode
            <select
              value={settings.dataMode}
              onChange={(event) =>
                void persistSettings({
                  ...settings,
                  dataMode: event.target.value as AppSettings["dataMode"]
                })
              }
            >
              <option value="markets">Kalshi market tracker</option>
              <option value="demo">Legacy game demo</option>
              <option value="manual">Legacy manual parlay</option>
            </select>
          </label>

          <div className="feed-source-copy">
            The new primary flow is market-first. In market tracker mode, the overlay ignores selected-game dependencies and follows your watched Kalshi tickers.
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Search Kalshi Markets</h2>
          <span className="small-copy">{isLoadingResults ? "Searching..." : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`}</span>
        </div>

        <div className="search-row">
          <input
            value={searchQuery}
            placeholder="Search by market title or ticker"
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void runSearch();
              }
            }}
          />
          <select
            value={statusFilter}
            onChange={(event) => {
              const nextStatus = event.target.value;
              setStatusFilter(nextStatus);
              void runSearch(searchQuery, nextStatus, selectedSport, selectedCompetition, selectedScope);
            }}
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
            <option value="settled">Settled</option>
          </select>
          <button type="button" className="primary-button" onClick={() => void runSearch()}>
            Search
          </button>
        </div>

        <div className="filter-row">
          <select
            value={selectedSport}
            onChange={(event) => {
              const nextSport = event.target.value;
              setSelectedSport(nextSport);
              setSelectedCompetition("");
              setSelectedScope("");
              void runSearch(searchQuery, statusFilter, nextSport, "", "");
            }}
          >
            <option value="">All sports</option>
            {sportFilters.map((sport) => (
              <option value={sport.sportKey} key={sport.sportKey}>
                {sport.sportName}
              </option>
            ))}
          </select>

          <select
            value={selectedCompetition}
            disabled={!selectedSport || competitionOptions.length === 0}
            onChange={(event) => {
              const nextCompetition = event.target.value;
              setSelectedCompetition(nextCompetition);
              void runSearch(searchQuery, statusFilter, selectedSport, nextCompetition, selectedScope);
            }}
          >
            <option value="">All competitions</option>
            {competitionOptions.map((competition) => (
              <option value={competition} key={competition}>
                {competition}
              </option>
            ))}
          </select>

          <select
            value={selectedScope}
            disabled={!selectedSport || scopeOptions.length === 0}
            onChange={(event) => {
              const nextScope = event.target.value;
              setSelectedScope(nextScope);
              void runSearch(searchQuery, statusFilter, selectedSport, selectedCompetition, nextScope);
            }}
          >
            <option value="">All scopes</option>
            {scopeOptions.map((scope) => (
              <option value={scope} key={scope}>
                {scope}
              </option>
            ))}
          </select>
        </div>

        {searchError ? <div className="error-copy">{searchError}</div> : null}

        <div className="positions-list">
          {resultsWithState.length === 0 ? (
            <article className="position-card">
              <div className="position-note">No markets matched this search. Try a broader title, a ticker fragment, or a different status filter.</div>
            </article>
          ) : (
            resultsWithState.map(({ market, isWatched }) => (
              <article className="position-card" key={market.ticker}>
                <div className="position-topline">
                  <span className="market">{getDisplayTitle(market)}</span>
                  <button
                    type="button"
                    className={isWatched ? "inline-button muted-button" : "inline-button"}
                    onClick={() => void toggleWatchlistMarket(market)}
                  >
                    {isWatched ? "Remove" : "Add"}
                  </button>
                </div>
                <div className="position-meta">
                  <span>{market.ticker}</span>
                  <span>{[market.sport, market.competition, market.scope].filter(Boolean).join(" · ") || market.status}</span>
                </div>
                <div className="position-meta">
                  <span>{market.eventTitle ?? market.eventTicker ?? "Kalshi market"}</span>
                  <span>{market.status}</span>
                </div>
                <div className="position-pricing">
                  <span>YES {formatPrice(market.yesBidCents)} / {formatPrice(market.yesAskCents)}</span>
                  <span>NO {formatPrice(market.noBidCents)} / {formatPrice(market.noAskCents)}</span>
                </div>
                <div className="position-meta">
                  <span>Last {formatPrice(market.lastPriceCents)}</span>
                  <span>Volume {formatVolume(market.volume)}</span>
                </div>
              </article>
            ))
          )}
        </div>

        {searchCursor ? <div className="small-copy">More results are available through Kalshi pagination; this popup is currently showing the first page.</div> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Watchlist</h2>
          <span className="small-copy">{watchlistSummary}</span>
        </div>

        <div className="positions-list">
          {watchlist.length === 0 ? (
            <article className="position-card">
              <div className="position-note">Add a Kalshi market above to start tracking it in the overlay.</div>
            </article>
          ) : (
            watchlist.map((item) => (
              <article className="position-card" key={item.ticker}>
                <div className="position-topline">
                  <span className="market">{getDisplayTitle(item)}</span>
                  <button
                    type="button"
                    className="inline-button"
                    onClick={() => void removeWatchlistItem(item.ticker)}
                  >
                    Remove
                  </button>
                </div>
                <div className="position-meta">
                  <span>{item.ticker}</span>
                  <span>Added {new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="position-meta">
                  <span>{[item.sport, item.competition, item.scope].filter(Boolean).join(" · ") || "Kalshi market"}</span>
                  <span>{item.eventTicker ?? ""}</span>
                </div>
                <div className="field-grid compact-grid">
                  <label>
                    Your side
                    <select
                      value={item.userSide}
                      onChange={(event) =>
                        void updateWatchlistItem(item.ticker, (current) => ({
                          ...current,
                          userSide: event.target.value as KalshiMarketSide
                        }))
                      }
                    >
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                    </select>
                  </label>

                  <label>
                    Entry price (c)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={item.entryPriceCents}
                      onChange={(event) =>
                        void updateWatchlistItem(item.ticker, (current) => {
                          const entryPriceCents = Math.max(
                            0,
                            Math.min(100, Number(event.target.value) || 0)
                          );

                          return {
                            ...current,
                            entryPriceCents,
                            amountRisked: roundCurrency(
                              current.contracts * (entryPriceCents / 100)
                            )
                          };
                        })
                      }
                    />
                  </label>

                  <label>
                    Contracts
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.contracts}
                      onChange={(event) =>
                        void updateWatchlistItem(item.ticker, (current) => {
                          const contracts = roundCurrency(Math.max(0, Number(event.target.value) || 0));

                          return {
                            ...current,
                            contracts,
                            amountRisked: roundCurrency(
                              contracts * (current.entryPriceCents / 100)
                            )
                          };
                        })
                      }
                    />
                  </label>

                  <label>
                    Amount risked ($)
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.amountRisked}
                      onChange={(event) =>
                        void updateWatchlistItem(item.ticker, (current) => ({
                          ...current,
                          amountRisked: roundCurrency(Math.max(0, Number(event.target.value) || 0)),
                          contracts:
                            current.entryPriceCents > 0
                              ? roundCurrency(
                                  Math.max(0, Number(event.target.value) || 0) /
                                    (current.entryPriceCents / 100)
                                )
                              : current.contracts
                        }))
                      }
                    />
                  </label>

                  <label className="field-span-2">
                    Notes
                    <input
                      value={item.notes}
                      placeholder="Optional note"
                      onChange={(event) =>
                        void updateWatchlistItem(item.ticker, (current) => ({
                          ...current,
                          notes: event.target.value
                        }))
                      }
                    />
                  </label>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
