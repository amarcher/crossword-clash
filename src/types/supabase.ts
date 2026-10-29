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
          autocheck: boolean | null;
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
          autocheck?: boolean | null;
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
          autocheck?: boolean | null;
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
      solves: {
        Row: {
          user_id: string;
          /** soloStats.puzzleIdentity() of the puzzle. */
          puzzle_key: string;
          title: string;
          source: "daily" | "nyt" | "community" | "other";
          /** 'solo', a race mode, or 'import' for rows uploaded from pre-account localStorage. */
          mode: "solo" | "versus" | "coop" | "async" | "import";
          /** Personal finish time in whole seconds; null for a shared-grid race finish. */
          seconds: number | null;
          /** The player's local calendar day, "YYYY-MM-DD". */
          completed_day: string;
          completed_at: string;
        };
        Insert: {
          user_id: string;
          puzzle_key: string;
          title?: string;
          source: "daily" | "nyt" | "community" | "other";
          mode: "solo" | "versus" | "coop" | "async" | "import";
          seconds?: number | null;
          completed_day: string;
          completed_at?: string;
        };
        Update: {
          title?: string;
          source?: "daily" | "nyt" | "community" | "other";
          mode?: "solo" | "versus" | "coop" | "async" | "import";
          seconds?: number | null;
          completed_at?: string;
        };
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
      entitlements: {
        Row: {
          user_id: string;
          product: "plus" | "supporter";
          source: "revenuecat" | "stripe" | "apple" | "google" | "grant";
          status: "active" | "grace" | "expired" | "revoked";
          /** Null = never expires. */
          expires_at: string | null;
          will_renew: boolean;
          external_id: string | null;
          external_customer: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Service role only (no client write policies). */
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      purchase_events: {
        Row: { source: string; event_id: string; user_id: string | null; kind: string; payload: unknown; received_at: string };
        /** Service role only. */
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      feature_usage: {
        Row: {
          user_id: string;
          feature: "narrator_minutes" | "studio_claude" | "narrator_claude_calls";
          /** First day of the UTC month, "YYYY-MM-01". */
          month: string;
          used: number;
          bonus: number;
          updated_at: string;
        };
        /** Service role only (consume_allowance). */
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      solo_progress: {
        Row: {
          user_id: string;
          puzzle_key: string;
          cells: unknown;
          elapsed_ms: number;
          filled: number;
          total: number;
          updated_at: string;
        };
        Insert: { user_id: string; puzzle_key: string; cells: unknown; elapsed_ms?: number; filled?: number; total?: number; updated_at: string };
        Update: { cells?: unknown; elapsed_ms?: number; filled?: number; total?: number; updated_at?: string };
        Relationships: [];
      };
      /** Community puzzles (docs/community-puzzles-spec.md): one row per author, read-own. Written by accept_publishing_terms() and the admin. */
      publishers: {
        Row: {
          user_id: string;
          terms_accepted_at: string;
          terms_version: string;
          strikes: number;
          banned_at: string | null;
          ban_reason: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** A published community puzzle. Public while 'published'; the author sees their own in every status. No client writes (publish_puzzle / unpublish_puzzle). */
      published_puzzles: {
        Row: {
          id: string;
          short_id: string;
          author_id: string;
          studio_id: string;
          version: number;
          status: "published" | "held" | "unpublished" | "removed";
          title: string;
          notes: string;
          difficulty: "easy" | "medium" | "hard";
          lang: "en" | "es";
          width: number;
          height: number;
          clue_count: number;
          /** TransferPuzzle (puzzleNormalizer.ts); `{}` once a removed puzzle's snapshot is blanked. */
          puzzle: unknown;
          puzzle_key: string;
          content_hash: string;
          plays: number;
          solves: number;
          last_played_at: string | null;
          published_at: string;
          created_at: string;
          updated_at: string;
          unpublished_at: string | null;
          removed_reason: "copied" | "offensive" | "nonsense" | "other" | "copyright" | "author_blocked" | null;
          moderated_by: string | null;
          moderated_at: string | null;
          moderation_note: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Reports on published puzzles. RLS on with no policy: report_puzzle() inserts, the service role reads. */
      puzzle_reports: {
        Row: {
          id: string;
          puzzle_id: string;
          reporter_id: string | null;
          reason: "copied" | "offensive" | "nonsense" | "other";
          details: string;
          status: "open" | "dismissed" | "upheld";
          created_at: string;
          resolved_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      /** published_puzzles joined with the author's username (security_invoker: the table's RLS applies). */
      community_puzzles: {
        Row: {
          id: string;
          short_id: string;
          author_id: string;
          author: string;
          studio_id: string;
          version: number;
          status: "published" | "held" | "unpublished" | "removed";
          title: string;
          notes: string;
          difficulty: "easy" | "medium" | "hard";
          lang: "en" | "es";
          width: number;
          height: number;
          clue_count: number;
          puzzle: unknown;
          puzzle_key: string;
          plays: number;
          solves: number;
          published_at: string;
          updated_at: string;
          removed_reason: "copied" | "offensive" | "nonsense" | "other" | "copyright" | "author_blocked" | null;
          search: unknown;
        };
        Relationships: [];
      };
    };
    Functions: {
      /** Records the caller's agreement to the publishing terms (a real account with a username). */
      accept_publishing_terms: {
        Args: { p_version: string };
        Returns: undefined;
      };
      /** Publishes (or updates) the caller's studio puzzle; refusals are exceptions whose message is a `community:<code>`. */
      publish_puzzle: {
        Args: {
          p_studio_id: string;
          p_title: string;
          p_notes: string;
          p_difficulty: string;
          p_lang: string;
          p_puzzle: unknown;
          p_puzzle_key: string;
          p_content_hash: string;
        };
        Returns: { id: string; short_id: string; version: number }[];
      };
      unpublish_puzzle: {
        Args: { p_id: string };
        Returns: undefined;
      };
      /** A report from any signed-in user (anonymous included); returns whether the puzzle is now held. */
      report_puzzle: {
        Args: { p_puzzle_id: string; p_reason: string; p_details: string };
        Returns: boolean;
      };
      /** Upserts finishes for the calling account (user_id comes from the JWT); returns the resulting rows. */
      record_solves: {
        Args: { p_solves: unknown };
        Returns: Database["public"]["Tables"]["solves"]["Row"][];
      };
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
      /** Whether a user holds an in-force entitlement for a product (SECURITY DEFINER, STABLE). */
      has_entitlement: {
        Args: { p_user: string; p_product: string };
        Returns: boolean;
      };
      /** Service role only: atomically takes p_amount of this month's allowance for (user, feature). */
      consume_allowance: {
        Args: { p_user: string; p_feature: string; p_amount: number; p_limit: number };
        Returns: { allowed: boolean; used: number; bonus: number; month: string }[];
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
