import Foundation

// Diagnostic-only boundary. The experiment may talk to explicit loopback
// fixtures and record results from its intended document, never a remote site.
public struct ExperimentPolicy {
    private let entry: URL
    public init(entry: URL) { self.entry = entry }

    public static func isFixtureOrigin(_ url: URL) -> Bool {
        guard ["http", "https"].contains(url.scheme ?? ""), url.host == "127.0.0.1",
              let port = url.port, (1...65535).contains(port),
              url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil else { return false }
        return url.path.isEmpty || url.path == "/"
    }

    public static func secureBootstrapURL(_ origin: URL) -> URL? {
        guard origin.scheme == "https", isFixtureOrigin(origin) else { return nil }
        return origin.appendingPathComponent("__host-cookie-bootstrap")
    }

    public func allowsDocument(_ url: URL) -> Bool {
        // Compare components so an empty root path and slash are equivalent.
        url.scheme == entry.scheme && url.host == entry.host && url.port == entry.port &&
        url.user == nil && url.password == nil && url.query == nil && url.fragment == nil &&
        (url.path.isEmpty ? "/" : url.path) == (entry.path.isEmpty ? "/" : entry.path)
    }

    public func results(body: Any, isMainFrame: Bool, frameURL: URL?, currentURL: URL?) -> [String: Any]? {
        guard isMainFrame, let frameURL, allowsDocument(frameURL),
              let currentURL, allowsDocument(currentURL),
              let text = body as? String, text.utf8.count <= 65536,
              let data = text.data(using: .utf8),
              let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(result.keys).isSubset(of: ["checks", "violations", "error"]),
              let checks = result["checks"] as? [String: Any], checks.count <= 32,
              let violations = result["violations"] as? [[String: Any]], violations.count <= 128,
              result["error"] == nil || result["error"] is String else { return nil }
        return result
    }
    public static func bundleFile(root: URL, url: URL, method: String) -> URL? {
        guard method == "GET", url.scheme == "capacitor", url.host == "localhost",
              url.port == nil, url.user == nil, url.password == nil else { return nil }
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = base.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(base.path + "/"),
              let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
              attributes[.type] as? FileAttributeType == .typeRegular else { return nil }
        return file
    }

    public static func sourcePolicy(root: URL) throws -> Data {
        let url = URL(string: "capacitor://localhost/__context-parity-csp.txt")!
        guard let file = bundleFile(root: root, url: url, method: "GET"),
              let size = try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber,
              size.intValue <= 8192 else { throw URLError(.badURL) }
        let data = try Data(contentsOf: file)
        guard !data.isEmpty, data.count <= 8192, let value = String(data: data, encoding: .utf8) else { throw URLError(.badServerResponse) }
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !text.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw URLError(.badServerResponse) }
        return data
    }

}
