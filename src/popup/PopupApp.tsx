import { useEffect, useMemo, useState } from "react";
import {
  BackendStatusResponse,
  backendApi,
  KalshiMarketsResponse
} from "../services/backendApi";
import {
  AppSettings,
  getAppSettings,
  getKalshiComboTrackers,
  getKalshiWatchlist,
  saveAppSettings,
  saveKalshiComboTrackers,
  saveKalshiWatchlist
} from "../shared/storage";
import {
  KalshiComboTracker,
  KalshiMarketSide,
  KalshiMarketSnapshot,
  KalshiSportFilterOption,
  KalshiWatchlistItem
} from "../shared/types";

interface ComboLegSearchGroup {
  query: string;
  markets: KalshiMarketSnapshot[];
  queryInfo: KalshiMarketsResponse["queryInfo"] | null;
}

type PopupTab = "combos" | "active" | "settled" | "archived";
type SearchDisplayGroup<T> = {
  label: string;
  items: T[];
  hiddenCount: number;
};

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

function formatDollars(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getDisplayTitle(item: { displayTitle?: string | null; title: string }): string {
  return item.displayTitle || item.title;
}

function getLifecycleLabel(market: KalshiMarketSnapshot): string {
  return market.lifecycleStatus ?? market.status ?? "unknown";
}

function getResultLabel(market: KalshiMarketSnapshot): string {
  if (!market.isResolved) {
    return "";
  }

  if (!market.resultKnown || !market.winningSide) {
    return "Finalized - result unknown";
  }

  return `Finalized - ${market.winningSide} won`;
}

function formatSearchExpansion(queryInfo: KalshiMarketsResponse["queryInfo"] | null): string {
  if (!queryInfo || queryInfo.expandedTerms.length === 0 || !queryInfo.originalQuery.trim()) {
    return "";
  }

  return `Showing results for: ${queryInfo.expandedTerms.slice(0, 8).join(", ")}`;
}

function formatDetectedTeams(queryInfo: KalshiMarketsResponse["queryInfo"] | null): string {
  if (!queryInfo || queryInfo.detectedTeams.length === 0) {
    return "";
  }

  const teams = queryInfo.detectedTeams
    .map((team) => `${team.team} (${team.sport})`)
    .join(", ");

  return queryInfo.detectedTeams.length > 1
    ? `Possible teams: ${teams}`
    : `Detected team: ${teams}`;
}

function getDefaultEntryPrice(side: KalshiMarketSide, market: KalshiMarketSnapshot): number {
  if (market.isResolved) {
    if (!market.resultKnown || !market.winningSide) {
      return 50;
    }

    return market.winningSide === side ? 100 : 0;
  }

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

function isComboLegEditable(leg: KalshiComboTracker["legs"][number]): boolean {
  if (leg.isResolved) {
    return false;
  }

  if (["closed", "finalized", "settled", "expired"].includes(String(leg.lifecycleStatus ?? leg.status ?? "").toLowerCase())) {
    return false;
  }

  if (leg.closeTime) {
    const closeTime = new Date(leg.closeTime).getTime();

    if (Number.isFinite(closeTime) && closeTime <= Date.now()) {
      return false;
    }
  }

  return true;
}

function getDraftComboEstimate(
  legs: KalshiComboTracker["legs"],
  amountRisked: number
): {
  probability: number | null;
  payout: number | null;
  profit: number | null;
} {
  if (legs.length === 0) {
    return {
      probability: null,
      payout: null,
      profit: null
    };
  }

  const probability = legs.reduce((product, leg) => product * (leg.entryPriceCents / 100), 1) * 100;
  const payout = probability > 0 ? amountRisked / (probability / 100) : null;

  return {
    probability,
    payout,
    profit: typeof payout === "number" ? payout - amountRisked : null
  };
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "--";
}

function getSearchDisplayGroups<T>(
  items: T[],
  hasQuery: boolean,
  defaultLabel = "Open markets"
): SearchDisplayGroup<T>[] {
  if (items.length === 0) {
    return [];
  }

  if (!hasQuery) {
    return [
      {
        label: defaultLabel,
        items,
        hiddenCount: 0
      }
    ];
  }

  const bestMatches = items.slice(0, 5);
  const relatedMarkets = items.slice(5, 12);
  const hiddenCount = Math.max(0, items.length - 12);

  return [
    {
      label: "Best matches",
      items: bestMatches,
      hiddenCount: 0
    },
    ...(relatedMarkets.length > 0
      ? [
          {
            label: "Related markets",
            items: relatedMarkets,
            hiddenCount
          }
        ]
      : hiddenCount > 0
        ? [
            {
              label: "Related markets",
              items: [],
              hiddenCount
            }
          ]
        : [])
  ];
}

function getComboValidationMessage(
  name: string,
  legs: KalshiComboTracker["legs"],
  amountRisked: number
): string {
  if (!name.trim()) {
    return "Enter a combo name.";
  }

  if (legs.length === 0) {
    return "Add at least one leg before saving.";
  }

  if (!Number.isFinite(amountRisked) || amountRisked <= 0) {
    return "Enter a valid amount risked.";
  }

  return "";
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
  const [comboTrackers, setComboTrackers] = useState<KalshiComboTracker[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatusResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [sportFilters, setSportFilters] = useState<KalshiSportFilterOption[]>([]);
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [searchResults, setSearchResults] = useState<KalshiMarketSnapshot[]>([]);
  const [searchQueryInfo, setSearchQueryInfo] = useState<KalshiMarketsResponse["queryInfo"] | null>(null);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchError, setSearchError] = useState("");
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newComboName, setNewComboName] = useState("");
  const [newComboAmountRisked, setNewComboAmountRisked] = useState(0);
  const [comboBuilderLegs, setComboBuilderLegs] = useState<KalshiComboTracker["legs"]>([]);
  const [comboLegSearchQuery, setComboLegSearchQuery] = useState("");
  const [comboLegSearchGroups, setComboLegSearchGroups] = useState<ComboLegSearchGroup[]>([]);
  const [comboLegSearchError, setComboLegSearchError] = useState("");
  const [comboSaveMessage, setComboSaveMessage] = useState("");
  const [isLoadingComboLegs, setIsLoadingComboLegs] = useState(false);
  const [hasSearchedComboLegs, setHasSearchedComboLegs] = useState(false);
  const [popupTab, setPopupTab] = useState<PopupTab>("combos");

  useEffect(() => {
    void Promise.all([
      getAppSettings(),
      getKalshiWatchlist(),
      getKalshiComboTrackers(),
      backendApi.getBackendStatus().catch(() => null),
      backendApi.getKalshiSportsFilters().catch(() => null),
      loadSearchResults("", "open").catch(() => null)
    ]).then(([nextSettings, nextWatchlist, nextComboTrackers, nextBackendStatus, nextSportFilters, initialResults]) => {
      const marketTrackerSettings =
        nextSettings.dataMode === "markets"
          ? nextSettings
          : {
              ...nextSettings,
              dataMode: "markets" as const
            };

      setSettings(marketTrackerSettings);
      setWatchlist(nextWatchlist);
      setComboTrackers(nextComboTrackers);
      setBackendStatus(nextBackendStatus);
      setSportFilters(nextSportFilters?.sports ?? []);

      if (initialResults) {
        setSearchResults(initialResults.markets);
        setSearchQueryInfo(initialResults.queryInfo ?? null);
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

  async function persistComboTrackers(next: KalshiComboTracker[]) {
    setComboTrackers(next);
    setIsSaving(true);
    await saveKalshiComboTrackers(next);
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
      setSearchQueryInfo(response.queryInfo ?? null);
      setSearchCursor(response.cursor);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
      setSearchResults([]);
      setSearchQueryInfo(null);
      setSearchCursor(null);
    } finally {
      setIsLoadingResults(false);
    }
  }

  const watchlistSummary = useMemo(() => {
    const visibleCount = watchlist.filter((item) => !item.archived && !item.hidden).length;

    if (visibleCount === 0) {
      return "No watched markets yet";
    }

    return `${visibleCount} watched market${visibleCount === 1 ? "" : "s"}`;
  }, [watchlist]);

  const comboSummary = useMemo(() => {
    const activeCombos = comboTrackers.filter((combo) => !combo.archived);

    if (activeCombos.length === 0) {
      return "No combos yet";
    }

    return `${activeCombos.length} combo tracker${activeCombos.length === 1 ? "" : "s"}`;
  }, [comboTrackers]);

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
  const searchDisplayGroups = getSearchDisplayGroups(
    resultsWithState,
    Boolean(searchQuery.trim())
  );
  const visibleWatchlist = watchlist.filter((item) => !item.archived && !item.hidden);
  const activeComboTrackers = comboTrackers.filter((combo) => !combo.archived);
  const savedComboTrackers = activeComboTrackers.filter((combo) => combo.legs.length > 0);
  const archivedWatchlist = watchlist.filter((item) => item.archived || item.hidden);
  const archivedComboTrackers = comboTrackers.filter((combo) => combo.archived);
  const draftComboEstimate = getDraftComboEstimate(comboBuilderLegs, newComboAmountRisked);
  const comboValidationMessage = getComboValidationMessage(
    newComboName,
    comboBuilderLegs,
    newComboAmountRisked
  );

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

  async function restoreWatchlistItem(ticker: string) {
    await persistWatchlist(
      watchlist.map((item) =>
        item.ticker === ticker
          ? {
              ...item,
              hidden: false,
              hiddenAt: null,
              archived: false,
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
  }

  async function createComboTracker() {
    const name = newComboName.trim();
    const validationMessage = getComboValidationMessage(
      name,
      comboBuilderLegs,
      newComboAmountRisked
    );

    if (validationMessage) {
      setComboSaveMessage(validationMessage);
      return;
    }

    const now = new Date().toISOString();
    const nextCombo: KalshiComboTracker = {
      id: `combo-${Date.now()}`,
      name,
      amountRisked: roundCurrency(Math.max(0, newComboAmountRisked)),
      legs: comboBuilderLegs,
      archived: false,
      createdAt: now,
      updatedAt: now
    };

    setNewComboName("");
    setNewComboAmountRisked(0);
    setComboBuilderLegs([]);
    setComboLegSearchQuery("");
    setComboLegSearchGroups([]);
    setHasSearchedComboLegs(false);
    setComboSaveMessage("");
    await persistComboTrackers([...comboTrackers, nextCombo]);
  }

  async function runComboLegSearch(nextQuery = comboLegSearchQuery) {
    const query = nextQuery.trim();

    if (!query) {
      setComboLegSearchGroups([]);
      setComboLegSearchError("");
      setHasSearchedComboLegs(false);
      return;
    }

    setIsLoadingComboLegs(true);
    setHasSearchedComboLegs(true);
    setComboLegSearchError("");

    try {
      const queries = query
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 4);
      const responses = await Promise.all(
        queries.map(async (part) => ({
          query: part,
          response: await loadSearchResults(part, "open", "", "", "")
        }))
      );

      setComboLegSearchGroups(
        responses.map(({ query: groupQuery, response }) => ({
          query: groupQuery,
          markets: response.markets.slice(0, 12),
          queryInfo: response.queryInfo ?? null
        }))
      );
    } catch (error) {
      setComboLegSearchError(error instanceof Error ? error.message : "Combo leg search failed");
      setComboLegSearchGroups([]);
    } finally {
      setIsLoadingComboLegs(false);
    }
  }

  function addMarketToComboBuilder(market: KalshiMarketSnapshot, side: KalshiMarketSide) {
    if (comboBuilderLegs.some((leg) => leg.ticker === market.ticker && leg.userSide === side)) {
      return;
    }

    const now = new Date().toISOString();
    setComboSaveMessage("");
    setComboBuilderLegs((current) => [
      ...current,
      {
        id: `leg-${market.ticker}-${side}-${Date.now()}`,
        ticker: market.ticker,
        eventTicker: market.eventTicker ?? null,
        title: market.title,
        displayTitle: market.displayTitle ?? null,
        subtitle: market.subtitle ?? null,
        sport: market.sport ?? null,
        competition: market.competition ?? null,
        status: market.status ?? null,
        lifecycleStatus: market.lifecycleStatus,
        isResolved: Boolean(market.isResolved),
        closeTime: market.closeTime ?? null,
        userSide: side,
        entryPriceCents: getDefaultEntryPrice(side, market),
        notes: "",
        addedAt: now
      }
    ]);
  }

  function updateComboBuilderLeg(
    legId: string,
    updater: (leg: KalshiComboTracker["legs"][number]) => KalshiComboTracker["legs"][number]
  ) {
    setComboBuilderLegs((current) =>
      current.map((leg) => (leg.id === legId ? updater(leg) : leg))
    );
  }

  function removeComboBuilderLeg(legId: string) {
    setComboBuilderLegs((current) => current.filter((leg) => leg.id !== legId));
  }

  async function updateComboTracker(
    comboId: string,
    updater: (combo: KalshiComboTracker) => KalshiComboTracker
  ) {
    await persistComboTrackers(
      comboTrackers.map((combo) =>
        combo.id === comboId
          ? {
              ...updater(combo),
              updatedAt: new Date().toISOString()
            }
          : combo
      )
    );
  }

  async function archiveComboTracker(comboId: string) {
    await updateComboTracker(comboId, (combo) => ({
      ...combo,
      archived: true
    }));
  }

  async function removeComboTracker(comboId: string) {
    await archiveComboTracker(comboId);
  }

  async function restoreComboTracker(comboId: string) {
    await updateComboTracker(comboId, (combo) => ({
      ...combo,
      archived: false
    }));
  }

  async function removeComboLeg(comboId: string, legId: string) {
    await updateComboTracker(comboId, (combo) => ({
      ...combo,
      legs: combo.legs.filter((leg) => leg.id !== legId)
    }));
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

      <nav className="popup-tabs" aria-label="Tracker sections">
        {[
          ["combos", "Combos"],
          ["active", "Active"],
          ["settled", "Settled"],
          ["archived", "Archived"]
        ].map(([tab, label]) => (
          <button
            type="button"
            className={popupTab === tab ? "active" : ""}
            key={tab}
            onClick={() => setPopupTab(tab as PopupTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className={`panel settings-panel ${popupTab === "active" ? "" : "is-hidden"}`}>
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

      <section className={`panel search-panel ${popupTab === "active" ? "" : "is-hidden"}`}>
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
        {formatSearchExpansion(searchQueryInfo) ? (
          <div className="search-explain">{formatSearchExpansion(searchQueryInfo)}</div>
        ) : null}
        {formatDetectedTeams(searchQueryInfo) ? (
          <div className="search-explain">{formatDetectedTeams(searchQueryInfo)}</div>
        ) : null}

        <div className="positions-list">
          {resultsWithState.length === 0 ? (
            <article className="position-card">
              <div className="position-note">
                {searchQuery.trim()
                  ? "No relevant markets found."
                  : "No markets matched this search. Try a broader title, a ticker fragment, or a different status filter."}
              </div>
            </article>
          ) : (
            searchDisplayGroups.map((group) => (
              <div className="search-result-group" key={group.label}>
                <div className="section-mini-title">{group.label}</div>
                {group.items.map(({ market, isWatched }) => (
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
                      <span>{[market.sport, market.competition, market.scope].filter(Boolean).join(" · ") || getLifecycleLabel(market)}</span>
                    </div>
                    <div className="position-meta">
                      <span>{market.eventTitle ?? market.eventTicker ?? "Kalshi market"}</span>
                      <span>{getLifecycleLabel(market)}</span>
                    </div>
                    {market.isResolved && !market.resultKnown ? (
                      <div className="position-note">{getResultLabel(market)}</div>
                    ) : (
                      <div className="position-pricing">
                        <span>YES {formatPrice(market.yesBidCents)} / {formatPrice(market.yesAskCents)}</span>
                        <span>NO {formatPrice(market.noBidCents)} / {formatPrice(market.noAskCents)}</span>
                      </div>
                    )}
                    {market.isResolved ? (
                      <div className="position-note">
                        {getResultLabel(market)}. This market will appear under Settled / Finalized markets in the overlay.
                      </div>
                    ) : null}
                    <div className="position-meta">
                      <span>Last {formatPrice(market.lastPriceCents)}</span>
                      <span>Volume {formatVolume(market.volume)}</span>
                    </div>
                  </article>
                ))}
                {group.hiddenCount > 0 ? (
                  <div className="position-note">Weak matches hidden by default: {group.hiddenCount}</div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {searchCursor ? <div className="small-copy">More results are available through Kalshi pagination; this popup is currently showing the first page.</div> : null}
      </section>

      <section className={`panel combo-panel ${popupTab === "combos" ? "" : "is-hidden"}`}>
        <div className="panel-header">
          <h2>Combo Builder</h2>
          <span className="small-copy">{comboSummary}</span>
        </div>

        <div className="combo-builder">
          <div className="combo-builder-head">
            <label>
              Combo name
              <input
                value={newComboName}
                placeholder="Spurs + Castle assists"
                onChange={(event) => setNewComboName(event.target.value)}
              />
            </label>
            <label>
              Amount risked ($)
              <input
                type="number"
                min={0}
                step={0.01}
                value={newComboAmountRisked}
                onChange={(event) =>
                  setNewComboAmountRisked(roundCurrency(Math.max(0, Number(event.target.value) || 0)))
                }
              />
            </label>
          </div>

          <label>
            Search market for combo leg
            <div className="combo-search-row">
              <input
                value={comboLegSearchQuery}
                placeholder="spurs win, stephon castle assists"
                onChange={(event) => setComboLegSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void runComboLegSearch();
                  }
                }}
              />
              <button type="button" className="primary-button" onClick={() => void runComboLegSearch()}>
                Search
              </button>
            </div>
          </label>

          {comboLegSearchError ? <div className="error-copy">{comboLegSearchError}</div> : null}
          <div className="combo-search-results">
            {isLoadingComboLegs ? <div className="position-note">Searching Kalshi markets...</div> : null}
            {!isLoadingComboLegs && comboLegSearchGroups.length === 0 ? (
              <div className="position-note">
                {hasSearchedComboLegs
                  ? "No relevant markets found."
                  : "Search for a market to add a combo leg."}
              </div>
            ) : (
              comboLegSearchGroups.map((group) => (
                <div className="combo-result-group" key={group.query}>
                  <div className="section-mini-title">Results for "{group.query}"</div>
                  {formatSearchExpansion(group.queryInfo) ? (
                    <div className="search-explain">{formatSearchExpansion(group.queryInfo)}</div>
                  ) : null}
                  {formatDetectedTeams(group.queryInfo) ? (
                    <div className="search-explain">{formatDetectedTeams(group.queryInfo)}</div>
                  ) : null}
                  {group.markets.length === 0 ? (
                    <div className="position-note">No relevant markets found.</div>
                  ) : (
                    getSearchDisplayGroups(group.markets, true).map((displayGroup) => (
                      <div className="search-result-group" key={`${group.query}-${displayGroup.label}`}>
                        <div className="section-mini-title">{displayGroup.label}</div>
                        {displayGroup.items.map((market) => (
                          <article className="combo-result-card" key={`${group.query}-${market.ticker}`}>
                            <div className="position-topline">
                              <span className="market" title={getDisplayTitle(market)}>{getDisplayTitle(market)}</span>
                              <span className="small-copy">{[market.sport, market.competition].filter(Boolean).join(" · ") || getLifecycleLabel(market)}</span>
                            </div>
                            <div className="position-meta">
                              <span>{market.eventTitle ?? market.eventTicker ?? market.ticker}</span>
                              <span>{getLifecycleLabel(market)}</span>
                            </div>
                            <div className="position-pricing">
                              <span>YES {formatPrice(market.yesBidCents)} / {formatPrice(market.yesAskCents)}</span>
                              <span>NO {formatPrice(market.noBidCents)} / {formatPrice(market.noAskCents)}</span>
                            </div>
                            <div className="combo-result-actions">
                              <button
                                type="button"
                                className="inline-button"
                                onClick={() => addMarketToComboBuilder(market, "YES")}
                              >
                                Add YES
                              </button>
                              <button
                                type="button"
                                className="inline-button"
                                onClick={() => addMarketToComboBuilder(market, "NO")}
                              >
                                Add NO
                              </button>
                            </div>
                          </article>
                        ))}
                        {displayGroup.hiddenCount > 0 ? (
                          <div className="position-note">Weak matches hidden by default: {displayGroup.hiddenCount}</div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
          </div>

          <div className="combo-builder-footer">
            <div>
              <div className="section-mini-title">Current legs</div>
              <div className="small-copy">{comboBuilderLegs.length} leg{comboBuilderLegs.length === 1 ? "" : "s"} ready to save</div>
              {comboSaveMessage ? <div className="error-copy">{comboSaveMessage}</div> : null}
            </div>
            <div className="combo-slip-estimates">
              <span>Chance {formatPercent(draftComboEstimate.probability)}</span>
              <span>Pays {formatDollars(draftComboEstimate.payout)}</span>
              <span>Profit {formatDollars(draftComboEstimate.profit)}</span>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(comboValidationMessage)}
              onClick={() => void createComboTracker()}
              title={comboValidationMessage || "Save combo"}
            >
              Save combo
            </button>
          </div>

          {comboBuilderLegs.length === 0 ? (
            <div className="position-note">Add YES or NO legs from search results above.</div>
          ) : (
            <>
              <div className="position-note">Estimated; markets may be correlated.</div>
              {comboBuilderLegs.map((leg) => (
                <div className="combo-leg-editor" key={leg.id}>
                  <div className="position-topline">
                    <span className="market">{leg.displayTitle || leg.title}</span>
                    <button
                      type="button"
                      className="inline-button muted-button"
                      onClick={() => removeComboBuilderLeg(leg.id)}
                    >
                      Remove leg
                    </button>
                  </div>
                  <div className="position-meta">
                    <span>{leg.ticker}</span>
                    <span>{[leg.sport, leg.competition].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="field-grid compact-grid">
                    <label>
                      Side
                      <select
                        value={leg.userSide}
                        onChange={(event) =>
                          updateComboBuilderLeg(leg.id, (currentLeg) => ({
                            ...currentLeg,
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
                        value={leg.entryPriceCents}
                        onChange={(event) =>
                          updateComboBuilderLeg(leg.id, (currentLeg) => ({
                            ...currentLeg,
                            entryPriceCents: Math.max(0, Math.min(100, Number(event.target.value) || 0))
                          }))
                        }
                      />
                    </label>
                    <label>
                      Notes
                      <input
                        value={leg.notes}
                        placeholder="Optional note"
                        onChange={(event) =>
                          updateComboBuilderLeg(leg.id, (currentLeg) => ({
                            ...currentLeg,
                            notes: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="positions-list">
          {savedComboTrackers.length === 0 ? (
            <article className="position-card">
              <div className="position-note">Saved combos will appear here and in the overlay.</div>
            </article>
          ) : (
            savedComboTrackers.map((combo) => (
                <article className="position-card" key={combo.id}>
	                  <div className="position-topline">
	                    <span className="market">{combo.name}</span>
	                    <div className="combo-result-actions">
	                      <button
	                        type="button"
	                        className="inline-button muted-button"
	                        onClick={() => void archiveComboTracker(combo.id)}
	                      >
	                        Archive
	                      </button>
	                      <button
	                        type="button"
	                        className="inline-button muted-button"
	                        onClick={() => void removeComboTracker(combo.id)}
	                      >
	                        Remove
	                      </button>
	                    </div>
	                  </div>
                  <div className="position-meta">
                    <span>{combo.legs.length} leg{combo.legs.length === 1 ? "" : "s"}</span>
                    <span>Risk {formatDollars(combo.amountRisked)}</span>
                  </div>
                  <div className="field-grid single-column">
                    <label>
                      Combo amount risked ($)
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={combo.amountRisked}
                        onChange={(event) =>
                          void updateComboTracker(combo.id, (currentCombo) => ({
                            ...currentCombo,
                            amountRisked: roundCurrency(Math.max(0, Number(event.target.value) || 0))
                          }))
                        }
                      />
                    </label>
                  </div>
                  {combo.legs.map((leg) => (
                    <div className="combo-leg-editor" key={leg.id}>
                      <div className="position-topline">
                        <span className="market">{leg.displayTitle || leg.title}</span>
                        {isComboLegEditable(leg) ? (
                          <button
                            type="button"
                            className="inline-button muted-button"
                            onClick={() => void removeComboLeg(combo.id, leg.id)}
                          >
                            Remove leg
                          </button>
                        ) : (
                          <span className="small-copy">Locked - market started/closed</span>
                        )}
                      </div>
                      {isComboLegEditable(leg) ? (
                        <div className="field-grid compact-grid">
                          <label>
                            Side
                            <select
                              value={leg.userSide}
                              onChange={(event) =>
                                void updateComboTracker(combo.id, (currentCombo) => ({
                                  ...currentCombo,
                                  legs: currentCombo.legs.map((currentLeg) =>
                                    currentLeg.id === leg.id
                                      ? {
                                          ...currentLeg,
                                          userSide: event.target.value as KalshiMarketSide
                                        }
                                      : currentLeg
                                  )
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
                              value={leg.entryPriceCents}
                              onChange={(event) =>
                                void updateComboTracker(combo.id, (currentCombo) => ({
                                  ...currentCombo,
                                  legs: currentCombo.legs.map((currentLeg) =>
                                    currentLeg.id === leg.id
                                      ? {
                                          ...currentLeg,
                                          entryPriceCents: Math.max(0, Math.min(100, Number(event.target.value) || 0))
                                        }
                                      : currentLeg
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field-span-2">
                            Notes
                            <input
                              value={leg.notes}
                              placeholder="Optional note"
                              onChange={(event) =>
                                void updateComboTracker(combo.id, (currentCombo) => ({
                                  ...currentCombo,
                                  legs: currentCombo.legs.map((currentLeg) =>
                                    currentLeg.id === leg.id
                                      ? {
                                          ...currentLeg,
                                          notes: event.target.value
                                        }
                                      : currentLeg
                                  )
                                }))
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="position-meta">
                          <span>{leg.userSide} · entry {formatPrice(leg.entryPriceCents)}</span>
                          <span>{leg.status ?? leg.lifecycleStatus ?? "locked"}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </article>
              ))
          )}
        </div>
      </section>

      <section className={`panel watchlist-panel ${popupTab === "active" ? "" : "is-hidden"}`}>
        <div className="panel-header">
          <h2>Watchlist</h2>
          <span className="small-copy">{watchlistSummary}</span>
        </div>

        <div className="positions-list">
          {visibleWatchlist.length === 0 ? (
            <article className="position-card">
              <div className="position-note">Add a Kalshi market above to start tracking it in the overlay.</div>
            </article>
          ) : (
            visibleWatchlist.map((item) => (
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

      <section className={`panel settled-panel ${popupTab === "settled" ? "" : "is-hidden"}`}>
        <div className="panel-header">
          <h2>Settled Markets</h2>
          <button
            type="button"
            className="inline-button muted-button"
            onClick={() =>
              void persistWatchlist(
                watchlist.map((item) => ({
                  ...item,
                  archived: item.archived || item.hidden,
                  updatedAt: item.archived || item.hidden ? item.updatedAt : new Date().toISOString()
                }))
              )
            }
          >
            Archive all settled
          </button>
        </div>
        <div className="positions-list">
          <article className="position-card">
            <div className="position-note">
              Settled markets are shown in the overlay card view when Kalshi marks a watched market finalized or settled. Use Archive from the overlay settled section to hide individual settled cards.
            </div>
          </article>
        </div>
      </section>

      <section className={`panel archived-panel ${popupTab === "archived" ? "" : "is-hidden"}`}>
        <div className="panel-header">
          <h2>Archived</h2>
          <span className="small-copy">
            {archivedWatchlist.length + archivedComboTrackers.length} archived item{archivedWatchlist.length + archivedComboTrackers.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="positions-list">
          {archivedWatchlist.length === 0 && archivedComboTrackers.length === 0 ? (
            <article className="position-card">
              <div className="position-note">Archived markets and combos will appear here.</div>
            </article>
          ) : null}
          {archivedComboTrackers.map((combo) => (
            <article className="position-card" key={combo.id}>
              <div className="position-topline">
                <span className="market">{combo.name}</span>
                <button
                  type="button"
                  className="inline-button"
                  onClick={() => void restoreComboTracker(combo.id)}
                >
                  Restore
                </button>
              </div>
              <div className="position-meta">
                <span>{combo.legs.length} leg{combo.legs.length === 1 ? "" : "s"}</span>
                <span>Risk {formatDollars(combo.amountRisked)}</span>
              </div>
            </article>
          ))}
          {archivedWatchlist.map((item) => (
            <article className="position-card" key={item.ticker}>
              <div className="position-topline">
                <span className="market">{getDisplayTitle(item)}</span>
                <button
                  type="button"
                  className="inline-button"
                  onClick={() => void restoreWatchlistItem(item.ticker)}
                >
                  Restore
                </button>
              </div>
              <div className="position-meta">
                <span>{item.ticker}</span>
                <span>{item.eventTicker ?? "Kalshi market"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
