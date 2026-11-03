import Foundation
import XCTest
@testable import ExperimentPolicy

final class BundleFilesTests: XCTestCase {
    func testOnlyGETFilesInsideExactBundleRootAreServed() throws {
        let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let root = parent.appendingPathComponent("play")
        let sibling = parent.appendingPathComponent("play-private")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: sibling, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: parent) }
        let asset = root.appendingPathComponent("index.html")
        let outside = sibling.appendingPathComponent("private.txt")
        try Data("page".utf8).write(to: asset)
        try Data("private".utf8).write(to: outside)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("link.txt"), withDestinationURL: outside)
        XCTAssertEqual(ExperimentPolicy.bundleFile(root: root, url: URL(string: "capacitor://localhost/index.html")!, method: "GET"), asset.resolvingSymlinksInPath())
        XCTAssertEqual(ExperimentPolicy.bundleFile(root: root, url: URL(string: "capacitor://localhost/")!, method: "GET"), asset.resolvingSymlinksInPath())
        for value in ["capacitor://localhost/../play-private/private.txt", "capacitor://localhost/link.txt", "capacitor://other/index.html", "capacitor://localhost:123/index.html", "capacitor://user@localhost/index.html", "file:///index.html"] {
            XCTAssertNil(ExperimentPolicy.bundleFile(root: root, url: URL(string: value)!, method: "GET"), value)
        }
        XCTAssertNil(ExperimentPolicy.bundleFile(root: root, url: URL(string: "capacitor://localhost/index.html")!, method: "POST"))
        XCTAssertNil(ExperimentPolicy.bundleFile(root: root, url: URL(string: "capacitor://localhost/missing.txt")!, method: "GET"))
    }
}
