import {
  KalshiPosition,
  ManualLegOverlayChip,
  ManualParlayLeg,
  ManualLegLiveStatus,
  ManualPredictionMarketLeg,
  GameState
} from "./types";
import { BackendKalshiMarketResponse, BackendPlayersResponse } from "./overlayState";
import { formatAmericanOdds, getOddsMovement } from "./odds";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function lastName(value: string): string {
  const parts = normalizeText(value).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function normalizeTeamToken(value: string): string {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    nyk: "knicks",
    knicks: "knicks",
    cle: "cavaliers",
    cavs: "cavaliers",
    cavaliers: "cavaliers",
    okc: "thunder",
    thunder: "thunder",
    sas: "spurs",
    spurs: "spurs"
  };

  return aliases[normalized] ?? normalized;
}

function teamMatches(candidateTeam: string, requestedTeam: string): boolean {
  const candidate = normalizeTeamToken(candidateTeam);
  const requested = normalizeTeamToken(requestedTeam);
  return candidate === requested || candidate.includes(requested) || requested.includes(candidate);
}

function getPlayerStatByType(
  player: BackendPlayersResponse["players"][number],
  statType: ManualParlayLeg extends infer _T ? string : never
): number | undefined {
  switch (statType) {
    case "points":
      return player.points;
    case "rebounds":
      return player.rebounds;
    case "assists":
      return player.assists;
    case "threes_made":
      return player.threesMade;
    case "steals":
      return player.steals;
    case "blocks":
      return player.blocks;
    case "turnovers":
      return player.turnovers;
    default:
      return undefined;
  }
}

function findPlayerStatMatch(
  playerStats: BackendPlayersResponse["players"],
  playerName: string,
  team: string,
  statType: ManualParlayLeg extends infer _T ? string : never
): { value?: number; reason?: string } {
  if (playerStats.length === 0) {
    return { reason: "Player stats unavailable from the selected provider" };
  }

  const normalizedPlayerName = normalizeText(playerName);
  const normalizedRequestedTeam = normalizeTeamToken(team);
  const teamFiltered = playerStats.filter((player) =>
    team ? teamMatches(player.team, normalizedRequestedTeam) : true
  );
  const exactCandidates = teamFiltered.filter((player) => normalizeText(player.name) === normalizedPlayerName);

  if (exactCandidates.length === 1) {
    return { value: getPlayerStatByType(exactCandidates[0], statType) };
  }

  if (exactCandidates.length > 1) {
    return { reason: `Ambiguous player match for ${playerName}` };
  }

  const allExactCandidates = playerStats.filter((player) => normalizeText(player.name) === normalizedPlayerName);

  if (allExactCandidates.length === 1) {
    return { value: getPlayerStatByType(allExactCandidates[0], statType) };
  }

  if (allExactCandidates.length > 1) {
    return { reason: `Ambiguous player match for ${playerName}` };
  }

  const requestedLastName = lastName(playerName);
  const lastNameCandidates = teamFiltered.filter((player) => lastName(player.name) === requestedLastName);

  if (lastNameCandidates.length === 1) {
    return { value: getPlayerStatByType(lastNameCandidates[0], statType) };
  }

  if (lastNameCandidates.length > 1) {
    return { reason: `Ambiguous last-name match for ${playerName}` };
  }

  return { reason: `${playerName} not found in the selected game` };
}

function getTeamScores(gameState: GameState, teamName: string): { selected: number; opponent: number } | null {
  const normalizedTeam = normalizeText(teamName);
  const isHome =
    normalizedTeam === normalizeText(gameState.homeTeam.shortName) ||
    normalizedTeam === normalizeText(gameState.homeTeam.name) ||
    normalizedTeam.includes(normalizeText(gameState.homeTeam.city));
  const isAway =
    normalizedTeam === normalizeText(gameState.awayTeam.shortName) ||
    normalizedTeam === normalizeText(gameState.awayTeam.name) ||
    normalizedTeam.includes(normalizeText(gameState.awayTeam.city));

  if (isHome) {
    return {
      selected: gameState.homeTeam.score,
      opponent: gameState.awayTeam.score
    };
  }

  if (isAway) {
    return {
      selected: gameState.awayTeam.score,
      opponent: gameState.homeTeam.score
    };
  }

  return null;
}

function buildOddsText(leg: ManualParlayLeg): string | undefined {
  if (typeof leg.originalOdds !== "number" || typeof leg.currentOdds !== "number") {
    return undefined;
  }

  const movement = getOddsMovement(leg.originalOdds, leg.currentOdds);
  const chanceArrow =
    movement.probabilityDirection === "up" ? "↑" : movement.probabilityDirection === "down" ? "↓" : "→";

  return `Odds ${formatAmericanOdds(leg.originalOdds)} → ${formatAmericanOdds(leg.currentOdds)} · Chance ${chanceArrow}`;
}

function progressFromRatio(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function buildUnavailableChip(leg: ManualParlayLeg, label: string, needsText: string): ManualLegOverlayChip {
  return {
    id: leg.id,
    label,
    type: leg.type,
    progressPercent: 0,
    status: "unavailable",
    needsText,
    oddsText: buildOddsText(leg)
  };
}

function formatPriceMovementText(originalPrice?: number, currentPrice?: number): string | undefined {
  if (typeof originalPrice !== "number" || typeof currentPrice !== "number") {
    return undefined;
  }

  const move = currentPrice - originalPrice;
  const arrow = move > 0 ? "↑" : move < 0 ? "↓" : "→";

  return `Price ${originalPrice} -> ${currentPrice} · Chance ${arrow}`;
}

function getPredictionMarketStatus(
  currentPrice: number | undefined,
  marketStatus?: string
): ManualLegLiveStatus {
  if (typeof currentPrice !== "number") {
    return "unavailable";
  }

  const normalizedStatus = marketStatus?.toLowerCase();

  if ((normalizedStatus === "settled" || normalizedStatus === "closed") && currentPrice >= 99) {
    return "hit";
  }

  if ((normalizedStatus === "settled" || normalizedStatus === "closed") && currentPrice <= 1) {
    return "behind";
  }

  if (currentPrice >= 70) {
    return "live";
  }

  if (currentPrice <= 30) {
    return "behind";
  }

  return "live";
}

function buildPredictionMarketChip(
  leg: ManualPredictionMarketLeg,
  market: BackendKalshiMarketResponse["market"]
): ManualLegOverlayChip {
  const currentSidePrice =
    leg.userSide === "YES" ? market?.yesPriceCents ?? undefined : market?.noPriceCents ?? undefined;
  const originalPrice = leg.originalPrice;
  const effectiveCurrentPrice =
    typeof currentSidePrice === "number" ? currentSidePrice : leg.currentPrice;
  const yesPrice = market?.yesPriceCents ?? (leg.userSide === "YES" ? leg.currentPrice : undefined);
  const noPrice = market?.noPriceCents ?? (leg.userSide === "NO" ? leg.currentPrice : undefined);
  const movementText = formatPriceMovementText(originalPrice, effectiveCurrentPrice);
  const priceSummary =
    typeof yesPrice === "number" || typeof noPrice === "number"
      ? `${typeof yesPrice === "number" ? `Y ${yesPrice}` : "Y --"} · ${typeof noPrice === "number" ? `N ${noPrice}` : "N --"}`
      : "Market prices unavailable";

  return {
    id: leg.id,
    label: `${leg.userSide} ${leg.marketTitle} · ${priceSummary}`,
    type: leg.type,
    current: effectiveCurrentPrice,
    target: 100,
    progressPercent: typeof effectiveCurrentPrice === "number" ? effectiveCurrentPrice : 0,
    status: getPredictionMarketStatus(effectiveCurrentPrice, market?.status),
    needsText: leg.whatNeedsToHappen,
    oddsText: movementText,
    marketTitle: leg.marketTitle,
    marketTicker: leg.marketTicker,
    userSide: leg.userSide,
    yesPrice,
    noPrice,
    originalPrice,
    currentPrice: effectiveCurrentPrice,
    contractsOwned: leg.contractsOwned,
    chanceText: movementText
  };
}

function getPregameLabel(leg: ManualParlayLeg): string {
  switch (leg.type) {
    case "player_prop":
      return `${leg.playerName} ${leg.direction === "over" ? "O" : "U"}${leg.line}`;
    case "team_moneyline":
      return `${leg.team} ML`;
    case "spread":
      return `${leg.team} ${leg.side === "plus" ? "+" : "-"}${leg.line}`;
    case "game_total":
      return `${leg.matchup} ${leg.direction === "over" ? "O" : "U"}${leg.line}`;
    case "prediction_market":
      return `${leg.userSide} ${leg.marketTitle}`;
  }
}

function liveStatusToChipStatus(status: KalshiPosition["status"]): ManualLegLiveStatus {
  switch (status) {
    case "won":
      return "hit";
    case "lost":
      return "behind";
    case "danger":
      return "behind";
    default:
      return "live";
  }
}

export function buildManualLegOverlayChips(params: {
  manualLegs: ManualParlayLeg[];
  gameState: GameState;
  playerStats: BackendPlayersResponse["players"];
  kalshiPositions: KalshiPosition[];
  kalshiMarketsByTicker?: Record<string, BackendKalshiMarketResponse["market"] | undefined>;
}): ManualLegOverlayChip[] {
  const { manualLegs, gameState, playerStats, kalshiPositions, kalshiMarketsByTicker = {} } = params;
  const gameHasNotStarted = gameState.gameStatus === "upcoming";
  const gameIsFinal = gameState.gameStatus === "final";

  return manualLegs.map((leg) => {
    const oddsText = buildOddsText(leg);

    if (gameHasNotStarted) {
      return buildUnavailableChip(
        leg,
        getPregameLabel(leg),
        "Game has not started"
      );
    }

    switch (leg.type) {
      case "player_prop": {
        const playerMatch = findPlayerStatMatch(playerStats, leg.playerName, leg.team, leg.statType);
        const current = playerMatch.value;
        const unit = leg.statType === "points" ? "points" : leg.statType;

        if (typeof current !== "number") {
          return buildUnavailableChip(
            leg,
            `${leg.playerName} ${leg.direction === "over" ? "O" : "U"}${leg.line} ${unit}`,
            playerMatch.reason ?? `Live ${unit} data unavailable`
          );
        }

        if (leg.direction === "over") {
          const remaining = Math.max(0, leg.line - current);
          return {
            id: leg.id,
            label: `${leg.playerName} ${current}/${leg.line} ${unit}`,
            type: leg.type,
            current,
            target: leg.line,
            progressPercent: progressFromRatio(current, leg.line),
            status: current >= leg.line ? "hit" : "live",
            needsText: current >= leg.line ? "Leg is currently hit" : `Needs ${remaining} more ${unit}`,
            oddsText
          };
        }

        const cushion = leg.line - current;
        return {
          id: leg.id,
          label: `${leg.playerName} U${leg.line} ${unit} · ${current}/${leg.line}`,
          type: leg.type,
          current,
          target: leg.line,
          progressPercent: progressFromRatio(current, leg.line),
          status: current > leg.line ? "behind" : "live",
          needsText: current > leg.line ? `Under is broken by ${Math.abs(cushion)}` : `Under still safe by ${cushion}`,
          oddsText
        };
      }
      case "team_moneyline": {
        const scores = getTeamScores(gameState, leg.team);

        if (!scores) {
          return buildUnavailableChip(leg, `${leg.team} ML`, "Team not found in current mock game");
        }

        const margin = scores.selected - scores.opponent;
        return {
          id: leg.id,
          label: `${leg.team} ML`,
          type: leg.type,
          current: scores.selected,
          target: scores.opponent,
          progressPercent: margin > 0 ? 65 : margin < 0 ? 35 : 50,
          status: margin > 0 ? (gameIsFinal ? "hit" : "live") : gameIsFinal && margin < 0 ? "behind" : "live",
          needsText: margin > 0 ? `${leg.team} is winning by ${margin}` : margin < 0 ? `${leg.team} is losing by ${Math.abs(margin)}` : "Game is currently tied",
          oddsText
        };
      }
      case "spread": {
        const scores = getTeamScores(gameState, leg.team);

        if (!scores) {
          return buildUnavailableChip(leg, `${leg.team} ${leg.side === "plus" ? "+" : "-"}${leg.line}`, "Team not found in current mock game");
        }

        const coverMargin =
          leg.side === "plus"
            ? scores.selected + leg.line - scores.opponent
            : scores.selected - leg.line - scores.opponent;

        return {
          id: leg.id,
          label: `${leg.team} ${leg.side === "plus" ? "+" : "-"}${leg.line}`,
          type: leg.type,
          current: coverMargin,
          target: 0,
          progressPercent: Math.max(0, Math.min(100, 50 + coverMargin * 5)),
          status: coverMargin > 0 ? (gameIsFinal ? "hit" : "live") : gameIsFinal && coverMargin < 0 ? "behind" : "live",
          needsText: coverMargin > 0 ? `Covering by ${coverMargin}` : coverMargin < 0 ? `Not covering by ${Math.abs(coverMargin)}` : "Exactly on the number",
          oddsText
        };
      }
      case "game_total": {
        const currentTotal = gameState.homeTeam.score + gameState.awayTeam.score;

        if (leg.direction === "over") {
          const remaining = Math.max(0, leg.line - currentTotal);
          return {
            id: leg.id,
            label: `${leg.matchup} O${leg.line}`,
            type: leg.type,
            current: currentTotal,
            target: leg.line,
            progressPercent: progressFromRatio(currentTotal, leg.line),
            status: currentTotal >= leg.line ? "hit" : "live",
            needsText: currentTotal >= leg.line ? `Over is already there at ${currentTotal}` : `Needs ${remaining} more total points`,
            oddsText
          };
        }

        const cushion = leg.line - currentTotal;
        return {
          id: leg.id,
          label: `${leg.matchup} U${leg.line}`,
          type: leg.type,
          current: currentTotal,
          target: leg.line,
          progressPercent: progressFromRatio(currentTotal, leg.line),
          status: currentTotal > leg.line ? "behind" : "live",
          needsText: currentTotal > leg.line ? `Under is over by ${Math.abs(cushion)}` : `Under cushion is ${cushion}`,
          oddsText
        };
      }
      case "prediction_market": {
        if (leg.marketTicker) {
          const matchedMarket = kalshiMarketsByTicker[leg.marketTicker];

          if (!matchedMarket) {
            return buildUnavailableChip(
              leg,
              `${leg.userSide} ${leg.marketTitle}`,
              `Market ticker ${leg.marketTicker} is unavailable`
            );
          }

          return buildPredictionMarketChip(leg, matchedMarket);
        }

        const matchingPosition = kalshiPositions.find(
          (position) => normalizeText(position.marketTitle) === normalizeText(leg.marketTitle)
        );

        if (!matchingPosition) {
          return buildUnavailableChip(leg, `${leg.userSide} ${leg.marketTitle}`, leg.whatNeedsToHappen);
        }

        return {
          id: leg.id,
          label: `${leg.userSide} ${leg.marketTitle}`,
          type: leg.type,
          current: matchingPosition.currentPriceCents,
          target: 100,
          progressPercent: matchingPosition.currentPriceCents,
          status: liveStatusToChipStatus(matchingPosition.status),
          needsText: matchingPosition.whatNeedsToHappen,
          oddsText,
          marketTitle: leg.marketTitle,
          marketTicker: leg.marketTicker,
          userSide: leg.userSide,
          yesPrice: leg.userSide === "YES" ? matchingPosition.currentPriceCents : 100 - matchingPosition.currentPriceCents,
          noPrice: leg.userSide === "NO" ? matchingPosition.currentPriceCents : 100 - matchingPosition.currentPriceCents,
          originalPrice: leg.originalPrice,
          currentPrice: leg.currentPrice ?? matchingPosition.currentPriceCents,
          contractsOwned: leg.contractsOwned,
          chanceText: formatPriceMovementText(leg.originalPrice, leg.currentPrice ?? matchingPosition.currentPriceCents)
        };
      }
    }
  });
}
