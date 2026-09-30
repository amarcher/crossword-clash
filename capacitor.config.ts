import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.crosswordclash.app",
  appName: "Crossword Clash",
  webDir: "dist",
  loggingBehavior: "none",
  backgroundColor: "#ffffff",
  ios: { contentInset: "never" },
  // Remote NYT pages are presented by NytImporter in a separate, unbridged view.
  // Never add NYT to server.allowNavigation or enable cookie/HTTP interception.
};

export default config;
