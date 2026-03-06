import type { AgentGameEvent, Puzzle, Player } from "./types";

export function formatEvent(event: AgentGameEvent): string {
  const { type, data } = event;
  switch (type) {
    case "GAME_STARTED": {
      const playerNames = (data.playerNames as string[]).join(", ");
      return `GAME_STARTED: Players: ${playerNames}. Puzzle: '${data.title}' by ${data.author}. ${data.width}x${data.height} grid, ${data.acrossCount} across clues, ${data.downCount} down clues (${data.totalClues} total).`;
    }
    case "CLUE_COMPLETED": {
      const scores = data.scores as string;
      return `CLUE_COMPLETED: ${data.playerName} got ${data.clueNumber}-${data.clueDirection} '${data.clueText}' (${data.answer}). Scores: ${scores}. ${data.remaining} clues remaining.`;
    }
    case "LEAD_CHANGE": {
      return `LEAD_CHANGE: ${data.newLeader} takes the lead from ${data.previousLeader}! ${data.scores}`;
    }
    case "PLAYER_LEFT": {
      return `PLAYER_LEFT: ${data.playerName} has left the game.`;
    }
    case "GAME_COMPLETED": {
      return `GAME_COMPLETED: ${data.winner} wins! Final: ${data.scores}`;
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
    .map((p) => `${p.name} ${p.score}/${totalClues}`)
    .join(", ");
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
    .map((p) => `${p.name} ${p.score}/${totalClues}`)
    .join(", ");
  return {
    type: "LEAD_CHANGE",
    data: { newLeader, previousLeader, scores },
  };
}

export function buildGameCompletedEvent(
  winner: string,
  playerScores: { name: string; score: number }[],
  totalClues: number,
): AgentGameEvent {
  const scores = playerScores
    .map((p) => `${p.name} ${p.score}/${totalClues}`)
    .join(", ");
  return {
    type: "GAME_COMPLETED",
    data: { winner, scores },
  };
}
