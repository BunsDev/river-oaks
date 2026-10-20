import Foundation

// Explicit allocation-isolation trials only. A blocked asset is never replaced
// with a fixture or proxy, and these trials cannot satisfy playable acceptance.
public struct ProbeIsolation {
    public let groups: [String]
    public init(arguments: [String]) throws {
        let requested = arguments.filter { $0.hasPrefix("--probe-block-") }.map { String($0.dropFirst("--probe-block-".count)) }
        guard requested.allSatisfy({ ["characters", "landscape", "materials", "standard-rigs", "special-rigs"].contains($0) }) else { throw URLError(.badURL) }
        groups = Array(Set(requested)).sorted()
    }
    public var rulesJSON: String? {
        guard !groups.isEmpty else { return nil }
        let paths = groups.flatMap { group -> [String] in
            let names: [String]
            switch group {
            case "standard-rigs": names = ["woman-casual", "woman-tailored", "woman-daywear", "man-casual", "man-tailored", "man-workwear"]
            case "special-rigs": names = ["jevica", "prince-jev"]
            default: return [group + "/"]
            }
            // WKContentRuleList uses a smaller regex grammar than Foundation.
            // Emit individual exact-file rules rather than regex alternation.
            return names.map { "characters/" + $0 + "[.]glb([?].*)?$" }
        }
        let rules: [[String: Any]] = paths.map { path in
            ["trigger": ["url-filter": "^https://typesafe[.]place(:443)?/assets/" + path], "action": ["type": "block"]]
        }
        return String(data: try! JSONSerialization.data(withJSONObject: rules, options: [.sortedKeys]), encoding: .utf8)!
    }
}
