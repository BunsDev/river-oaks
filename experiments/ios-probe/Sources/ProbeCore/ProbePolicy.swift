import Foundation
public struct ProbePolicy {
    public let entry: URL
    public init(entry: URL) throws {
        guard Self.isHTTPS(entry), entry.query == nil, entry.fragment == nil else { throw URLError(.badURL) }
        self.entry = entry
    }
    public var diagnosticEntry: URL {
        var components = URLComponents(url: entry, resolvingAgainstBaseURL: false)!
        components.path = "/ios-probe/"
        components.queryItems = [URLQueryItem(name: "render-audit", value: "1")]
        return components.url!
    }
    private static func isHTTPS(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.isEmpty == false && url.user == nil && url.password == nil
    }
    public func allows(_ url: URL) -> Bool {
        Self.isHTTPS(url) && url.host?.lowercased() == entry.host?.lowercased() && (url.port ?? 443) == (entry.port ?? 443)
    }
    public func allowsSubframe(_ url: URL) -> Bool {
        // Turnstile creates empty/srcdoc child frames before its HTTPS challenge.
        // These are child documents only; they never gain a native interface.
        if ["about:blank", "about:srcdoc"].contains(url.absoluteString) { return true }
        return allows(url) || Self.isHTTPS(url) && url.host?.lowercased() == "challenges.cloudflare.com" && (url.port ?? 443) == 443
    }
}
