// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "FrontierFeedKit",
    platforms: [
        .iOS(.v17),
        .macOS(.v14), // so the engine's tests run headlessly via `swift test`
    ],
    products: [
        .library(name: "FrontierFeedKit", targets: ["FrontierFeedKit"]),
    ],
    targets: [
        .target(name: "FrontierFeedKit"),
        .testTarget(
            name: "FrontierFeedKitTests",
            dependencies: ["FrontierFeedKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
