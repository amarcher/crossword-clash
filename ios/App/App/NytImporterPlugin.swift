import Capacitor
import WebKit
import UIKit

class ClashViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NytImporterPlugin())
    }
}

@objc(NytImporterPlugin)
public class NytImporterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NytImporterPlugin"
    public let jsName = "NytImporter"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)]
    private var importer: NytImportViewController?

    @objc func open(_ call: CAPPluginCall) {
        guard let input = call.getString("url"), let url = URL(string: input), NytImportViewController.isPuzzle(url) else {
            call.reject("Choose a dated NYT crossword.", "PAGE"); return
        }
        DispatchQueue.main.async {
            guard self.importer == nil, let presenter = self.bridge?.viewController else {
                call.reject("The importer is already open.", "BUSY"); return
            }
            let controller = NytImportViewController(url: url, labels: call.getObject("labels") as? [String: String] ?? [:])
            self.importer = controller
            controller.finish = { [weak self] result in
                self?.importer = nil
                call.resolve(result)
            }
            let navigation = UINavigationController(rootViewController: controller)
            navigation.modalPresentationStyle = .fullScreen
            presenter.present(navigation, animated: true)
        }
    }
}

/** This WKWebView has no Capacitor bridge and no script message handlers. */
final class NytImportViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let initialURL: URL
    let labels: [String: String]
    var finish: (([String: Any]) -> Void)?
    private var webView: WKWebView!
    private var importButton: UIBarButtonItem!
    private var statusLabel = UILabel()
    private var generation = 0
    private var busy = false
    private var finished = false

    init(url: URL, labels: [String: String]) {
        initialURL = url; self.labels = labels
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func label(_ key: String, _ fallback: String) -> String { labels[key] ?? fallback }

    static func allowed(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil || url.port == 443,
              let host = url.host else { return false }
        return host == "nytimes.com" || host.hasSuffix(".nytimes.com")
    }
    static func isPuzzle(_ url: URL) -> Bool {
        allowed(url) && url.host == "www.nytimes.com" &&
        url.path.range(of: "^/crosswords/game/(daily|mini)/[0-9]{4}/[0-9]{2}/[0-9]{2}/?$", options: .regularExpression) != nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "NYT · nytimes.com"
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        // Default persistent website storage keeps this app's NYT session across launches.
        // Safari's cookies are neither requested nor copied.
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = .preferredFont(forTextStyle: .footnote)
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center
        statusLabel.text = label("hint", "Sign in on NYT, open the selected puzzle, then tap Import.")
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel); view.addSubview(webView)
        NSLayoutConstraint.activate([
            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            webView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: label("close", "Close"), style: .plain, target: self, action: #selector(close))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: label("selected", "Selected puzzle"), style: .plain, target: self, action: #selector(selectedPuzzle))
        importButton = UIBarButtonItem(title: label("import", "Import this puzzle"), style: .done, target: self, action: #selector(importPuzzle))
        toolbarItems = [UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil), importButton,
                        UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)]
        navigationController?.setToolbarHidden(false, animated: false)
        importButton.isEnabled = false
        webView.load(URLRequest(url: initialURL))
    }

    @objc private func close() { complete(["cancelled": true]) }
    @objc private func selectedPuzzle() { webView.load(URLRequest(url: initialURL)) }
    private func complete(_ result: [String: Any]) {
        guard !finished else { return }; finished = true; generation += 1
        webView.stopLoading()
        dismiss(animated: true) { self.finish?(result); self.finish = nil }
    }
    private func showError(_ code: String) {
        busy = false
        importButton.isEnabled = webView.url.map(Self.isPuzzle) ?? false
        statusLabel.text = label(code, label("FORMAT", "This puzzle could not be imported."))
    }
    @objc private func importPuzzle() {
        guard !busy, let url = webView.url, Self.isPuzzle(url) else { showError("PAGE"); return }
        guard let asset = Bundle.main.url(forResource: "nyt-import", withExtension: "js", subdirectory: "public/native"),
              let script = try? String(contentsOf: asset, encoding: .utf8) else { showError("FORMAT"); return }
        busy = true; importButton.isEnabled = false; generation += 1
        let attempt = generation
        statusLabel.text = label("working", "Importing puzzle…")
        // The isolated client world prevents page scripts from replacing our extractor or fetch.
        webView.callAsyncJavaScript("return await (\(script))();", arguments: [:], in: nil, in: .defaultClient) { [weak self] result in
            guard let self = self, !self.finished, self.generation == attempt else { return }
            guard case .success(let value) = result, let json = value as? String, json.utf8.count <= 500_000,
                  let bytes = json.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else {
                self.showError("NETWORK"); return
            }
            if object["status"] as? String == "ok" {
                self.complete(["cancelled": false, "result": json])
            } else { self.showError(object["code"] as? String ?? "FORMAT") }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self = self, self.busy, self.generation == attempt, !self.finished else { return }
            self.generation += 1; self.showError("NETWORK")
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame != false && !Self.allowed(url) {
            statusLabel.text = label("external", "Use NYT email sign-in here. This importer only opens NYT pages.")
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        generation += 1; busy = false; importButton.isEnabled = false
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        importButton.isEnabled = webView.url.map(Self.isPuzzle) ?? false
        statusLabel.text = label("hint", "Sign in on NYT, open the selected puzzle, then tap Import.")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError("NETWORK") }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showError("NETWORK") }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { generation += 1; showError("NETWORK") }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, Self.allowed(url) { webView.load(action.request) }
        else { statusLabel.text = label("external", "Use NYT email sign-in here.") }
        return nil
    }
}
