import Foundation
import XCTest
@testable import ExperimentPolicy

final class SourcePolicyTests: XCTestCase {
    func testPolicyInputIsExplicitBoundedUTF8AndConfined() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("__context-parity-csp.txt")
        XCTAssertThrowsError(try ExperimentPolicy.sourcePolicy(root: root))
        let good = Data("default-src 'self'; connect-src 'self'\n".utf8)
        try good.write(to: file)
        XCTAssertEqual(try ExperimentPolicy.sourcePolicy(root: root), good)
        for bytes in [Data(), Data(" \n".utf8), Data(repeating: 97, count: 8193), Data([255]), Data("default-src 'self'\r\nconnect-src *".utf8)] {
            try bytes.write(to: file)
            XCTAssertThrowsError(try ExperimentPolicy.sourcePolicy(root: root))
        }
    }
}
