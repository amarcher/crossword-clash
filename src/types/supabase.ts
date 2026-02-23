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
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          puzzle_id: string;
          status?: string;
          cells?: unknown;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          puzzle_id?: string;
          status?: string;
          cells?: unknown;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id: string;
          display_name?: string;
          color?: string;
          score?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          user_id?: string;
          display_name?: string;
          color?: string;
          score?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
