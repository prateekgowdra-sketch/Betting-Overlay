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
  getResearchPaperTrades,
  getResearchSettings,
  getKalshiWatchlist,
  saveAppSettings,
  saveKalshiComboTrackers,
  saveResearchPaperTrades,
  saveResearchSettings,
  saveKalshiWatchlist
} from "../shared/storage";
import {
  calculatePaperTrade,
  getPaperTradeExitScenarios,
  exportResearchTradesAsCsv,
  exportResearchTradesAsJson,
  generateResearchPick,
  MODEL_VERSION,
  settlePaperTrade,
  summarizePaperTrades
} from "../shared/research";
import {
  KalshiComboTracker,
  KalshiMarketSide,
  KalshiMarketSnapshot,
  KalshiSportFilterOption,
  KalshiWatchlistItem,
  ResearchPaperTrade,
  ResearchSettings
} from "../shared/types";

interface ComboLegSearchGroup {
  query: string;
  markets: KalshiMarketSnapshot[];
  queryInfo: KalshiMarketsResponse["queryInfo"] | null;
}

type PopupTab = "combos" | "active" | "research" | "settled" | "archived";
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

function formatValueLabel(label: string): string {
  if (label === "Positive EV") {
    return "Good value";
  }

  if (label === "Negative EV") {
    return "Poor value";
  }

  return label === "Neutral" ? "Fair price" : label;
}

function formatValueExplanation(pick: {
  side: KalshiMarketSide;
  modelProbabilityPercent: number | null;
  currentPriceCents: number | null;
  netEdgePercent: number | null;
}): string {
  return `${pick.side} value: model ${formatPercent(pick.modelProbabilityPercent)} vs price ${formatPrice(pick.currentPriceCents)} after buffer ${formatSignedPercent(pick.netEdgePercent)}`;
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

function formatSignedPercent(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
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

async function loadResearchSearchResults(query: string, scope = ""): Promise<KalshiMarketsResponse> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      mode: "real",
      environment: "production",
      markets: [],
      cursor: null,
      queryInfo: {
        originalQuery: "",
        expandedTerms: [],
        detectedTeams: [],
        detectedSports: [],
        resultCount: 0
      }
    };
  }

  try {
    const sportsResponse = await loadSearchResults(trimmedQuery, "open", "", "", scope);

    if (sportsResponse.markets.length > 0) {
      return sportsResponse;
    }
  } catch {
    // Fall back to the generic market search below.
  }

  const fallbackResponse = await backendApi.getKalshiMarkets({
    limit: 30,
    status: "open",
    query: trimmedQuery
  });

  return scope
    ? {
        ...fallbackResponse,
        markets: fallbackResponse.markets.filter((market) => market.scope === scope)
      }
    : fallbackResponse;
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
  const [researchSettings, setResearchSettings] = useState<ResearchSettings | null>(null);
  const [researchSearchQuery, setResearchSearchQuery] = useState("");
  const [researchSearchScope, setResearchSearchScope] = useState("");
  const [researchSearchResults, setResearchSearchResults] = useState<KalshiMarketSnapshot[]>([]);
  const [researchSearchQueryInfo, setResearchSearchQueryInfo] = useState<KalshiMarketsResponse["queryInfo"] | null>(null);
  const [researchSearchError, setResearchSearchError] = useState("");
  const [isLoadingResearchResults, setIsLoadingResearchResults] = useState(false);
  const [paperTrades, setPaperTrades] = useState<ResearchPaperTrade[]>([]);
  const [paperTradeExitPrices, setPaperTradeExitPrices] = useState<Record<string, string>>({});
  const [confirmPaperTradeTicker, setConfirmPaperTradeTicker] = useState<string | null>(null);
  const [confirmPaperTradeRisk, setConfirmPaperTradeRisk] = useState("");
  const [popupTab, setPopupTab] = useState<PopupTab>("combos");

  useEffect(() => {
    void Promise.all([
      getAppSettings(),
      getKalshiWatchlist(),
      getKalshiComboTrackers(),
      getResearchSettings(),
      getResearchPaperTrades(),
      backendApi.getBackendStatus().catch(() => null),
      backendApi.getKalshiSportsFilters().catch(() => null),
      loadSearchResults("", "open").catch(() => null)
    ]).then(([nextSettings, nextWatchlist, nextComboTrackers, nextResearchSettings, nextPaperTrades, nextBackendStatus, nextSportFilters, initialResults]) => {
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
      setResearchSettings(nextResearchSettings);
      setPaperTrades(nextPaperTrades);
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

  async function persistResearchSettings(next: ResearchSettings) {
    const safeSettings: ResearchSettings = {
      ...next,
      enableRealTrading: false
    };

    setResearchSettings(safeSettings);
    setIsSaving(true);
    await saveResearchSettings(safeSettings);
    setIsSaving(false);
  }

  async function persistPaperTrades(next: ResearchPaperTrade[]) {
    setPaperTrades(next);
    setIsSaving(true);
    await saveResearchPaperTrades(next);
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

  async function runResearchSearch(nextQuery = researchSearchQuery, nextScope = researchSearchScope) {
    setIsLoadingResearchResults(true);
    setResearchSearchError("");

    try {
      const response = await loadResearchSearchResults(nextQuery, nextScope);
      setResearchSearchResults(response.markets);
      setResearchSearchQueryInfo(response.queryInfo ?? null);
    } catch (error) {
      setResearchSearchError(error instanceof Error ? error.message : "Research search failed");
      setResearchSearchResults([]);
      setResearchSearchQueryInfo(null);
    } finally {
      setIsLoadingResearchResults(false);
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

  if (!settings || !researchSettings) {
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
  const researchPicks = researchSearchResults
    .filter((market) => !market.isResolved)
    .map((market) => generateResearchPick(market, researchSettings))
    .sort(
      (a, b) =>
        (b.bestBetScore ?? -Infinity) - (a.bestBetScore ?? -Infinity) ||
        (b.netEdgePercent ?? -Infinity) - (a.netEdgePercent ?? -Infinity)
    )
    .slice(0, 10);
  const bestResearchPick = researchPicks.reduce<(typeof researchPicks)[number] | null>(
    (bestPick, pick) =>
      !bestPick || (pick.bestBetScore ?? -Infinity) > (bestPick.bestBetScore ?? -Infinity)
        ? pick
        : bestPick,
    null
  );
  const arbScannerPicks = researchPicks
    .filter(
      (pick) =>
        pick.arb.isOpportunity ||
        (typeof pick.arb.netArbCents === "number" && pick.arb.netArbCents > -2)
    )
    .slice(0, 5);
  const paperTradeAnalytics = summarizePaperTrades(paperTrades);
  const paperTradeStats = paperTradeAnalytics.stats;
  const confirmPaperTradePick =
    researchPicks.find((pick) => pick.marketTicker === confirmPaperTradeTicker) ?? null;
  const confirmPaperTradeCalculation =
    confirmPaperTradePick &&
    typeof confirmPaperTradePick.currentPriceCents === "number" &&
    typeof confirmPaperTradePick.modelProbabilityPercent === "number"
      ? calculatePaperTrade(
          confirmPaperTradePick.side,
          confirmPaperTradePick.currentPriceCents,
          confirmPaperTradePick.modelProbabilityPercent,
          Number(confirmPaperTradeRisk)
        )
      : null;
  const confirmPaperTradeScenarios =
    confirmPaperTradeCalculation && confirmPaperTradePick
      ? getPaperTradeExitScenarios(
          confirmPaperTradeCalculation,
          confirmPaperTradePick.ev.modelProbabilityPercent
        )
      : [];

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

  function startPaperTradePreview(pick: (typeof researchPicks)[number]) {
    setConfirmPaperTradeTicker(pick.marketTicker);
    setConfirmPaperTradeRisk(String(Math.max(0, researchSettings?.maxPaperTradeDollars ?? 0)));
  }

  async function addPaperTradeFromPick(pick: (typeof researchPicks)[number]) {
    if (
      typeof pick.currentPriceCents !== "number" ||
      typeof pick.modelProbabilityPercent !== "number" ||
      !confirmPaperTradeCalculation
    ) {
      return;
    }

    const now = new Date().toISOString();
    const nextTrade: ResearchPaperTrade = {
      id: `paper-${pick.marketTicker}-${Date.now()}`,
      timestamp: now,
      marketTicker: pick.marketTicker,
      marketTitle: pick.marketTitle,
      side: pick.side,
      entryPriceCents: pick.currentPriceCents,
      modelProbabilityPercent: pick.modelProbabilityPercent,
      winProbabilityPercent: confirmPaperTradeCalculation.winProbabilityPercent,
      hitRating: pick.hitRating,
      bestBetScore: pick.bestBetScore,
      edgePercent: pick.edgePercent ?? 0,
      netEdgePercent: pick.netEdgePercent,
      suggestedRiskDollars: confirmPaperTradeCalculation.actualCostDollars,
      riskInputDollars: confirmPaperTradeCalculation.riskInputDollars,
      contracts: confirmPaperTradeCalculation.contracts,
      actualCostDollars: confirmPaperTradeCalculation.actualCostDollars,
      maxProfitDollars: confirmPaperTradeCalculation.maxProfitDollars,
      maxLossDollars: confirmPaperTradeCalculation.maxLossDollars,
      expectedValueDollars: confirmPaperTradeCalculation.expectedValueDollars,
      expectedRoiPercent: confirmPaperTradeCalculation.expectedRoiPercent,
      status: "open",
      marketCategory: pick.marketCategory,
      modelReason: pick.reason,
      positiveSignal: pick.positiveSignal,
      negativeSignal: pick.negativeSignal,
      source: pick.source,
      exitValueCents: null,
      exitPriceCents: null,
      exitValueDollars: null,
      profitLossDollars: null,
      realizedPnlDollars: null,
      settlementResult: null,
      modelVersion: MODEL_VERSION,
      settledAt: null
    };

    await persistPaperTrades([nextTrade, ...paperTrades]);
    setConfirmPaperTradeTicker(null);
    setConfirmPaperTradeRisk("");
  }

  async function settlePaperTradeManually(trade: ResearchPaperTrade, exitValueCents: number) {
    await persistPaperTrades(
      paperTrades.map((currentTrade) =>
        currentTrade.id === trade.id
          ? settlePaperTrade(currentTrade, exitValueCents)
          : currentTrade
      )
    );
  }

  async function removePaperTrade(tradeId: string) {
    await persistPaperTrades(paperTrades.filter((trade) => trade.id !== tradeId));
    setPaperTradeExitPrices((current) => {
      const next = { ...current };
      delete next[tradeId];
      return next;
    });
  }

  function downloadResearchExport(format: "json" | "csv") {
    const content =
      format === "json"
        ? exportResearchTradesAsJson(paperTrades)
        : exportResearchTradesAsCsv(paperTrades);
    const mimeType = format === "json" ? "application/json" : "text/csv";
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kalshi-paper-trades.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importResearchTrades(file: File | null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = JSON.parse(text) as { trades?: ResearchPaperTrade[] } | ResearchPaperTrade[];
    const importedTrades = Array.isArray(parsed) ? parsed : parsed.trades;

    if (!Array.isArray(importedTrades)) {
      return;
    }

    await persistPaperTrades([...importedTrades, ...paperTrades]);
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
          ["research", "Research"],
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

      <section className={`panel research-panel ${popupTab === "research" ? "" : "is-hidden"}`}>
        <div className="panel-header">
          <h2>Research Mode</h2>
          <span className="status-pill mock">Paper only</span>
        </div>

        <div className="research-banner">
          Real trading is disabled. This mode only calculates EV, flags possible arbitrage, generates picks, and saves paper trades.
        </div>

        <div className="research-search-panel">
          <div className="panel-header compact-header">
            <h3>Research Markets</h3>
            <span className="small-copy">
              {isLoadingResearchResults ? "Searching..." : `${researchSearchResults.length} result${researchSearchResults.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <form
            className="search-row research-search-row"
            onSubmit={(event) => {
              event.preventDefault();
              void runResearchSearch(researchSearchQuery, researchSearchScope);
            }}
          >
            <input
              value={researchSearchQuery}
              placeholder="Search teams, players, or props"
              onChange={(event) => setResearchSearchQuery(event.target.value)}
            />
            <select
              value={researchSearchScope}
              onChange={(event) => {
                const nextScope = event.target.value;
                setResearchSearchScope(nextScope);
                if (researchSearchQuery.trim()) {
                  void runResearchSearch(researchSearchQuery, nextScope);
                }
              }}
            >
              <option value="">All markets</option>
              <option value="team">Team/game lines</option>
              <option value="player">Player props</option>
            </select>
            <button type="submit" disabled={isLoadingResearchResults}>
              Search
            </button>
          </form>
          {researchSearchError ? <div className="error-copy">{researchSearchError}</div> : null}
          {formatSearchExpansion(researchSearchQueryInfo) ? (
            <div className="search-explain">{formatSearchExpansion(researchSearchQueryInfo)}</div>
          ) : null}
          {formatDetectedTeams(researchSearchQueryInfo) ? (
            <div className="search-explain">{formatDetectedTeams(researchSearchQueryInfo)}</div>
          ) : null}
        </div>

        <div className="field-grid research-settings-grid">
          <label>
            Model anchor
            <input value="Market price" readOnly />
          </label>
          <label>
            Fee/slippage buffer (%)
            <input
              type="number"
              min={0}
              step={0.1}
              value={researchSettings.feeSlippageBufferPercent}
              onChange={(event) =>
                void persistResearchSettings({
                  ...researchSettings,
                  feeSlippageBufferPercent: Math.max(0, Number(event.target.value) || 0)
                })
              }
            />
          </label>
          <label>
            Minimum edge (%)
            <input
              type="number"
              min={0}
              step={0.1}
              value={researchSettings.minimumEdgePercent}
              onChange={(event) =>
                void persistResearchSettings({
                  ...researchSettings,
                  minimumEdgePercent: Math.max(0, Number(event.target.value) || 0)
                })
              }
            />
          </label>
          <label>
            Max paper trade ($)
            <input
              type="number"
              min={0}
              step={0.5}
              value={researchSettings.maxPaperTradeDollars}
              onChange={(event) =>
                void persistResearchSettings({
                  ...researchSettings,
                  maxPaperTradeDollars: roundCurrency(Math.max(0, Number(event.target.value) || 0))
                })
              }
            />
          </label>
          <label>
            Max daily risk ($)
            <input
              type="number"
              min={0}
              step={1}
              value={researchSettings.maxDailyRiskDollars}
              onChange={(event) =>
                void persistResearchSettings({
                  ...researchSettings,
                  maxDailyRiskDollars: roundCurrency(Math.max(0, Number(event.target.value) || 0))
                })
              }
            />
          </label>
          <label>
            Real trading
            <input value={researchSettings.enableRealTrading ? "Enabled" : "Disabled"} readOnly />
          </label>
        </div>

        <div className="research-summary-grid">
          <div className="stat-card">
            <div>
              <div className="stat-label">Best bet</div>
              <div className="stat-value">{bestResearchPick?.bestBetScore ? `${bestResearchPick.bestBetScore.toFixed(1)}/10` : "--"}</div>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-label">Paper P/L</div>
              <div className="stat-value">{formatDollars(paperTradeStats.totalProfitLossDollars)}</div>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-label">ROI</div>
              <div className="stat-value">{formatSignedPercent(paperTradeStats.roiPercent)}</div>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-label">Win rate</div>
              <div className="stat-value">{formatPercent(paperTradeStats.winRatePercent)}</div>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-label">Trades</div>
              <div className="stat-value">{paperTradeStats.tradeCount}</div>
            </div>
          </div>
        </div>

        <div className="research-metric-grid research-detail-stats">
          <span>Avg entry <strong>{formatPrice(paperTradeStats.averageEntryPriceCents)}</strong></span>
          <span>Avg model <strong>{formatPercent(paperTradeStats.averageModelProbabilityPercent)}</strong></span>
          <span>Avg best bet <strong>{typeof paperTradeStats.averageBestBetScore === "number" ? `${paperTradeStats.averageBestBetScore.toFixed(1)}/10` : "--"}</strong></span>
          <span>Avg edge <strong>{formatSignedPercent(paperTradeStats.averageEdgePercent)}</strong></span>
          <span>Avg net <strong>{formatSignedPercent(paperTradeStats.averageNetEdgePercent)}</strong></span>
          <span>Total cost <strong>{formatDollars(paperTradeStats.totalDollarsRisked)}</strong></span>
          <span>Avg exp ROI <strong>{formatSignedPercent(paperTradeStats.averageExpectedRoiPercent)}</strong></span>
          <span>Best <strong>{formatDollars(paperTradeStats.bestTrade?.profitLossDollars)}</strong></span>
          <span>Worst <strong>{formatDollars(paperTradeStats.worstTrade?.profitLossDollars)}</strong></span>
        </div>

        <div className="research-export-row">
          <button type="button" className="inline-button" onClick={() => downloadResearchExport("json")}>
            Export JSON
          </button>
          <button type="button" className="inline-button" onClick={() => downloadResearchExport("csv")}>
            Export CSV
          </button>
          <label className="inline-button research-import-button">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importResearchTrades(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="research-bucket-grid">
          <div className="research-bucket-card">
            <div className="section-mini-title">Calibration</div>
            {paperTradeAnalytics.calibrationBuckets.map((bucket) => (
              <div className="research-bucket-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <span>{bucket.tradeCount} trades</span>
                <span>Pred {formatPercent(bucket.predictedAverageProbabilityPercent)}</span>
                <span>Actual {formatPercent(bucket.winRatePercent)}</span>
                <span>{formatDollars(bucket.profitLossDollars)}</span>
              </div>
            ))}
          </div>
          <div className="research-bucket-card">
            <div className="section-mini-title">Edge Buckets</div>
            {paperTradeAnalytics.edgeBuckets.map((bucket) => (
              <div className="research-bucket-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <span>{bucket.tradeCount} trades</span>
                <span>Win {formatPercent(bucket.winRatePercent)}</span>
                <span>ROI {formatSignedPercent(bucket.roiPercent)}</span>
                <span>{formatDollars(bucket.profitLossDollars)}</span>
              </div>
            ))}
          </div>
          <div className="research-bucket-card">
            <div className="section-mini-title">Best Bet Score</div>
            {paperTradeAnalytics.bestBetScoreBuckets.map((bucket) => (
              <div className="research-bucket-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <span>{bucket.tradeCount} trades</span>
                <span>Win {formatPercent(bucket.winRatePercent)}</span>
                <span>ROI {formatSignedPercent(bucket.roiPercent)}</span>
                <span>{formatDollars(bucket.profitLossDollars)}</span>
              </div>
            ))}
          </div>
          <div className="research-bucket-card">
            <div className="section-mini-title">Categories</div>
            {paperTradeAnalytics.categoryBuckets.map((bucket) => (
              <div className="research-bucket-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <span>{bucket.tradeCount} trades</span>
                <span>Win {formatPercent(bucket.winRatePercent)}</span>
                <span>ROI {formatSignedPercent(bucket.roiPercent)}</span>
                <span>{formatDollars(bucket.profitLossDollars)}</span>
              </div>
            ))}
          </div>
        </div>

        {confirmPaperTradePick ? (
          <div className="research-confirm-panel">
            <div className="panel-header compact-header">
              <h3>Paper Trade Preview</h3>
              <button
                type="button"
                className="inline-button muted-button"
                onClick={() => {
                  setConfirmPaperTradeTicker(null);
                  setConfirmPaperTradeRisk("");
                }}
              >
                Close
              </button>
            </div>
            <div className="position-topline">
              <span className="market">{confirmPaperTradePick.marketTitle}</span>
              <span className="research-ev-badge">{confirmPaperTradePick.side}</span>
            </div>
            <div className="field-grid compact-grid">
              <label>
                Risk amount ($)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={confirmPaperTradeRisk}
                  onChange={(event) => setConfirmPaperTradeRisk(event.target.value)}
                />
              </label>
              <label>
                Entry price
                <input value={formatPrice(confirmPaperTradePick.currentPriceCents)} readOnly />
              </label>
            </div>
            <div className="research-metric-grid research-preview-grid">
              <span>Side <strong>{confirmPaperTradePick.side}</strong></span>
              <span>Contracts <strong>{confirmPaperTradeCalculation?.contracts ?? "--"}</strong></span>
              <span>Actual cost <strong>{formatDollars(confirmPaperTradeCalculation?.actualCostDollars)}</strong></span>
              <span>Max profit <strong>{formatDollars(confirmPaperTradeCalculation?.maxProfitDollars)}</strong></span>
              <span>Max loss <strong>{formatDollars(confirmPaperTradeCalculation?.maxLossDollars)}</strong></span>
              <span>Model <strong>{formatPercent(confirmPaperTradePick.modelProbabilityPercent)}</strong></span>
              <span>Best bet <strong>{confirmPaperTradePick.bestBetScore ? `${confirmPaperTradePick.bestBetScore.toFixed(1)}/10` : "--"}</strong></span>
              <span>Win prob <strong>{formatPercent(confirmPaperTradeCalculation?.winProbabilityPercent)}</strong></span>
              <span>Hit rating <strong>{confirmPaperTradePick.hitRating ? `${confirmPaperTradePick.hitRating}/10` : "--"}</strong></span>
              <span>EV <strong>{formatDollars(confirmPaperTradeCalculation?.expectedValueDollars)}</strong></span>
              <span>Exp ROI <strong>{formatSignedPercent(confirmPaperTradeCalculation?.expectedRoiPercent)}</strong></span>
              <span>Edge <strong>{formatSignedPercent(confirmPaperTradePick.edgePercent)}</strong></span>
              <span>Net edge <strong>{formatSignedPercent(confirmPaperTradePick.netEdgePercent)}</strong></span>
            </div>
            {confirmPaperTradeScenarios.length > 0 ? (
              <div className="research-scenario-table">
                {confirmPaperTradeScenarios.map((scenario) => (
                  <div className="research-scenario-row" key={`${scenario.label}-${scenario.exitPriceCents}`}>
                    <span>{scenario.label}</span>
                    <span>{formatPrice(scenario.exitPriceCents)}</span>
                    <span>{formatDollars(scenario.cashoutValueDollars)}</span>
                    <span>{formatDollars(scenario.profitLossDollars)}</span>
                    <span>{formatSignedPercent(scenario.roiPercent)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="combo-result-actions">
              <button
                type="button"
                className="inline-button"
                disabled={!confirmPaperTradeCalculation}
                onClick={() => void addPaperTradeFromPick(confirmPaperTradePick)}
              >
                Place paper trade
              </button>
            </div>
          </div>
        ) : null}

        <div className="research-layout">
          <div className="research-column">
            <div className="section-mini-title">Arb Scanner</div>
            <div className="position-note">
              Pure arb checks same-market YES/NO pricing. Near-arb is not guaranteed profit, but may flag tight mispricing.
            </div>
            <div className="positions-list">
              {arbScannerPicks.length === 0 ? (
                <article className="position-card">
                  <div className="position-note">No pure or near-arb candidates in the visible research results.</div>
                </article>
              ) : (
                arbScannerPicks.map((pick) => (
                  <article className="position-card research-pick-card" key={`arb-${pick.marketTicker}`}>
                    <div className="position-topline">
                      <span className="market">{pick.marketTitle}</span>
                      <span className={`research-ev-badge ${pick.arb.isOpportunity ? "positive" : ""}`}>
                        {pick.arb.isOpportunity ? "Pure arb" : "Near arb"}
                      </span>
                    </div>
                    <div className="research-metric-grid">
                      <span>YES ask <strong>{formatPrice(pick.arb.yesAskCents)}</strong></span>
                      <span>NO ask <strong>{formatPrice(pick.arb.noAskCents)}</strong></span>
                      <span>Total <strong>{formatPrice(pick.arb.totalCostCents)}</strong></span>
                      <span>Gross <strong>{formatSignedPercent(pick.arb.grossArbCents)}</strong></span>
                      <span>Net <strong>{formatSignedPercent(pick.arb.netArbCents)}</strong></span>
                      <span>Best bet <strong>{pick.bestBetScore ? `${pick.bestBetScore.toFixed(1)}/10` : "--"}</strong></span>
                    </div>
                    <div className="position-note">{pick.bestBetReason || pick.reason}</div>
                  </article>
                ))
              )}
            </div>

            <div className="section-mini-title">Market Scanner</div>
            <div className="position-note">
              Uses the Research Markets search above to review EV and arb candidates.
            </div>
            <div className="positions-list">
              {researchPicks.length === 0 ? (
                <article className="position-card">
                  <div className="position-note">Search for a market to generate research picks.</div>
                </article>
              ) : (
                researchPicks.map((pick) => {
                  const defaultTradePreview =
                    typeof pick.currentPriceCents === "number" &&
                    typeof pick.modelProbabilityPercent === "number"
                      ? calculatePaperTrade(
                          pick.side,
                          pick.currentPriceCents,
                          pick.modelProbabilityPercent,
                          researchSettings.maxPaperTradeDollars
                        )
                      : null;

                  return (
                    <article className="position-card research-pick-card" key={pick.marketTicker}>
                      <div className="position-topline">
                        <span className="market">{pick.marketTitle}</span>
                        <span className={`research-ev-badge ${pick.ev.label === "Positive EV" ? "positive" : pick.ev.label === "Negative EV" ? "negative" : ""}`}>
                          {formatValueLabel(pick.ev.label)}
                        </span>
                      </div>
                      <div className="position-meta">
                        <span>{pick.marketTicker}</span>
                        <span>Pick {pick.side}</span>
                        <span>{pick.marketCategory}</span>
                      </div>
                      <div className="research-metric-grid">
                        <span>{pick.side} price <strong>{formatPrice(pick.currentPriceCents)}</strong></span>
                        <span>Best bet <strong>{pick.bestBetScore ? `${pick.bestBetScore.toFixed(1)}/10` : "--"}</strong></span>
                        <span>Model <strong>{formatPercent(pick.modelProbabilityPercent)}</strong></span>
                        <span>Hit <strong>{pick.hitRating ? `${pick.hitRating}/10` : "--"}</strong></span>
                        <span>Edge <strong>{formatSignedPercent(pick.edgePercent)}</strong></span>
                        <span>Net <strong>{formatSignedPercent(pick.netEdgePercent)}</strong></span>
                        <span>Contracts <strong>{defaultTradePreview?.contracts ?? "--"}</strong></span>
                        <span>Cost <strong>{formatDollars(defaultTradePreview?.actualCostDollars)}</strong></span>
                        <span>Max profit <strong>{formatDollars(defaultTradePreview?.maxProfitDollars)}</strong></span>
                        <span>EV <strong>{formatDollars(defaultTradePreview?.expectedValueDollars)}</strong></span>
                        <span>Exp ROI <strong>{formatSignedPercent(defaultTradePreview?.expectedRoiPercent)}</strong></span>
                      </div>
                      <div className="research-arb-line">
                        Arb: total {formatPrice(pick.arb.totalCostCents)} · net {formatSignedPercent(pick.arb.netArbCents)}
                        {pick.arb.isOpportunity ? " · possible same-market arb" : ""}
                      </div>
                      <div className="research-arb-line">
                        Source: {pick.source} · Category: {pick.marketCategory} · Positive: {pick.positiveSignal} · Negative: {pick.negativeSignal}
                      </div>
                      <div className="position-note">{formatValueExplanation(pick)} · {pick.bestBetReason || pick.reason}</div>
                      <div className="combo-result-actions">
                        <button
                          type="button"
                          className="inline-button"
                          disabled={!defaultTradePreview}
                          onClick={() => startPaperTradePreview(pick)}
                          title={!defaultTradePreview ? "Needs a valid market price and risk amount" : "Preview paper trade"}
                        >
                          Paper trade
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="research-column">
            <div className="section-mini-title">Paper Trading Log</div>
            <div className="research-metric-grid research-log-stats">
              <span>Open <strong>{paperTradeStats.openCount}</strong></span>
              <span>Settled <strong>{paperTradeStats.settledCount}</strong></span>
              <span>Avg edge <strong>{formatSignedPercent(paperTradeStats.averageEdgePercent)}</strong></span>
              <span>P/L <strong>{formatDollars(paperTradeStats.totalProfitLossDollars)}</strong></span>
            </div>
            <div className="positions-list">
              {paperTrades.length === 0 ? (
                <article className="position-card">
                  <div className="position-note">Paper trades you save from picks will appear here.</div>
                </article>
              ) : (
                paperTrades.map((trade) => (
                  <article className="position-card" key={trade.id}>
                    <div className="position-topline">
                      <span className="market">{trade.marketTitle}</span>
                      <span className="small-copy">{trade.status}</span>
                    </div>
                    <div className="position-meta">
                      <span>{trade.side} @ {formatPrice(trade.entryPriceCents)}</span>
                      <span>{trade.contracts ?? "--"} contracts · cost {formatDollars(trade.actualCostDollars)}</span>
                    </div>
                    <div className="position-meta">
                      <span>Best bet {trade.bestBetScore ? `${trade.bestBetScore.toFixed(1)}/10` : "--"} · hit {trade.hitRating ? `${trade.hitRating}/10` : "--"}</span>
                      <span>EV {formatDollars(trade.expectedValueDollars)} · ROI {formatSignedPercent(trade.expectedRoiPercent)}</span>
                    </div>
                    <div className="position-meta">
                      <span>Max profit {formatDollars(trade.maxProfitDollars)} · max loss {formatDollars(trade.maxLossDollars)}</span>
                      <span>{new Date(trade.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="position-note">
                      {trade.modelReason ?? "No model note saved."}
                    </div>
                    <div className="position-meta">
                      <span>Source {trade.source ?? "manual"} · category {trade.marketCategory ?? "other"}</span>
                      <span>Net {formatSignedPercent(trade.netEdgePercent)}</span>
                    </div>
                    {trade.status === "open" ? (
                      <div className="research-settle-row">
                        <button
                          type="button"
                          className="inline-button"
                          onClick={() => void settlePaperTradeManually(trade, 100)}
                        >
                          Settle win
                        </button>
                        <button
                          type="button"
                          className="inline-button muted-button"
                          onClick={() => void settlePaperTradeManually(trade, 0)}
                        >
                          Settle loss
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="Exit c"
                          value={paperTradeExitPrices[trade.id] ?? ""}
                          onChange={(event) =>
                            setPaperTradeExitPrices((current) => ({
                              ...current,
                              [trade.id]: event.target.value
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="inline-button"
                          onClick={() => {
                            const exitValue = Number(paperTradeExitPrices[trade.id]);
                            if (Number.isFinite(exitValue)) {
                              void settlePaperTradeManually(trade, exitValue);
                            }
                          }}
                        >
                          Settle exit
                        </button>
                        <button
                          type="button"
                          className="inline-button muted-button"
                          onClick={() => void removePaperTrade(trade.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="research-settled-footer">
                        <div className="position-note">
                          {trade.settlementResult ?? "EXIT"} at {formatPrice(trade.exitPriceCents ?? trade.exitValueCents)} · value {formatDollars(trade.exitValueDollars)} · P/L {formatDollars(trade.profitLossDollars)}
                        </div>
                        <button
                          type="button"
                          className="inline-button muted-button"
                          onClick={() => void removePaperTrade(trade.id)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
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
