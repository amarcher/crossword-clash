/**
 * Supabase database types.
 * In production, generate with: npx supabase gen types typescript
 * This is a manual stub matching our migration schema.
 */

export interface Database {
  public: {
    Tables: {
      puzzles: {
        Row: {
          id: string;
          title: string;
          author: string;
          width: number;
          height: number;
          grid: unknown;
          clues: unknown;
          file_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title?: string;
          author?: string;
          width: number;
          height: number;
          grid: unknown;
          clues: unknown;
          file_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          author?: string;
          width?: number;
          height?: number;
          grid?: unknown;
          clues?: unknown;
          file_hash?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          puzzle_id: string;
          status: string;
          cells: unknown;
          short_code: string | null;
          settings: unknown;
          host_user_id: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          puzzle_id: string;
          status?: string;
          cells?: unknown;
          short_code?: string | null;
          settings?: unknown;
          host_user_id?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          puzzle_id?: string;
          status?: string;
          cells?: unknown;
          short_code?: string | null;
          settings?: unknown;
          host_user_id?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          game_id: string;
          user_id: string;
          display_name: string;
          color: string;
          score: number;
          race_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id: string;
          display_name?: string;
          color?: string;
          score?: number;
          race_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          user_id?: string;
          display_name?: string;
          color?: string;
          score?: number;
          race_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_results: {
        Row: {
          id: string;
          day: string;
          slot: string;
          user_id: string;
          display_name: string;
          mode: string;
          seconds: number;
          game_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          day: string;
          slot?: string;
          user_id: string;
          display_name?: string;
          mode: string;
          seconds: number;
          game_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          day?: string;
          slot?: string;
          user_id?: string;
          display_name?: string;
          mode?: string;
          seconds?: number;
          game_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      studio_admins: {
        Row: { user_id: string; note: string; created_at: string };
        Insert: { user_id: string; note?: string; created_at?: string };
        Update: { user_id?: string; note?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          username: string;
          /** Generated: lower(username), unique. */
          username_lower: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; username: string; display_name?: string | null; created_at?: string; updated_at?: string };
        Update: { user_id?: string; username?: string; display_name?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      narrator_sessions: {
        Row: {
          id: string;
          user_id: string;
          game_id: string | null;
          puzzle_key: string;
          puzzle_title: string;
          requested_engine: string;
          engine: string;
          outcome: "connected" | "failed" | "budget";
          error: string;
          client: string;
          platform: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          game_id?: string | null;
          puzzle_key?: string;
          puzzle_title?: string;
          requested_engine: string;
          engine: string;
          outcome: "connected" | "failed" | "budget";
          error?: string;
          client?: string;
          platform?: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Service role only (revoked from anon/authenticated): per-puzzle insights in a window. */
      insights_puzzles: {
        Args: { p_from: string; p_to: string };
        Returns: unknown[];
      };
      /** Service role only: per-clue insights for one puzzle in a window. */
      insights_clues: {
        Args: { p_puzzle_key: string; p_from: string; p_to: string };
        Returns: unknown[];
      };
      claim_cell: {
        Args: {
          p_game_id: string;
          p_cell_key: string;
          p_letter: string;
          p_player_id: string;
          p_correct: boolean;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
