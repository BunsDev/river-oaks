// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "ExperimentPolicy", platforms: [.macOS(.v13), .iOS(.v16)], products: [.library(name: "ExperimentPolicy", targets: ["ExperimentPolicy"])], targets: [.target(name: "ExperimentPolicy"), .testTarget(name: "ExperimentPolicyTests", dependencies: ["ExperimentPolicy"])])
