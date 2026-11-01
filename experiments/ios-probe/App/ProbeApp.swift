import UIKit
import WebKit
import AuthenticationServices

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {}

// One diagnostic window, connected to the scene supplied by UIKit. Keep the
// controller and its existing origin/auth/measurement boundaries unchanged.
final class ProbeSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = ProbeController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

// Experiment only. No JS-to-native message handler, cookie export, fixture
// identity, custom TLS trust, permission grant or production auth workaround.
final class ProbeController: UIViewController, WKNavigationDelegate, WKUIDelegate, ASWebAuthenticationPresentationContextProviding {
    private var web: WKWebView!
    private let measurementsEnabled = !ProcessInfo.processInfo.arguments.contains("--probe-native-only")
    private let htmlImages = ProcessInfo.processInfo.arguments.contains("--probe-html-images")
    private let serializedDecodes = ProcessInfo.processInfo.arguments.contains("--probe-serialize-decodes")
    private let sceneSnapshotEnabled = ProcessInfo.processInfo.arguments.contains("--probe-scene-snapshot")
    private let renderPhasesEnabled = ProcessInfo.processInfo.arguments.contains("--probe-render-phases")
    private var phaseID: String?
    private var phaseTimer: Timer?
    private var phaseReplyDeadline: Timer?
    private var phaseReplyStarted: TimeInterval = 0
    private var phaseButton: UIButton?
    private var entry: URL { renderPhasesEnabled ? policy.diagnosticEntry : policy.entry }
    private var snapshotScript = ""
    private var documentTerminated = false
    private var policy: ProbePolicy!
    private var isolation: ProbeIsolation!
    private let status = UILabel()
    private var timer: Timer?
    private var deadline: Timer?
    private var finalization: Timer?
    private var output: FileHandle?
    private var sampling = false
    private var stopping = false
    private var navigationID = UUID().uuidString
    private var recordCount = 0
    private let http = ProbeHTTP()
    private var signInTask: Task<Void, Never>?
    private var authentication: ASWebAuthenticationSession?
    private var authGeneration = UUID()
    private let world = WKContentWorld.world(name: "TypeSafeProbeMeasurements")
    private let start = ProcessInfo.processInfo.systemUptime

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        status.numberOfLines = 2
        status.text = "Development probe · no device acceptance yet"
        do {
            let entry = Bundle.main.object(forInfoDictionaryKey: "ProbeEntry") as? String ?? ""
            guard let url = URL(string: entry) else { throw URLError(.badURL) }
            policy = try ProbePolicy(entry: url)
            isolation = try ProbeIsolation(arguments: ProcessInfo.processInfo.arguments)
            guard !(serializedDecodes && htmlImages) else { throw URLError(.badURL) }
            guard let scriptURL = Bundle.main.url(forResource: "probe", withExtension: "js") else { throw CocoaError(.fileNoSuchFile) }
            let source = try String(contentsOf: scriptURL, encoding: .utf8)
            snapshotScript = source + "\nIOSProbe.sceneSnapshot();"
            let script = source + "\nIOSProbe.install();"
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            if serializedDecodes || htmlImages {
                guard let decodeURL = Bundle.main.url(forResource: "decode-queue", withExtension: "js") else { throw CocoaError(.fileNoSuchFile) }
                let action = htmlImages ? "useHTMLImages" : "install"
                let decodeScript = try String(contentsOf: decodeURL, encoding: .utf8) + "\nIOSProbeDecodes.\(action)();"
                configuration.userContentController.addUserScript(WKUserScript(source: decodeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
            }
            if renderPhasesEnabled {
                guard let phaseURL = Bundle.main.url(forResource: "phase-capture", withExtension: "js") else { throw CocoaError(.fileNoSuchFile) }
                let phaseScript = try String(contentsOf: phaseURL, encoding: .utf8) + "\nIOSProbePhases.install();"
                configuration.userContentController.addUserScript(WKUserScript(source: phaseScript, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
            }
            if measurementsEnabled {
                configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world))
            }
            web = WKWebView(frame: .zero, configuration: configuration)
            web.isInspectable = true
            web.navigationDelegate = self
            web.uiDelegate = self
            let reload = button("Reload", #selector(reloadPage))
            let browser = button("Browser", #selector(openBrowser))
            let stop = button("Stop", #selector(stopRecording))
            var controls: [UIView] = [reload, browser, stop]
            if renderPhasesEnabled {
                let phases = button("Phases", #selector(capturePhases)); phaseButton = phases; controls.append(phases)
            }
            let actions = UIStackView(arrangedSubviews: controls)
            actions.axis = .horizontal; actions.spacing = 8; actions.distribution = .fillEqually
            let toolbar = UIStackView(arrangedSubviews: [status, actions])
            toolbar.axis = .vertical; toolbar.spacing = 4; toolbar.alignment = .fill
            toolbar.translatesAutoresizingMaskIntoConstraints = false
            web.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(toolbar); view.addSubview(web)
            NSLayoutConstraint.activate([
                toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                toolbar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
                toolbar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
                toolbar.heightAnchor.constraint(equalToConstant: 84),
                actions.heightAnchor.constraint(equalToConstant: 44),
                web.topAnchor.constraint(equalTo: toolbar.bottomAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
                web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
            ])
            try beginRecording()
            loadWithIsolation()
            for name in [UIApplication.didEnterBackgroundNotification, UIApplication.willEnterForegroundNotification, ProcessInfo.thermalStateDidChangeNotification] {
                NotificationCenter.default.addObserver(self, selector: #selector(lifecycle(_:)), name: name, object: nil)
            }
        } catch {
            status.text = "Probe configuration failed"
            status.frame = view.bounds; view.addSubview(status)
        }
    }
    private func loadWithIsolation() {
        guard let rules = isolation.rulesJSON else { web.load(URLRequest(url: entry)); return }
        status.text = "DIAGNOSTIC · excludes " + isolation.groups.joined(separator: ", ")
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "TypeSafeProbeIsolation-" + isolation.groups.joined(separator: "-"), encodedContentRuleList: rules) { [weak self] list, _ in
            guard let self, !self.stopping, self.output != nil else { return }
            guard let list else {
                self.append(["event": "asset-isolation-failed"])
                self.status.text = "Isolation setup failed · no page loaded"
                self.finish(reason: "isolation-failed"); return
            }
            self.web.configuration.userContentController.add(list)
            self.append(["event": "asset-isolation-applied", "blockedAssetGroups": self.isolation.groups])
            self.web.load(URLRequest(url: self.entry))
        }
    }
    private func button(_ title: String, _ action: Selector) -> UIButton {
        let result = UIButton(type: .system)
        result.setTitle(title, for: .normal)
        result.addTarget(self, action: action, for: .touchUpInside)
        NSLayoutConstraint.activate([
            result.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            result.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        return result
    }
    private func beginRecording() throws {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = directory.appendingPathComponent("probe-\(UUID().uuidString).jsonl")
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw CocoaError(.fileWriteUnknown) }
        output = try FileHandle(forWritingTo: url)
        append(["event": "start", "sourceSHA": Bundle.main.object(forInfoDictionaryKey: "ProbeSourceSHA") ?? "unknown",
                "sourceDirty": Bundle.main.object(forInfoDictionaryKey: "ProbeSourceDirty") ?? "unknown",
                "os": UIDevice.current.systemVersion, "deviceClass": UIDevice.current.model,
                "host": policy.entry.host ?? "unknown", "configuration": Bundle.main.object(forInfoDictionaryKey: "ProbeConfiguration") ?? "unknown",
                "measurementMode": measurementsEnabled ? "raf-and-native" : "native-only",
                "blockedAssetGroups": isolation.groups,
                "sceneSnapshotEnabled": sceneSnapshotEnabled,
                "renderPhasesEnabled": renderPhasesEnabled,
                "serializedDecodes": serializedDecodes,
                "htmlImages": htmlImages,
                "memoryScope": "WebContent/GPU memory unavailable here; collect with Instruments separately"])
        guard output != nil else { return }
        if serializedDecodes || htmlImages { status.text = "DIAGNOSTIC · " + (htmlImages ? "HTML image decoder" : "serial Blob decoder") }
        UIApplication.shared.isIdleTimerDisabled = true
        if measurementsEnabled { timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.sample() } }
        deadline = Timer.scheduledTimer(withTimeInterval: 1800, repeats: false) { [weak self] _ in self?.finish(reason: "deadline") }
    }
    private func append(_ value: [String: Any]) {
        guard let output else { return }
        var record = value
        record["nativeElapsedSeconds"] = ProcessInfo.processInfo.systemUptime - start
        record["thermalState"] = ProcessInfo.processInfo.thermalState.rawValue
        record["lowPowerMode"] = ProcessInfo.processInfo.isLowPowerModeEnabled
        record["navigationID"] = navigationID
        record["timestamp"] = ISO8601DateFormatter().string(from: Date())
        do {
            var data = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
            data.append(0x0a); try output.write(contentsOf: data); try output.synchronize()
        } catch {
            timer?.invalidate(); deadline?.invalidate(); finalization?.invalidate()
            try? output.close(); self.output = nil
            cancelPhases(reason: "write-failed")
            UIApplication.shared.isIdleTimerDisabled = false
            status.text = "Evidence write failed; run is incomplete"
        }
    }
    private func sample() {
        if ProcessInfo.processInfo.systemUptime - start >= 1800 { finish(reason: "deadline"); return }
        guard measurementsEnabled, !sampling, !stopping, output != nil, let url = web.url, policy.allows(url) else { return }
        let sampledNavigation = navigationID
        sampling = true
        web.evaluateJavaScript("globalThis.__iosProbe?.read() ?? null", in: nil, in: world) { [weak self] result in
            guard let self else { return }
            self.sampling = false
            guard self.output != nil, self.navigationID == sampledNavigation else { return }
            switch result {
            case .success(let value):
                if let data = value as? [String: Any] {
                    self.append(["event": "sample", "page": data]); self.recordCount += 1
                    guard self.output != nil else { return }
                    let ready = data["ready"] as? Bool ?? false
                    if !self.stopping && self.phaseID == nil { self.status.text = (self.isolation.groups.isEmpty ? "" : "DIAGNOSTIC · ") + "\(ready ? "Scene ready" : "Sign-in/loading") · \(self.recordCount) samples\nThermal \(ProcessInfo.processInfo.thermalState.rawValue)" }
                }
            case .failure: self.append(["event": "sample-unavailable"])
            }
        }
    }
    @objc private func capturePhases() {
        guard renderPhasesEnabled, phaseID == nil, !stopping, !documentTerminated, output != nil,
              UIApplication.shared.applicationState == .active, let url = web.url, policy.allows(url) else { return }
        let id = UUID().uuidString, navigation = navigationID
        phaseID = id; phaseButton?.isEnabled = false
        status.text = "Checking full-scene phase capture"
        phaseReplyStarted = ProcessInfo.processInfo.systemUptime
        phaseReplyDeadline = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
            guard let self, self.phaseID == id else { return }; self.cancelPhases(reason: "start-timeout")
        }
        web.evaluateJavaScript("globalThis.__iosProbePhaseCapture?.start('\(id)') ?? {status:'unsupported'}", in: nil, in: .page) { [weak self] result in
            guard let self, self.phaseID == id, self.navigationID == navigation, !self.stopping, !self.documentTerminated, self.output != nil else { return }
            guard ProbePhaseEvidence.replyIsTimely(startedAt: self.phaseReplyStarted, now: ProcessInfo.processInfo.systemUptime) else { self.cancelPhases(reason: "start-timeout"); return }
            self.phaseReplyDeadline?.invalidate()
            guard case .success(let value) = result, let evidence = ProbePhaseEvidence.sanitize(value) else { self.cancelPhases(reason: "start-unavailable"); return }
            self.append(["event": "phase-capture-start", "captureID": id, "page": evidence])
            guard self.output != nil else { return }
            guard evidence["status"] as? String == "started" else {
                self.retirePhases(); self.status.text = "Phase capture: " + (evidence["status"] as? String ?? "unavailable"); return
            }
            self.status.text = "Recording 30 seconds of render phases"
            self.phaseTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in self?.finishPhases(id: id, navigation: navigation) }
        }
    }
    private func finishPhases(id: String, navigation: String) {
        guard phaseID == id, navigationID == navigation, !stopping, !documentTerminated, output != nil else { return }
        phaseReplyStarted = ProcessInfo.processInfo.systemUptime
        phaseReplyDeadline = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
            guard let self, self.phaseID == id else { return }; self.cancelPhases(reason: "stop-timeout")
        }
        web.evaluateJavaScript("globalThis.__iosProbePhaseCapture?.stop('\(id)') ?? {status:'unsupported'}", in: nil, in: .page) { [weak self] result in
            guard let self, self.phaseID == id, self.navigationID == navigation, !self.stopping, !self.documentTerminated, self.output != nil else { return }
            guard ProbePhaseEvidence.replyIsTimely(startedAt: self.phaseReplyStarted, now: ProcessInfo.processInfo.systemUptime) else { self.cancelPhases(reason: "stop-timeout"); return }
            self.retirePhases()
            guard case .success(let value) = result, let evidence = ProbePhaseEvidence.sanitize(value) else {
                self.append(["event": "phase-capture-unavailable", "captureID": id]); if self.output != nil { self.status.text = "Phase capture unavailable" }; return
            }
            self.append(["event": "phase-capture", "captureID": id, "page": evidence])
            if self.output != nil { self.status.text = "Phase capture: " + (evidence["status"] as? String ?? "unavailable") }
        }
    }
    private func retirePhases() {
        phaseID = nil; phaseTimer?.invalidate(); phaseReplyDeadline?.invalidate(); phaseButton?.isEnabled = true
    }
    private func cancelPhases(reason: String) {
        guard let id = phaseID else { return }
        retirePhases()
        append(["event": "phase-capture-cancelled", "captureID": id, "reason": reason])
        if !documentTerminated, let url = web?.url, policy?.allows(url) == true {
            web.evaluateJavaScript("globalThis.__iosProbePhaseCapture?.cancel('\(id)')", in: nil, in: .page) { _ in }
        }
    }
    @objc private func reloadPage() { append(["event": "manual-reload"]); web.reload() }
    @objc private func openBrowser() { append(["event": "open-browser"]); UIApplication.shared.open(policy.entry) }
    @objc private func stopRecording() {
        finish(reason: "manual")
    }
    private func finish(reason: String) {
        guard output != nil, !stopping else { return }
        stopping = true; timer?.invalidate(); deadline?.invalidate()
        cancelPhases(reason: "recording-stopped")
        UIApplication.shared.isIdleTimerDisabled = false
        if !measurementsEnabled { closeRecording(reason: reason, drained: true); return }
        let finalNavigation = navigationID
        // A dead WebContent process cannot keep the app recording indefinitely.
        finalization = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in self?.closeRecording(reason: reason, drained: false) }
        web.evaluateJavaScript("globalThis.__iosProbe?.stop() ?? null", in: nil, in: world) { [weak self] result in
            guard let self, self.output != nil else { return }
            if self.navigationID == finalNavigation, case .success(let value) = result, let data = value as? [String: Any] {
                self.append(["event": "final-sample", "page": data])
                self.closeRecording(reason: reason, drained: !self.sampling)
            } else { self.closeRecording(reason: reason, drained: false) }
        }
    }
    private func closeRecording(reason: String, drained: Bool) {
        finalization?.invalidate()
        guard output != nil else { return }
        append(["event": "stop", "reason": reason, "finalDrainComplete": drained])
        guard output != nil else { return } // Preserve a write-failure message.
        try? output?.close(); output = nil
        status.text = drained ? "Stopped · evidence in app Documents" : "Stopped · final sample incomplete"
    }
    @objc private func lifecycle(_ notification: Notification) {
        if notification.name == UIApplication.didEnterBackgroundNotification { cancelPhases(reason: "background") }
        append(["event": notification.name.rawValue])
        if ProcessInfo.processInfo.systemUptime - start >= 1800 { finish(reason: "deadline") }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { view.window! }
    private func signInWithGitHub() {
        guard signInTask == nil else { return }
        let generation = UUID(); authGeneration = generation
        append(["event": "github-auth-start"])
        status.text = "Complete GitHub sign-in in the system browser"
        // Same public client and exchange contract as desktop/main.js + auth.js.
        let flow = ProbeDeviceAuth(origin: URL(string: "https://typesafe.place")!, clientID: "client_01M3ZHFZDKDSTJ2RNSMP5V9SKV",
            send: { [http] in try await http.send($0) },
            sleep: { seconds in try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) }, now: { ProcessInfo.processInfo.systemUptime })
        signInTask = Task { [weak self] in
            guard let self else { return }
            do {
                let cookie = try await flow.run { [weak self] url in
                    guard let self, self.authGeneration == generation else { return false }
                    let session = ASWebAuthenticationSession(url: url, callbackURLScheme: nil) { [weak self] _, _ in
                        Task { @MainActor in
                            guard let self, self.authGeneration == generation else { return }
                            self.signInTask?.cancel()
                        }
                    }
                    session.presentationContextProvider = self
                    session.prefersEphemeralWebBrowserSession = true
                    self.authentication = session
                    return session.start()
                }
                try Task.checkCancellation()
                guard self.authGeneration == generation else { return }
                // Device authorization has completed. Retire the callback before
                // dismissing its browser so dismissal cannot cancel cookie import.
                self.authGeneration = UUID(); self.authentication?.cancel(); self.authentication = nil
                await self.web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
                self.append(["event": "github-auth-exchanged"])
                self.web.load(URLRequest(url: self.entry))
            } catch {
                self.authGeneration = UUID(); self.authentication?.cancel(); self.authentication = nil
                let category = error is CancellationError ? "cancelled" : error is DeviceAuthError ? "provider-or-exchange" : "network"
                self.append(["event": "github-auth-failed", "category": category])
                self.status.text = category == "cancelled" ? "Sign-in cancelled; retry when ready" : "GitHub sign-in failed; retry from the page"
            }
            self.signInTask = nil
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        // Third-party HTTPS frames (e.g. Turnstile) receive no injected script or native interface.
        let subframe = action.targetFrame != nil && action.targetFrame?.isMainFrame == false
        if !subframe, action.sourceFrame.isMainFrame, action.navigationType == .linkActivated,
           policy.allows(url), url.path == "/auth/login" {
            decisionHandler(.cancel); signInWithGitHub(); return
        }
        let allowed = subframe ? policy.allowsSubframe(url) : policy.allows(url)
        if !allowed {
            // Only bounded classes, never challenge paths, queries or auth codes.
            let kind = url.scheme == "about" ? "about-document" : url.host == "challenges.cloudflare.com" ? "turnstile" : policy.allows(url) ? "same-origin" : "external"
            append(["event": "navigation-blocked", "mainFrame": !subframe, "targetClass": kind])
            status.text = "External navigation blocked · auth integration remains open"
        }
        decisionHandler(allowed ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let allowed = !response.isForMainFrame || response.response.url.map { policy.allows($0) } == true
        if !allowed { append(["event": "response-origin-blocked"]) }
        decisionHandler(allowed ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { cancelPhases(reason: "navigation"); documentTerminated = false; navigationID = UUID().uuidString; append(["event": "navigation-start"]) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        append(["event": "navigation-finish"]); sample()
        guard sceneSnapshotEnabled else { return }
        let sampledNavigation = navigationID
        for delay in (serializedDecodes || htmlImages) ? [2.0, 20.0] : [20.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, !self.stopping, !self.documentTerminated, self.output != nil, self.navigationID == sampledNavigation,
                      let url = self.web.url, self.policy.allows(url) else { return }
                self.web.evaluateJavaScript(self.snapshotScript, in: nil, in: self.world) { [weak self] result in
                    guard let self, !self.stopping, !self.documentTerminated, self.output != nil, self.navigationID == sampledNavigation else { return }
                    if case .success(let value) = result, let data = value as? [String: Any] {
                        self.append(["event": "scene-snapshot", "snapshotDelaySeconds": delay, "page": data])
                    } else { self.append(["event": "scene-snapshot-unavailable"]) }
                }
            }
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { append(["event": "navigation-failed", "code": (error as NSError).code]); status.text = "Load failed · retry with Reload" }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { documentTerminated = true; cancelPhases(reason: "renderer-terminated"); append(["event": "web-content-terminated"]); status.text = "Web content terminated · manual Reload required" }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
}
