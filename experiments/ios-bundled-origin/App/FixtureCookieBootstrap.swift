import Foundation
import WebKit

// Test-only identity priming over normal WebKit TLS validation. No script,
// message handler, redirect, native cookie injection or trust override is used.
final class FixtureCookieBootstrap: NSObject, WKNavigationDelegate {
    private let entry: URL
    private let policy: ExperimentPolicy
    private let web: WKWebView
    private let completion: (Bool) -> Void
    private var finished = false
    private var expectedResponse = false

    init(entry: URL, store: WKWebsiteDataStore, completion: @escaping (Bool) -> Void) {
        self.entry = entry
        policy = ExperimentPolicy(entry: entry)
        self.completion = completion
        let config = WKWebViewConfiguration()
        config.websiteDataStore = store
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        web = WKWebView(frame: .zero, configuration: config)
        super.init()
        web.navigationDelegate = self
    }
    func start() { web.load(URLRequest(url: entry)) }
    private func finish(_ success: Bool) {
        guard !finished else { return }
        finished = true
        web.stopLoading()
        completion(success)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let allowed = action.targetFrame?.isMainFrame == true && action.request.url.map { policy.allowsDocument($0) } == true
        decisionHandler(allowed ? .allow : .cancel)
        if !allowed { finish(false) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        expectedResponse = response.isForMainFrame && response.response.url.map { policy.allowsDocument($0) } == true && (response.response as? HTTPURLResponse)?.statusCode == 200
        decisionHandler(expectedResponse ? .allow : .cancel)
        if !expectedResponse { finish(false) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard expectedResponse, webView.url.map({ policy.allowsDocument($0) }) == true else { finish(false); return }
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self, !self.finished, self.web.url.map({ self.policy.allowsDocument($0) }) == true else { return }
            self.finish(cookies.contains { $0.name == "fixture_session" && $0.value == "bob" && $0.domain == "127.0.0.1" && $0.path == "/" && $0.isSecure && $0.isHTTPOnly && $0.sameSitePolicy?.rawValue.lowercased() == "lax" })
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(false) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(false) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(false) }
}
