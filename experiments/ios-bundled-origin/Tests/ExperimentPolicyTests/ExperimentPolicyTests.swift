import Foundation
import XCTest
@testable import ExperimentPolicy

final class ExperimentPolicyTests: XCTestCase {
    func testOnlyExplicitLoopbackHTTPFixtureOriginsAreAccepted() {
        XCTAssertTrue(ExperimentPolicy.isFixtureOrigin(URL(string: "http://127.0.0.1:52145")!))
        XCTAssertTrue(ExperimentPolicy.isFixtureOrigin(URL(string: "http://127.0.0.1:52145/")!))
        for value in ["https://typesafe.place", "http://localhost:52145", "http://127.0.0.1", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:52145/path", "http://127.0.0.1:52145/?token=x", "http://127.0.0.1:52145/#x", "http://user@127.0.0.1:52145", "file:///tmp"] {
            XCTAssertFalse(ExperimentPolicy.isFixtureOrigin(URL(string: value)!), value)
        }
    }

    func testResultsRequireIntendedMainFrameAndCurrentDocument() throws {
        let entry = URL(string: "http://127.0.0.1:52145/")!
        let policy = ExperimentPolicy(entry: entry)
        let text = "{\"checks\":{},\"violations\":[]}"
        XCTAssertNotNil(policy.results(body: text, isMainFrame: true, frameURL: entry, currentURL: entry))
        XCTAssertNil(policy.results(body: text, isMainFrame: false, frameURL: entry, currentURL: entry))
        for value in ["http://127.0.0.1:52146/", "https://typesafe.place/", "http://127.0.0.1:52145/redirect", "http://user@127.0.0.1:52145/", "about:blank"] {
            let other = URL(string: value)!
            XCTAssertNil(policy.results(body: text, isMainFrame: true, frameURL: other, currentURL: entry), value)
            XCTAssertNil(policy.results(body: text, isMainFrame: true, frameURL: entry, currentURL: other), value)
        }
        XCTAssertNil(policy.results(body: text, isMainFrame: true, frameURL: entry, currentURL: nil))
        XCTAssertFalse(policy.allowsDocument(URL(string: "https://evil.test/")!))
    }

    func testBundledResultsStayOnExactDocument() {
        let entry = URL(string: "capacitor://localhost/index.html")!
        let policy = ExperimentPolicy(entry: entry)
        XCTAssertTrue(policy.allowsDocument(entry))
        for value in ["capacitor://evil.test/index.html", "capacitor://localhost:123/index.html", "capacitor://localhost/other.html", "capacitor://localhost/index.html?x=1", "file:///tmp/index.html"] {
            XCTAssertFalse(policy.allowsDocument(URL(string: value)!), value)
        }
    }

    func testMalformedOversizedAndUnexpectedResultsAreRejected() {
        let entry = URL(string: "capacitor://localhost/index.html")!
        let policy = ExperimentPolicy(entry: entry)
        for body: Any in [1, [], "null", "[]", "{}", "{\"checks\":[],\"violations\":[]}", "{\"checks\":{},\"violations\":{},\"other\":1}", "{\"checks\":{},\"violations\":[],\"untrusted\":1}", String(repeating: "x", count: 65537)] {
            XCTAssertNil(policy.results(body: body, isMainFrame: true, frameURL: entry, currentURL: entry))
        }
    }
}
