import UIKit
import WebKit
import CryptoKit

// #286 bundled-origin experiment, simulator only. One WKWebView loads the play
// client either from the loopback fixture (`--mode hosted`, the origin the
// deployed site has) or from a directory of the play-only build served on a
// custom scheme (`--mode bundled`, `capacitor://localhost`, which is how a
// packaged Capacitor app serves its bundle). The injected harness (Web/harness.js)
// runs the same checks in both and the app writes them to Documents/results.json.
// No signing, no production origin, no credential beyond the fixture's test
// identity, no native bridge the client can call.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {}

// The iOS 27 SDK refuses to launch an app without the scene life cycle (Info.plist
// names this class for the one window scene).
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = ExperimentController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

struct Launch {
    enum Mode: String { case hosted, bundled }
    let mode: Mode
    let api: URL          // the fixture's web origin (Vite dev server proxying the town)
    let witness: URL      // the header witness, which echoes what the WebView sent
    let playDir: URL?     // dist/play, served on the custom scheme in bundled mode
    let csp: Bool         // bundled mode: deliver the archived source CSP snapshot
    let workerPath: String
    let contextParity: Bool
    let httpsCookieBootstrap: Bool
    static func parse(_ arguments: [String]) throws -> Launch {
        var values: [String: String] = [:]
        var index = 1
        while index < arguments.count {
            let key = arguments[index]
            if key == "--https-cookie-bootstrap" {
                guard values["https-cookie-bootstrap"] == nil else { throw URLError(.badURL) }
                values["https-cookie-bootstrap"] = "1"; index += 1; continue
            }
            if key == "--context-parity" {
                guard values["context-parity"] == nil else { throw URLError(.badURL) }
                values["context-parity"] = "1"; index += 1; continue
            }
            if key == "--csp" { values["csp"] = "1"; index += 1; continue }
            guard ["--mode", "--api", "--witness", "--play-dir", "--worker"].contains(key), index + 1 < arguments.count, values[String(key.dropFirst(2))] == nil else { throw URLError(.badURL) }
            values[String(key.dropFirst(2))] = arguments[index + 1]; index += 2
        }
        guard let mode = Mode(rawValue: values["mode"] ?? ""), let api = URL(string: values["api"] ?? ""), let witness = URL(string: values["witness"] ?? "") else { throw URLError(.badURL) }
        guard ExperimentPolicy.isFixtureOrigin(api), ExperimentPolicy.isFixtureOrigin(witness) else { throw URLError(.badURL) }
        let playDir = values["play-dir"].map { URL(fileURLWithPath: $0, isDirectory: true) }
        if mode == .bundled && playDir == nil { throw URLError(.badURL) }
        if values["context-parity"] == "1" && mode != .bundled { throw URLError(.badURL) }
        if values["https-cookie-bootstrap"] == "1" && (values["context-parity"] == "1" || ExperimentPolicy.secureBootstrapURL(api) == nil) { throw URLError(.badURL) }
        return Launch(mode: mode, api: api, witness: witness, playDir: playDir, csp: values["csp"] == "1", workerPath: values["worker"] ?? "", contextParity: values["context-parity"] == "1", httpsCookieBootstrap: values["https-cookie-bootstrap"] == "1")
    }
}

// Frozen 27 October source-policy snapshot, retained for the historical
// experiment. This is not the current deployed policy (main later added the
// Computer frame origin); no live-deployment equivalence is claimed.
let archivedCSP = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob: https://*.livekit.cloud wss://*.livekit.cloud; worker-src 'self' blob:; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

// Serves the play-only build from a directory on `capacitor://localhost`, the way a
// packaged bundle is served, and records every request the client makes to that
// origin. The client's relative API, auth and socket URLs land here too: there is
// no server at a bundled origin, so they are answered 404 and recorded.
final class PlayDirectoryHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private let csp: Bool
    private let effectiveCSP: String
    let sourcePolicySHA256: String?
    private(set) var requests: [[String: Any]] = []
    private let types = ["html": "text/html; charset=utf-8", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css", "json": "application/json", "glb": "model/gltf-binary", "hdr": "image/vnd.radiance", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "svg": "image/svg+xml", "mp4": "video/mp4", "webm": "video/webm", "vtt": "text/vtt", "woff2": "font/woff2", "woff": "font/woff", "wasm": "application/wasm", "ktx2": "image/ktx2", "txt": "text/plain", "md": "text/markdown"]
    init(root: URL, csp: Bool, sourcePolicy: Data? = nil) throws {
        self.root = root.standardizedFileURL; self.csp = csp
        if let sourcePolicy {
            guard let text = String(data: sourcePolicy, encoding: .utf8) else { throw URLError(.badServerResponse) }
            effectiveCSP = text.trimmingCharacters(in: .whitespacesAndNewlines)
            sourcePolicySHA256 = SHA256.hash(data: sourcePolicy).map { String(format: "%02x", $0) }.joined()
        } else {
            effectiveCSP = archivedCSP; sourcePolicySHA256 = nil
        }
    }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let served = path.hasPrefix("/api/") || path.hasPrefix("/auth/") || path == "/multiplayer" ? "no-server" : "file"
        if served == "no-server" {
            requests.append(["path": path, "method": task.request.httpMethod ?? "GET", "result": "404 no server at the bundled origin"])
            respond(task, url: url, status: 404, type: "application/json", body: Data("{\"error\":\"no server at the bundled origin\"}".utf8)); return
        }
        guard let file = ExperimentPolicy.bundleFile(root: root, url: url, method: task.request.httpMethod ?? ""),
              let data = FileManager.default.contents(atPath: file.path) else {
            requests.append(["path": path, "method": task.request.httpMethod ?? "GET", "result": "404 not in the bundle"])
            respond(task, url: url, status: 404, type: "text/plain", body: Data("not in the bundle".utf8)); return
        }
        requests.append(["path": path, "method": task.request.httpMethod ?? "GET", "result": "200", "bytes": data.count])
        respond(task, url: url, status: 200, type: types[file.pathExtension.lowercased()] ?? "application/octet-stream", body: data)
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, type: String, body: Data) {
        var headers = ["Content-Type": type, "Content-Length": String(body.count), "Cache-Control": "no-store"]
        if csp && type.hasPrefix("text/html") { headers["Content-Security-Policy"] = effectiveCSP }
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else { task.didFailWithError(URLError(.badServerResponse)); return }
        task.didReceive(response); task.didReceive(body); task.didFinish()
    }
}

final class ExperimentController: UIViewController, WKNavigationDelegate {
    private var web: WKWebView!
    private var launch: Launch!
    private var policy: ExperimentPolicy!
    private let contentWorld = WKContentWorld.world(name: "TypeSafeBundledOriginHarness")
    private var handler: PlayDirectoryHandler?
    private let status = UILabel()
    private var bootstrapper: FixtureCookieBootstrap?
    private var originFinalizing = false
    private var finished = false
    private let captureID = UUID().uuidString
    private var captureGeneration = UUID()
    private var navigationCount = 0
    private var parityResults: [String: [String: Any]] = [:]
    private var captureDeadline: Timer?
    private let started = Date()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        status.numberOfLines = 3
        status.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(status)
        NSLayoutConstraint.activate([
            status.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            status.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
            status.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            status.heightAnchor.constraint(equalToConstant: 48),
        ])
        do {
            launch = try Launch.parse(ProcessInfo.processInfo.arguments)
            let entry = launch.mode == .hosted ? launch.api : URL(string: "capacitor://localhost/index.html")!
            policy = ExperimentPolicy(entry: entry)
            status.text = "bundled-origin experiment · \(launch.mode.rawValue)"
            let configuration = WKWebViewConfiguration()
            // A fresh, non-persistent store per launch: nothing carries between modes or runs.
            configuration.websiteDataStore = .nonPersistent()
            if launch.mode == .bundled, let playDir = launch.playDir {
                let sourcePolicy = launch.contextParity ? try ExperimentPolicy.sourcePolicy(root: playDir) : nil
                let handler = try PlayDirectoryHandler(root: playDir, csp: launch.csp, sourcePolicy: sourcePolicy)
                self.handler = handler
                configuration.setURLSchemeHandler(handler, forURLScheme: "capacitor")
            }
            if launch.contextParity {
                guard let scriptURL = Bundle.main.url(forResource: "context-parity", withExtension: "js") else { throw CocoaError(.fileNoSuchFile) }
                let script = try String(contentsOf: scriptURL, encoding: .utf8)
                for (role, world) in [("page", WKContentWorld.page), ("isolated", contentWorld)] {
                    var target = URLComponents(url: launch.witness.appendingPathComponent("witness/get"), resolvingAgainstBaseURL: false)!
                    target.queryItems = [URLQueryItem(name: "context", value: role), URLQueryItem(name: "run", value: captureID)]
                    let config = ["role": role, "nonce": captureID, "target": target.url!.absoluteString]
                    let json = String(data: try JSONSerialization.data(withJSONObject: config), encoding: .utf8)!
                    configuration.userContentController.addUserScript(WKUserScript(source: script + "\nContextParityProbe.start(\(json));", injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world))
                }
                // This mode registers no JS-to-native handler, in either world.
            } else {
                let config: [String: Any] = ["mode": launch.mode.rawValue, "api": launch.api.absoluteString, "witness": launch.witness.absoluteString, "csp": launch.csp, "workerPath": launch.workerPath, "captureID": captureID]
                let configJSON = String(data: try JSONSerialization.data(withJSONObject: config), encoding: .utf8)!
                guard let scriptURL = Bundle.main.url(forResource: "harness", withExtension: "js") else { throw CocoaError(.fileNoSuchFile) }
                let source = try String(contentsOf: scriptURL, encoding: .utf8) + "\nBundledOriginHarness.start(\(configJSON));"
                configuration.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
            }
            web = WKWebView(frame: .zero, configuration: configuration)
            web.isInspectable = true
            web.navigationDelegate = self
            web.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(web)
            NSLayoutConstraint.activate([
                web.topAnchor.constraint(equalTo: status.bottomAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
                web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
            captureDeadline = Timer.scheduledTimer(withTimeInterval: launch.contextParity ? 30 : 110, repeats: false) { [weak self] _ in self?.captureFailure("native-capture-deadline") }
            if launch.contextParity {
                web.load(URLRequest(url: entry))
            } else if launch.httpsCookieBootstrap {
                guard let bootstrapURL = ExperimentPolicy.secureBootstrapURL(launch.api) else { throw URLError(.badURL) }
                bootstrapper = FixtureCookieBootstrap(entry: bootstrapURL, store: configuration.websiteDataStore) { [weak self] success in
                    guard let self, !self.finished else { return }
                    self.bootstrapper = nil
                    if success { self.web.load(URLRequest(url: entry)) }
                    else { self.captureFailure("https-cookie-bootstrap-failed") }
                }
                bootstrapper?.start()
            } else {
                // The fixture's test identity, as the browser journeys set it, for the fixture host only.
                guard let host = launch.api.host, let cookie = HTTPCookie(properties: [.domain: host, .path: "/", .name: "fixture_session", .value: "bob"]) else { throw URLError(.badURL) }
                configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
                    self?.web.load(URLRequest(url: entry))
                }
            }
        } catch {
            status.text = "experiment configuration failed: \(error)"
            write(["error": "configuration: \(error)"])
        }
    }

    private func captureFailure(_ category: String) {
        guard !finished else { return }
        finished = true; captureDeadline?.invalidate()
        write(["error": category, "mode": launch.contextParity ? "context-parity" : launch.mode.rawValue])
        status.text = "Diagnostic capture failed"
    }
    private func collectParity(role: String, world: WKContentWorld, attempt: Int, generation: UUID) {
        guard !finished, generation == captureGeneration, let url = web.url, policy.allowsDocument(url) else { return }
        web.evaluateJavaScript("(() => { const value = globalThis.__typeSafeContextParityResult; return typeof value === 'string' ? (value.length <= 65536 ? value : '__oversize__') : '__pending__'; })()", in: nil, in: world) { [weak self] result in
            guard let self, !self.finished, generation == self.captureGeneration,
                  let url = self.web.url, self.policy.allowsDocument(url) else { return }
            guard case .success(let value) = result else { self.captureFailure("world-evaluation-failed"); return }
            guard let text = value as? String else { self.captureFailure("invalid-result-type"); return }
            if text == "__pending__" {
                guard attempt < 20 else { self.captureFailure("world-result-unavailable"); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.collectParity(role: role, world: world, attempt: attempt + 1, generation: generation) }
                return
            }
            guard let record = self.policy.results(body: text, isMainFrame: true, frameURL: url, currentURL: url),
                  let checks = record["checks"] as? [String: Any], checks["runID"] as? String == self.captureID,
                  checks["role"] as? String == role else { self.captureFailure("invalid-world-result"); return }
            self.parityResults[role] = record
            guard self.parityResults.count == 2 else { return }
            guard let hash = self.handler?.sourcePolicySHA256 else { self.captureFailure("missing-source-policy"); return }
            self.finished = true; self.captureDeadline?.invalidate()
            self.write(["mode": "context-parity", "cspEnabled": self.launch.csp, "sourcePolicySHA256": hash,
                        "worlds": self.parityResults, "registeredMessageHandlers": 0, "navigationCount": self.navigationCount,
                        "execution": "main-frame WKUserScripts, native read-only polling"])
            self.status.text = "done · context results written"
        }
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        captureGeneration = UUID(); parityResults = [:]; navigationCount += 1
        if navigationCount > 1 { captureFailure("unexpected-navigation") }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !finished else { return }
        if !launch.contextParity { collectOrigin(attempt: 0, generation: captureGeneration); return }
        collectParity(role: "page", world: .page, attempt: 0, generation: captureGeneration)
        collectParity(role: "isolated", world: contentWorld, attempt: 0, generation: captureGeneration)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        captureFailure("web-content-terminated")
    }

    private func collectOrigin(attempt: Int, generation: UUID) {
        guard !finished, !originFinalizing, generation == captureGeneration, let url = web.url, policy.allowsDocument(url) else { return }
        web.evaluateJavaScript("(() => { const value = globalThis.__typeSafeBundledOriginResult; return typeof value === 'string' ? (value.length <= 65536 ? value : '__oversize__') : '__pending__'; })()", in: nil, in: .page) { [weak self] result in
            guard let self, !self.finished, generation == self.captureGeneration, let url = self.web.url, self.policy.allowsDocument(url) else { return }
            guard case .success(let value) = result, let text = value as? String else { self.captureFailure("origin-evaluation-failed"); return }
            if text == "__pending__" {
                guard attempt < 105 else { self.captureFailure("origin-result-unavailable"); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.collectOrigin(attempt: attempt + 1, generation: generation) }
                return
            }
            guard let record = self.policy.results(body: text, isMainFrame: true, frameURL: url, currentURL: url),
                  let checks = record["checks"] as? [String: Any], checks["hostCaptureID"] as? String == self.captureID else { self.captureFailure("invalid-origin-result"); return }
            self.finishOriginResults(record, generation: generation)
        }
    }
    private func finishOriginResults(_ results: [String: Any], generation: UUID) {
        guard !finished, !originFinalizing else { return }
        originFinalizing = true
        web.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self, !self.finished, generation == self.captureGeneration, let url = self.web.url, self.policy.allowsDocument(url) else { return }
            self.finished = true; self.captureDeadline?.invalidate()
            var record = results
            record["mode"] = self.launch.mode.rawValue
            record["csp"] = self.launch.csp
            record["measurementWorld"] = "page"
            record["resultTransport"] = "native-poll"
            record["registeredMessageHandlers"] = 0
            record["navigationCount"] = self.navigationCount
            record["elapsedMs"] = Int(Date().timeIntervalSince(self.started) * 1000)
            record["cookieSetup"] = self.launch.httpsCookieBootstrap ? "https-network-bootstrap" : "native-fixture-seed"
            record["cookieJar"] = cookies.map { ["name": $0.name, "domain": $0.domain, "path": $0.path, "secure": $0.isSecure, "httpOnly": $0.isHTTPOnly, "sameSite": $0.sameSitePolicy?.rawValue ?? "none-set"] }
            record["schemeRequests"] = self.handler?.requests ?? []
            record["webKitUserAgent"] = self.web.value(forKey: "userAgent") as? String ?? ""
            self.write(record)
            self.status.text = "done · results written"
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url.map { policy.allowsDocument($0) } == true ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.response.url.map { policy.allowsDocument($0) } == true ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        captureFailure("navigation-failed")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        captureFailure("provisional-navigation-failed")
    }

    private func write(_ record: [String: Any]) {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = directory.appendingPathComponent("results.json")
        guard let data = try? JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
