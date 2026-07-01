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
          user_id?: string;
          display_name?: string;
          mode?: string;
          seconds?: number;
          game_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
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
