// Re-export from narrator module for backwards compatibility
export type { AgentGameEvent } from "./narrator/types";
export {
  buildGameStartedEvent,
  buildClueCompletedEvent,
  buildLeadChangeEvent,
  buildGameCompletedEvent,
} from "./narrator/events";
export { ElevenLabsAgentBackend as AgentNarrator } from "./narrator/elevenLabsAgent";
