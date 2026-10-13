import XCTest
@testable import ProbeCore

final class ProbePhaseEvidenceTests: XCTestCase {
    private func sample() -> [String: Any] {
        let phases = Dictionary(uniqueKeysWithValues: ["setup", "community", "trees", "residents", "interactions", "players", "reflections", "debug", "pipeline", "tail"].map { ($0, 1.0) })
        return ["status": "captured", "startedAtMs": 100.0, "elapsedMs": 30000.0,
                "frames": [["intervalMs": 16.0, "cpuMs": 10.0, "phasesMs": phases, "secret": "private"]], "secret": "private"]
    }
    func testLateRepliesCannotPassWhenTimerDeliveryIsDelayed() {
        XCTAssertTrue(ProbePhaseEvidence.replyIsTimely(startedAt: 10, now: 11.99))
        XCTAssertFalse(ProbePhaseEvidence.replyIsTimely(startedAt: 10, now: 12.01))
        XCTAssertFalse(ProbePhaseEvidence.replyIsTimely(startedAt: 10, now: 9))
        XCTAssertFalse(ProbePhaseEvidence.replyIsTimely(startedAt: 10, now: .infinity))
    }
    func testWhitelistsOnlyBoundedPhaseEvidence() throws {
        let result = try XCTUnwrap(ProbePhaseEvidence.sanitize(sample()))
        XCTAssertEqual(result["status"] as? String, "captured")
        let encoded = try JSONSerialization.data(withJSONObject: result)
        XCTAssertFalse(String(decoding: encoded, as: UTF8.self).contains("private"))
        XCTAssertNil(ProbePhaseEvidence.sanitize(["status": "account-secret"]))
        XCTAssertEqual(ProbePhaseEvidence.sanitize(["status": "unsupported", "secret": "private"])?.count, 1)
    }
    func testRejectsMalformedAndOversizedFrames() {
        var value = sample()
        value["frames"] = Array(repeating: ["intervalMs": 16], count: 7201)
        XCTAssertNil(ProbePhaseEvidence.sanitize(value))
        value = sample(); value["elapsedMs"] = true
        XCTAssertNil(ProbePhaseEvidence.sanitize(value))
        value = sample(); value["startedAtMs"] = Double.infinity
        XCTAssertNil(ProbePhaseEvidence.sanitize(value))
        value = sample(); value["frames"] = [["intervalMs": 16.0, "cpuMs": 10.0, "phasesMs": ["pipeline": 10.0]]]
        XCTAssertNil(ProbePhaseEvidence.sanitize(value))
        value = sample(); var frames = value["frames"] as! [[String: Any]]; frames[0]["cpuMs"] = 90.0; value["frames"] = frames
        XCTAssertNil(ProbePhaseEvidence.sanitize(value))
    }
    func testDiagnosticQueryPreservesExactOriginAndRejectsExistingAmbiguity() throws {
        let policy = try ProbePolicy(entry: URL(string: "https://typesafe.place/play")!)
        XCTAssertEqual(policy.diagnosticEntry.absoluteString, "https://typesafe.place/play?render-audit=1")
        XCTAssertTrue(policy.allows(policy.diagnosticEntry))
        XCTAssertThrowsError(try ProbePolicy(entry: URL(string: "https://typesafe.place/play?token=private")!))
    }
}
