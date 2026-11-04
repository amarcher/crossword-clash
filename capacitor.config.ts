import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.crosswordclash.app",
  appName: "Crossword Clash",
  webDir: "dist",
  // "debug": the web console reaches the native log in debug builds only; release builds stay silent.
  loggingBehavior: "debug",
  backgroundColor: "#ffffff",
  ios: { contentInset: "never" },
  plugins: {
    // Native sign-in offers Apple and Google only. `facebook: false` makes the
    // plugin link stub classes instead of the Facebook SDK: that SDK's privacy
    // manifest declares tracking (a tracking domain and the device id for
    // third-party advertising), which would make Apple's aggregated privacy
    // report contradict the App Privacy answers, and on Android it adds the
    // AD_ID permission the Play declaration says the app does not use.
    SocialLogin: { providers: { apple: true, google: true, facebook: false } },
    // iOS shows nothing for a push that arrives while the app is in the
    // foreground unless the app asks: a room invite sent while the other
    // player was still on the last race's finished screen reached nobody
    // (2026-11-03). The in-app banner is hidden on the play screens, so the
    // OS banner is the one that gets through there.
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
  // Remote NYT pages are presented by NytImporter in a separate, unbridged view.
  // Never add NYT to server.allowNavigation or enable cookie/HTTP interception.
};

export default config;
