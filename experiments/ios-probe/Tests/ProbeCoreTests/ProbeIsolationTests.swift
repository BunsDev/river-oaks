import XCTest
import WebKit
@testable import ProbeCore
final class ProbeIsolationTests: XCTestCase {
    func testDefaultPreservesEveryAssetAndUnknownFlagsFail() throws {
        XCTAssertNil(try ProbeIsolation(arguments: []).rulesJSON)
        XCTAssertThrowsError(try ProbeIsolation(arguments: ["--probe-block-auth"]))
    }
    func testCharacterIsolationOnlyMatchesItsAssetDirectory() throws {
        let isolation = try ProbeIsolation(arguments: ["--probe-native-only", "--probe-block-characters"])
        XCTAssertEqual(isolation.groups, ["characters"])
        let rules = try JSONSerialization.jsonObject(with: Data(isolation.rulesJSON!.utf8)) as! [[String: Any]]
        let trigger = rules[0]["trigger"] as! [String: Any]
        let pattern = try NSRegularExpression(pattern: trigger["url-filter"] as! String)
        func matches(_ url: String) -> Bool { pattern.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)) != nil }
        XCTAssertTrue(matches("https://typesafe.place/assets/characters/woman-casual.glb"))
        XCTAssertTrue(matches("https://typesafe.place:443/assets/characters/speech/jevica.glb"))
        for url in ["https://typesafe.place/auth/login", "https://typesafe.place/assets/landscape/ez-oak-low.glb", "https://evil.test/assets/characters/model.glb", "https://typesafe.place.evil.test/assets/characters/model.glb", "https://typesafe.place/assets/characters-other/model.glb"] { XCTAssertFalse(matches(url), url) }
        XCTAssertEqual((rules[0]["action"] as! [String: String])["type"], "block")
    }
    func testMultipleGroupsAreExplicitAndDeduplicated() throws {
        let isolation = try ProbeIsolation(arguments: ["--probe-block-landscape", "--probe-block-characters", "--probe-block-landscape"])
        XCTAssertEqual(isolation.groups, ["characters", "landscape"])
    }
    func testRigGroupsMatchOnlyExactModelFiles() throws {
        for (group, names, excluded) in [
            ("standard-rigs", ["woman-casual", "woman-tailored", "woman-daywear", "man-casual", "man-tailored", "man-workwear"], ["jevica", "prince-jev"]),
            ("special-rigs", ["jevica", "prince-jev"], ["woman-casual", "man-workwear"])
        ] {
            let isolation = try ProbeIsolation(arguments: ["--probe-block-" + group])
            let rules = try JSONSerialization.jsonObject(with: Data(isolation.rulesJSON!.utf8)) as! [[String: Any]]
            XCTAssertEqual(rules.count, names.count)
            let patterns = try rules.map { try NSRegularExpression(pattern: ($0["trigger"] as! [String: String])["url-filter"]!) }
            func matches(_ url: String) -> Bool { patterns.contains { $0.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)) != nil } }
            for name in names {
                XCTAssertTrue(matches("https://typesafe.place/assets/characters/" + name + ".glb"))
                XCTAssertTrue(matches("https://typesafe.place/assets/characters/" + name + ".glb?v=1"))
                XCTAssertFalse(matches("https://typesafe.place/assets/characters/" + name + ".glb.backup"))
                XCTAssertFalse(matches("https://typesafe.place/assets/characters/" + name + "-portrait.png"))
            }
            for name in excluded { XCTAssertFalse(matches("https://typesafe.place/assets/characters/" + name + ".glb")) }
        }
    }

    @MainActor
    func testEveryIsolationGroupCompilesWithWebKit() async throws {
        for group in ["characters", "landscape", "materials", "standard-rigs", "special-rigs"] {
            let isolation = try ProbeIsolation(arguments: ["--probe-block-" + group])
            let identifier = "TypeSafeProbeTest-" + UUID().uuidString
            let store = WKContentRuleListStore.default()!
            let list = try await store.compileContentRuleList(forIdentifier: identifier, encodedContentRuleList: isolation.rulesJSON!)
            XCTAssertNotNil(list)
            try await store.removeContentRuleList(forIdentifier: identifier)
        }
    }

}
