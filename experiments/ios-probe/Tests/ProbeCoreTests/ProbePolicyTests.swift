import XCTest
@testable import ProbeCore
final class ProbePolicyTests: XCTestCase {
    func testOnlyExactHTTPSOriginCanNavigate() throws {
        let p = try ProbePolicy(entry: URL(string: "https://typesafe.place/play")!)
        XCTAssertTrue(p.allows(URL(string: "https://typesafe.place/auth/session")!))
        XCTAssertTrue(p.allows(URL(string: "https://typesafe.place:443/play")!))
        for value in ["https://typesafe.place.evil.test/play", "https://evil.test", "http://typesafe.place/play", "https://typesafe.place:444/play", "file:///etc/passwd", "javascript:alert(1)", "https://user:password@typesafe.place/play"] {
            XCTAssertFalse(p.allows(URL(string: value)!), value)
        }
    }
    func testInvalidEntryFailsClosed() {
        for value in ["http://typesafe.place/play", "file:///play", "https://user:pass@typesafe.place/play", "https://typesafe.place/play?token=secret", "https://typesafe.place/play#secret"] {
            XCTAssertThrowsError(try ProbePolicy(entry: URL(string: value)!))
        }
    }
    func testTurnstileFramesStayUnprivilegedAndTopLevelStaysRestricted() throws {
        let p = try ProbePolicy(entry: URL(string: "https://typesafe.place/play")!)
        for value in ["about:blank", "about:srcdoc", "https://challenges.cloudflare.com/turnstile/v0/widget", "https://typesafe.place/play"] {
            XCTAssertTrue(p.allowsSubframe(URL(string: value)!), value)
        }
        for value in ["about:blank", "about:srcdoc", "https://challenges.cloudflare.com/turnstile/v0/widget"] {
            XCTAssertFalse(p.allows(URL(string: value)!), value)
        }
        for value in ["about:config", "javascript:alert(1)", "file:///tmp/test", "https://challenges.cloudflare.com.evil.test", "http://challenges.cloudflare.com", "https://user:pass@challenges.cloudflare.com"] {
            XCTAssertFalse(p.allowsSubframe(URL(string: value)!), value)
        }
    }
}
