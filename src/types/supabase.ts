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
          /** Who may race or replay this account's recorded solves (race.ts). */
          race_visibility: "everyone" | "friends" | "hidden";
          /** The owner's "Show my Plus badge" switch. */
          show_plus_badge: boolean;
          /** Derived on the server (Plus and show_plus_badge); whatever a client writes is recomputed. */
          plus_badge: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; username: string; display_name?: string | null; race_visibility?: "everyone" | "friends" | "hidden"; show_plus_badge?: boolean; created_at?: string; updated_at?: string };
        Update: { user_id?: string; username?: string; display_name?: string | null; race_visibility?: "everyone" | "friends" | "hidden"; show_plus_badge?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      race_replies: {
        Row: {
          id: string;
          share_id: string;
          to_user_id: string;
          from_user_id: string;
          reply_share_id: string | null;
          name: string;
          /** A daily's day and slot, or a community puzzle's short ID and title. */
          day: string | null;
          slot: "mini" | "midi" | "large" | null;
          short_id: string | null;
          title: string | null;
          seconds: number;
          to_seconds: number;
          created_at: string;
          seen_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      replay_shares: {
        Row: {
          /** 11 characters: the start of the code's SHA-256 in base64url. */
          id: string;
          /** The replay code (src/lib/replayCode.ts). */
          code: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: { id: string; code: string; user_id?: string | null; created_at?: string };
        Update: { id?: string; code?: string; user_id?: string | null; created_at?: string };
        Relationships: [];
      };
      solve_traces: {
        Row: {
          user_id: string;
          puzzle_key: string;
          /** The recorded finish, whole seconds. */
          seconds: number;
          /** `[[ms, cell, letter], …]` (race.ts TraceEvent). */
          events: unknown;
          created_at: string;
        };
        Insert: { user_id: string; puzzle_key: string; seconds: number; events: unknown; created_at?: string };
        Update: { user_id?: string; puzzle_key?: string; seconds?: number; events?: unknown; created_at?: string };
        Relationships: [];
      };
      solves: {
        Row: {
          user_id: string;
          /** soloStats.puzzleIdentity() of the puzzle. */
          puzzle_key: string;
          title: string;
          source: "daily" | "nyt" | "community" | "bonus" | "other";
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
          source: "daily" | "nyt" | "community" | "bonus" | "other";
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
      /** A friend request (pending) or friendship (accepted) between two accounts; one row per pair. Written by send_friend_request / respond_friend_request; either party may delete. */
      friendships: {
        Row: {
          requester_id: string;
          recipient_id: string;
          status: "pending" | "accepted";
          created_at: string;
          responded_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** One-directional blocks; only the blocker reads or writes their rows. */
      blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: never;
        Relationships: [];
      };
      /** A friend's invitation into a waiting room ('room', with game_id) or to beat a daily time ('beat', with link). Written by invite_to_room / send_beat. */
      room_invites: {
        Row: {
          id: string;
          kind: "room" | "beat";
          game_id: string | null;
          link: string | null;
          from_user_id: string;
          to_user_id: string;
          created_at: string;
          pushed_at: string | null;
          seen_at: string | null;
          /** The invitee's "Can't now" (phase f); null until answered. */
          response: "declined" | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** A device the player allowed notifications on (APNs or FCM token); the device upserts its own row by token. */
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          platform: "ios" | "android";
          token: string;
          app_version: string | null;
          locale: "en" | "es";
          timezone: string;
          created_at: string;
          last_seen_at: string;
          failed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: "ios" | "android";
          token: string;
          app_version?: string | null;
          locale?: "en" | "es";
          timezone?: string;
          created_at?: string;
          last_seen_at?: string;
          failed_at?: string | null;
        };
        Update: {
          user_id?: string;
          platform?: "ios" | "android";
          app_version?: string | null;
          locale?: "en" | "es";
          timezone?: string;
          last_seen_at?: string;
          failed_at?: string | null;
        };
        Relationships: [];
      };
      /** The per-kind notification switches, reminder hour and quiet hours; one row per user, own-row RLS. */
      notification_preferences: {
        Row: {
          user_id: string;
          daily_reminder: boolean;
          daily_reminder_hour: number;
          room_invites: boolean;
          friend_requests: boolean;
          quiet_hours: boolean;
          quiet_start: number;
          quiet_end: number;
          quiet_allow_invites: boolean;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          daily_reminder?: boolean;
          daily_reminder_hour?: number;
          room_invites?: boolean;
          friend_requests?: boolean;
          quiet_hours?: boolean;
          quiet_start?: number;
          quiet_end?: number;
          quiet_allow_invites?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          daily_reminder?: boolean;
          daily_reminder_hour?: number;
          room_invites?: boolean;
          friend_requests?: boolean;
          quiet_hours?: boolean;
          quiet_start?: number;
          quiet_end?: number;
          quiet_allow_invites?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      /** Released bonus puzzles' cards (bonus.ts); the puzzle itself is bonus_puzzle(). */
      bonus_cards: {
        Row: { day: string; title: string; theme: string | null; author: string; width: number; height: number; blocks: string; identity: string };
        Relationships: [];
      };
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
      /** Friends: sends a request by username; 'pending', 'accepted' (they had asked first) or 'sent' (a block: nothing written). Refusals are `friends:<code>` exceptions. */
      send_friend_request: { Args: { p_username: string }; Returns: "pending" | "accepted" | "sent" };
      respond_friend_request: { Args: { p_requester: string; p_accept: boolean }; Returns: undefined };
      /** Accounts the caller shared a room with, from the game rows the sweep keeps. */
      recent_opponents: { Args: Record<string, never>; Returns: { user_id: string; username: string; games: number; last_at: string }[] };
      /** Which of the caller's accepted friends have finished a puzzle, by its `puzzleIdentity()` key (spec §3.8): the mode and the day, never a time. */
      friend_solves: { Args: { p_puzzle_key: string }; Returns: { user_id: string; mode: string; completed_day: string }[] };
      /** Files the racer's reply to a raced share link; its id, or null (own link, unknown sender, already replied). */
      reply_to_race: {
        Args: { p_share_id: string; p_reply_share_id: string | null; p_name: string; p_day: string | null; p_slot: string | null; p_short_id?: string | null; p_seconds: number; p_to_seconds: number };
        Returns: string | null;
      };
      /** The day's bonus puzzle (transfer JSON) for a Plus caller; null otherwise. */
      bonus_puzzle: { Args: { p_day: string }; Returns: unknown };
      /** The caller's daily results with how many solvers they beat each day (Plus; nothing otherwise). */
      my_daily_results: { Args: { p_since: string | null }; Returns: { day: string; slot: string; seconds: number; solvers: number; faster_than: number | string | null }[] };
      /** Wins and losses against each accepted friend on the dailies both finished (Plus). */
      my_head_to_head: { Args: { p_since: string | null }; Returns: { friend_id: string; username: string; played: number; wins: number; losses: number; ties: number }[] };
      /** The caller's ten slowest clues from their play sessions (Plus). */
      my_slow_clues: { Args: { p_since: string | null }; Returns: { puzzle_title: string; clue: string; seconds: number; played_on: string }[] };
      /** Repairs the caller's daily streak (Plus): yesterday, missed right after a streak, counts again; true when it now does. */
      repair_streak: { Args: { p_day: string; p_puzzle_key: string; p_today: string }; Returns: boolean };
      /** The sender marks replies to their links seen. */
      mark_race_replies_seen: { Args: { p_ids: string[] }; Returns: undefined };
      /** Files a replay code and returns its 11-character share ID (the same code, the same ID). */
      create_replay_share: { Args: { p_code: string }; Returns: string };
      /** Files a finished solve's race recording; true when it replaced a slower one (or was the first). */
      save_solve_trace: { Args: { p_puzzle_key: string; p_seconds: number; p_events: unknown }; Returns: boolean };
      /** Raceable recordings of a puzzle: friends first, then up to 10 fastest public ones; `seconds` only for Plus callers. */
      race_candidates: { Args: { p_puzzle_key: string }; Returns: { user_id: string; username: string; seconds: number | null; friend: boolean }[] };
      /** A recording to race or replay (Plus); letters stripped to 1/0 until the caller has finished the puzzle. */
      solve_trace: { Args: { p_user: string; p_puzzle_key: string }; Returns: { seconds: number; events: unknown; with_letters: boolean }[] };
      /** Which of a room's players have finished its puzzle before (the host or a player may ask): the mode, never a time. */
      room_solves: { Args: { p_game_id: string; p_puzzle_key: string }; Returns: { user_id: string; mode: string }[] };
      /** Invites an accepted friend into a waiting room the caller is in; the invite id, or null when a block swallowed it. */
      invite_to_room: { Args: { p_game_id: string; p_friend: string }; Returns: string | null };
      /** Sends a friend a daily "beat my time" link (the /daily/:day/:slot path only). */
      send_beat: { Args: { p_friend: string; p_link: string }; Returns: string | null };
      mark_invites_seen: { Args: { p_ids: string[] }; Returns: undefined };
      /** The invitee's "Can't now" on an open room invite (phase f); the only response is 'declined'. */
      respond_room_invite: { Args: { p_invite: string; p_response: "declined" }; Returns: undefined };
      /** A waiting joiner asks the host to come back (the away spell as the joiner saw it begin); `{ id, nextInSeconds }`, the id null when a block swallowed it. */
      nudge_host: { Args: { p_game_id: string; p_spell?: string | null }; Returns: { id: string | null; nextInSeconds: number } };
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
