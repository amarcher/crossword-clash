/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Sentry DSN. Error reporting is a no-op when unset (and always off in mobile mode). */
  readonly VITE_SENTRY_DSN?: string;
  /** "1" exposes /studio outside dev builds. */
  readonly VITE_STUDIO?: string;
}
