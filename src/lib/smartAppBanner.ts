/**
 * Apple's Smart App Banner: Safari on iPhone and iPad shows "Get" over every
 * page that carries `<meta name="apple-itunes-app">` (index.html), or "Open"
 * once the app is installed. Its `app-argument` is the URL the app receives
 * on Open (`appUrlOpen` → `appLinkTarget`), so it follows the current page and
 * an invite, a daily challenge or a community puzzle opens in the app where
 * the visitor already was.
 */
import { IOS_APP_ID } from "./platform";

/** The meta's content for a page. Commas separate the meta's fields, so one inside the URL is escaped. */
export function smartAppBannerContent(href: string): string {
  return `app-id=${IOS_APP_ID}, app-argument=${href.replace(/,/g, "%2C")}`;
}

/** Points the banner at the current page; a no-op where the tag is absent (the apps' build strips it). */
export function syncSmartAppBanner(doc: Document = document, href: string = doc.location.href): void {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]');
  if (meta) meta.content = smartAppBannerContent(href);
}
