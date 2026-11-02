import XCTest
@testable import ProbeCore

final class ProbePagePresentationTests: XCTestCase {
    func testPendingNavigationCannotAdvertiseSampleReadiness() {
        var state = ProbePagePresentation()
        XCTAssertEqual(state.status("Scene ready"), "Loading page · Reload / Browser available")
        state.started(navigation: "first")
        XCTAssertEqual(state.status("Scene ready"), "Loading page · Reload / Browser available")
        state.finished(navigation: "first")
        XCTAssertEqual(state.status("Scene ready"), "Scene ready")
    }
    func testFailureStaysVisibleUntilAnExplicitNewNavigation() {
        var state = ProbePagePresentation()
        state.started(navigation: "first")
        state.finished(navigation: "first")
        state.failed(navigation: "first") // Includes a failure after commit/finish.
        for sample in ["Scene ready", "Sign-in/loading", "Phase capture unavailable"] {
            XCTAssertEqual(state.status(sample), "Load failed · retry with Reload")
        }
        state.finished(navigation: "first") // Late completion cannot erase failure.
        XCTAssertEqual(state.status("Scene ready"), "Load failed · retry with Reload")
        state.started(navigation: "retry")
        state.finished(navigation: "first")
        state.failed(navigation: "first") // Retired callbacks cannot poison retry.
        XCTAssertEqual(state.status("Scene ready"), "Loading page · Reload / Browser available")
        state.finished(navigation: "retry")
        XCTAssertEqual(state.status("Scene ready"), "Scene ready")
    }
    func testRendererTerminationSurvivesLateSamplesAndCompletion() {
        var state = ProbePagePresentation()
        state.started(navigation: "first")
        state.terminated()
        state.finished(navigation: "first")
        state.failed(navigation: "first")
        XCTAssertEqual(state.status("Scene ready"), "Web content terminated · manual Reload required")
        state.started(navigation: "retry")
        state.finished(navigation: "retry")
        XCTAssertEqual(state.status("Sign-in/loading"), "Sign-in/loading")
    }
    func testHTTPFailureRequiresCurrentUniqueMainDocument() {
        var state = ProbePagePresentation()
        state.started(navigation: "first", document: "https://fixture.test/first")
        XCTAssertFalse(state.receivedResponse(status: 404, isMainFrame: false, document: "https://fixture.test/first"))
        XCTAssertFalse(state.receivedResponse(status: 503, isMainFrame: true, document: "https://fixture.test/retired"))
        XCTAssertTrue(state.receivedResponse(status: 404, isMainFrame: true, document: "https://fixture.test/first"))
        state.finished(navigation: "first")
        XCTAssertEqual(state.responseStatus, 404)
        XCTAssertEqual(state.status("Page loaded"), "Load failed · retry with Reload")
    }
    func testRetiredResponseCannotPoisonReplacementOrSameURLRetry() {
        var state = ProbePagePresentation()
        state.started(navigation: "first", document: "https://fixture.test/first")
        state.started(navigation: "replacement", document: "https://fixture.test/new")
        XCTAssertFalse(state.receivedResponse(status: 404, isMainFrame: true, document: "https://fixture.test/first"))
        XCTAssertFalse(state.receivedResponse(status: 200, isMainFrame: true, document: "https://fixture.test/new"))
        state.finished(navigation: "replacement")
        XCTAssertEqual(state.responseStatus, 200)
        XCTAssertEqual(state.status("Scene ready"), "Scene ready")
        state.started(navigation: "same-URL-retry", document: "https://fixture.test/new")
        XCTAssertFalse(state.receivedResponse(status: 404, isMainFrame: true, document: "https://fixture.test/new"))
        XCTAssertNil(state.responseStatus, "Repeated URLs are ambiguous, not evidence of a current failure")
        state.finished(navigation: "same-URL-retry")
        XCTAssertEqual(state.status("Status unavailable"), "Status unavailable")
    }
    func testRedirectsTrackTheDocumentWithoutAcceptingRetiredNavigation() {
        var state = ProbePagePresentation()
        state.started(navigation: "first", document: "https://fixture.test/first")
        state.redirected(navigation: "retired", document: "https://fixture.test/wrong")
        state.redirected(navigation: "first", document: "https://fixture.test/final")
        XCTAssertFalse(state.receivedResponse(status: 404, isMainFrame: true, document: "https://fixture.test/first"))
        XCTAssertTrue(state.receivedResponse(status: 503, isMainFrame: true, document: "https://fixture.test/final"))
        state.finished(navigation: "first")
        XCTAssertEqual(state.status("Page loaded"), "Load failed · retry with Reload")
    }
    func testDocumentHistoryAndLengthAreBoundedWithUnknownAttribution() {
        var state = ProbePagePresentation()
        for index in 0..<40 { state.started(navigation: "nav-\(index)", document: "https://fixture.test/\(index)") }
        XCTAssertFalse(state.receivedResponse(status: 404, isMainFrame: true, document: "https://fixture.test/39"))
        XCTAssertNil(state.responseStatus)
        state.started(navigation: "long", document: String(repeating: "x", count: 8193))
        XCTAssertFalse(state.receivedResponse(status: 404, isMainFrame: true, document: String(repeating: "x", count: 8193)))
        XCTAssertNil(state.responseStatus)
    }
}
