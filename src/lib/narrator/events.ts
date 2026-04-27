import type { AgentGameEvent, Puzzle, Player } from "./types";

export function formatEvent(event: AgentGameEvent): string {
  const { type, data } = event;
  switch (type) {
    case "GAME_STARTED": {
      const playerNames = (data.playerNames as string[]).join(", ");
      // Normalized to "EVENT:" prefix so all event types share one schema.
      return `EVENT: Game starting. Players: ${playerNames}. Puzzle: '${data.title}' by ${data.author}. ${data.width}x${data.height} grid, ${data.acrossCount} across clues, ${data.downCount} down clues (${data.totalClues} total).`;
    }
    case "CLUE_COMPLETED": {
      const scores = data.scores as string;
      return `EVENT: ${data.playerName} completed ${data.clueNumber}-${data.clueDirection} "${data.clueText}" (answer: ${data.answer})\nSCORES: ${scores} — ${data.remaining} remaining`;
    }
    case "LEAD_CHANGE": {
      const gap = data.gap as number | undefined;
      const gapStr = typeof gap === "number" ? `, gap +${gap}` : "";
      return `EVENT: ${data.newLeader} takes the lead from ${data.previousLeader}${gapStr}!\nSCORES: ${data.scores}`;
    }
    case "PLAYER_LEFT": {
      return `EVENT: ${data.playerName} has left the game.`;
    }
    case "GAME_COMPLETED": {
      return `EVENT: ${data.winner} wins!\nFINAL SCORES: ${data.scores}`;
    }
    case "WRONG_LETTER": {
      return `EVENT: ${data.playerName} typed '${data.attempted}' on ${data.clueNumber}-${data.clueDirection} (expected '${data.expected}'). Attempt ${data.attemptCountThisCell} on this cell.`;
    }
    case "NEAR_MISS": {
      return `EVENT: ${data.playerName} finally got ${data.clueNumber} after ${data.wrongStreak} wrong tries — close call.`;
    }
    case "STALL": {
      const leader = data.leaderName ? `${data.leaderName} leading` : "no leader yet";
      return `EVENT: No claims for ${data.secondsSinceLastClaim}s — ${leader}.`;
    }
  }
}

export function buildGameStartedEvent(
  puzzle: Puzzle,
  players: Player[],
): AgentGameEvent {
  const acrossCount = puzzle.clues.filter(
    (c) => c.direction === "across",
  ).length;
  const downCount = puzzle.clues.filter((c) => c.direction === "down").length;
  return {
    type: "GAME_STARTED",
    data: {
      playerNames: players.map((p) => p.displayName),
      title: puzzle.title,
      author: puzzle.author,
      width: puzzle.width,
      height: puzzle.height,
      acrossCount,
      downCount,
      totalClues: acrossCount + downCount,
    },
  };
}

export function buildClueCompletedEvent(
  playerName: string,
  clueNumber: number,
  clueDirection: string,
  clueText: string,
  answer: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name}: ${p.score}/${totalClues}`)
    .join(" | ");
  const totalCompleted = playerScores.reduce((sum, p) => sum + p.score, 0);
  return {
    type: "CLUE_COMPLETED",
    data: {
      playerName,
      clueNumber,
      clueDirection,
      clueText,
      answer: answer.toLowerCase(),
      scores,
      remaining: totalClues - totalCompleted,
    },
  };
}

export function buildLeadChangeEvent(
  newLeader: string,
  previousLeader: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name}: ${p.score}/${totalClues}`)
    .join(" | ");
  // Compute gap so the narrator can color the moment (close call vs blowout).
  const newScore = playerScores.find((p) => p.name === newLeader)?.score ?? 0;
  const prevScore = playerScores.find((p) => p.name === previousLeader)?.score ?? 0;
  const gap = newScore - prevScore;
  return {
    type: "LEAD_CHANGE",
    data: { newLeader, previousLeader, scores, gap },
  };
}

export function buildGameCompletedEvent(
  winner: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name}: ${p.score}/${totalClues}`)
    .join(" | ");
  return {
    type: "GAME_COMPLETED",
    data: { winner, scores },
  };
}

export function buildWrongLetterEvent(
  playerName: string,
  clueNumber: number,
  clueDirection: "across" | "down",
  expected: string,
  attempted: string,
  attemptCountThisCell: number,
): AgentGameEvent {
  return {
    type: "WRONG_LETTER",
    data: {
      playerName,
      clueNumber,
      clueDirection,
      expected: expected.toUpperCase(),
      attempted: attempted.toUpperCase(),
      attemptCountThisCell,
    },
  };
}

export function buildNearMissEvent(
  playerName: string,
  clueNumber: number,
  wrongStreak: number,
): AgentGameEvent {
  return {
    type: "NEAR_MISS",
    data: { playerName, clueNumber, wrongStreak },
  };
}

export function buildStallEvent(
  secondsSinceLastClaim: number,
  leaderName: string | null,
): AgentGameEvent {
  return {
    type: "STALL",
    data: { secondsSinceLastClaim, leaderName },
  };
}
