import Foundation

/// Reissues cross-host web GETs as app-initiated loads, which stay in WKWebView
/// instead of following Universal Links into an installed publisher app.
final class NytNavigationPolicy {
    enum Decision { case allow, cancel, loadInBrowser }
    private var pendingURL: URL?

    static func allowed(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443, let host = url.host else { return false }
        return host == "nytimes.com" || host.hasSuffix(".nytimes.com")
    }

    func prepareToLoad(_ request: URLRequest) { pendingURL = request.url }

    func decide(_ request: URLRequest, sourceURL: URL?, isMainFrame: Bool, opensWindow: Bool) -> Decision {
        guard let url = request.url else { return .cancel }
        // An iframe can also attempt a custom-scheme app launch. Permit its web
        // content, but never hand a custom scheme to the operating system.
        if !isMainFrame && !opensWindow {
            return ["https", "http", "about", "data", "blob"].contains(url.scheme ?? "") ? .allow : .cancel
        }
        guard Self.allowed(url) else { return .cancel }
        let method = (request.httpMethod ?? "GET").uppercased()
        if method == "GET", pendingURL == url, !opensWindow {
            pendingURL = nil
            return .allow
        }
        pendingURL = nil
        // Do not cancel/replay login POSTs: WebKit may not expose their body.
        // A GET redirect after login gets handled on its own navigation callback.
        if method != "GET" { return opensWindow ? .cancel : .allow }
        return opensWindow || sourceURL?.host != url.host ? .loadInBrowser : .allow
    }
}
