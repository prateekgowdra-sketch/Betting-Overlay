function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function inferStatType(rawStat) {
  const normalized = rawStat.toLowerCase();

  if (normalized.includes("point")) {
    return { statType: "points", unit: "pts" };
  }

  if (normalized.includes("rebound")) {
    return { statType: "rebounds", unit: "reb" };
  }

  if (normalized.includes("assist")) {
    return { statType: "assists", unit: "ast" };
  }

  if (normalized.includes("3") || normalized.includes("three")) {
    return { statType: "three_pointers", unit: "3pm" };
  }

  if (normalized.includes("passing yards")) {
    return { statType: "passing_yards", unit: "yds" };
  }

  if (normalized.includes("rushing yards")) {
    return { statType: "rushing_yards", unit: "yds" };
  }

  if (normalized.includes("receiving yards")) {
    return { statType: "receiving_yards", unit: "yds" };
  }

  if (normalized.includes("touchdown")) {
    return { statType: "touchdowns", unit: "td" };
  }

  if (normalized.includes("goal")) {
    return { statType: "goals", unit: "goals" };
  }

  if (normalized.includes("strikeout")) {
    return { statType: "strikeouts", unit: "so" };
  }

  return null;
}

function buildNeedsText(direction, target, statType, playerName) {
  const labelMap = {
    points: "points",
    rebounds: "rebounds",
    assists: "assists",
    three_pointers: "made threes",
    passing_yards: "passing yards",
    rushing_yards: "rushing yards",
    receiving_yards: "receiving yards",
    touchdowns: "touchdowns",
    goals: "goals",
    strikeouts: "strikeouts"
  };

  const label = labelMap[statType] ?? statType;

  if (direction === "over") {
    return `${playerName} needs ${target}+ ${label}.`;
  }

  return `${playerName} must stay under ${target}.`;
}

function parsePlayerMarket(title) {
  const cleaned = title.trim().replace(/\?$/, "");
  const patterns = [
    /will\s+(.+?)\s+(score|record|grab|have|hit|make|throw for)\s+(\d+(?:\.\d+)?)(\+)?\s+(.+)/i,
    /will\s+(.+?)\s+go\s+over\s+(\d+(?:\.\d+)?)\s+(.+)/i,
    /will\s+(.+?)\s+stay\s+under\s+(\d+(?:\.\d+)?)\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);

    if (!match) {
      continue;
    }

    let playerName = "";
    let target = 0;
    let rawStat = "";
    let direction = "over";

    if (pattern === patterns[0]) {
      playerName = match[1].trim();
      target = Number(match[3]);
      rawStat = match[5].trim();
      direction = match[4] ? "over" : "over";
    } else if (pattern === patterns[1]) {
      playerName = match[1].trim();
      target = Number(match[2]);
      rawStat = match[3].trim();
      direction = "over";
    } else {
      playerName = match[1].trim();
      target = Number(match[2]);
      rawStat = match[3].trim();
      direction = "under";
    }

    const inferred = inferStatType(rawStat);

    if (!inferred || !playerName || Number.isNaN(target)) {
      continue;
    }

    return {
      marketType: "player",
      isTeamMarket: false,
      isPlayerMarket: true,
      playerName,
      statType: inferred.statType,
      target,
      direction,
      whatNeedsToHappen: buildNeedsText(direction, target, inferred.statType, playerName),
      marketLeg: {
        id: `${slugify(playerName)}-${inferred.statType}-leg`,
        playerName,
        statType: inferred.statType,
        direction,
        current: 0,
        target,
        unit: inferred.unit,
        progress: 0,
        status: "sweating",
        whatNeedsToHappen: buildNeedsText(direction, target, inferred.statType, playerName)
      }
    };
  }

  return null;
}

function parseTeamMarket(title) {
  const cleaned = title.trim().replace(/\?$/, "");
  const teamWinMatch = cleaned.match(/^will\s+the\s+(.+?)\s+beat\s+the\s+(.+)$/i);

  if (teamWinMatch) {
    const teamName = teamWinMatch[1].trim();
    return {
      marketType: "team",
      isTeamMarket: true,
      isPlayerMarket: false,
      teamMarketTitle: cleaned,
      whatNeedsToHappen: `The ${teamName} need to win the game.`
    };
  }

  return null;
}

export function parseKalshiMarketTitle(title) {
  const teamMarket = parseTeamMarket(title);

  if (teamMarket) {
    return teamMarket;
  }

  const playerMarket = parsePlayerMarket(title);

  if (playerMarket) {
    return playerMarket;
  }

  return {
    marketType: "unknown",
    isTeamMarket: false,
    isPlayerMarket: false,
    whatNeedsToHappen: "Unable to confidently parse this market yet."
  };
}
