import Foundation
import OSLog
import PeekabooBridge
import PeekabooAutomationKit
import Security

/// Coordinates the Peekaboo UI automation bridge.
/// Hosts a Unix socket server that allows signed tools (e.g. `peekaboo` CLI)
/// to drive macOS UI automation through the app's TCC permissions.
@MainActor
final class PeekabooBridgeHostCoordinator {
    static let shared = PeekabooBridgeHostCoordinator()

    private let logger = Logger(subsystem: "ai.klaus", category: "peekaboo")
    private var host: PeekabooBridgeHost?
    private var services: KlausPeekabooBridgeServices?

    private static let socketDir: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.klaus"
    }()

    private static let socketPath = "\(socketDir)/bridge.sock"

    // MARK: - Lifecycle

    func setEnabled(_ enabled: Bool) async {
        if enabled {
            await startIfNeeded()
        } else {
            await stop()
        }
    }

    func stop() async {
        guard let host else { return }
        await host.stop()
        self.host = nil
        self.services = nil
        logger.info("Peekaboo bridge stopped")
    }

    // MARK: - Private

    private func startIfNeeded() async {
        guard host == nil else { return }

        // Build TeamID allowlist
        var allowlistedTeamIDs: Set<String> = []
        if let teamID = Self.currentTeamID() {
            allowlistedTeamIDs.insert(teamID)
        }

        // Ensure socket directory exists with proper permissions
        let fm = FileManager.default
        if !fm.fileExists(atPath: Self.socketDir) {
            try? fm.createDirectory(atPath: Self.socketDir, withIntermediateDirectories: true)
        }
        chmod(Self.socketDir, 0o700)

        // Create services
        let bridgeServices = KlausPeekabooBridgeServices()

        // Create server
        let server = PeekabooBridgeServer(
            services: bridgeServices,
            hostKind: .gui,
            allowlistedTeams: allowlistedTeamIDs,
            allowlistedBundles: []
        )

        // Create and start host
        let bridgeHost = PeekabooBridgeHost(
            socketPath: Self.socketPath,
            server: server,
            allowedTeamIDs: allowlistedTeamIDs,
            requestTimeoutSec: 10
        )

        self.services = bridgeServices
        self.host = bridgeHost
        await bridgeHost.start()

        logger.info("Peekaboo bridge started at \(Self.socketPath, privacy: .public)")
    }

    /// Extract the current app's TeamID from its code signature.
    private static func currentTeamID() -> String? {
        var code: SecCode?
        guard SecCodeCopySelf(SecCSFlags(), &code) == errSecSuccess,
              let code else { return nil }

        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, SecCSFlags(), &staticCode) == errSecSuccess,
              let staticCode else { return nil }

        var info: CFDictionary?
        guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let info = info as? [String: Any] else { return nil }

        return info[kSecCodeInfoTeamIdentifier as String] as? String
    }
}

// MARK: - Bridge Services

/// Provides Peekaboo automation services using the Klaus app's TCC permissions.
@MainActor
private final class KlausPeekabooBridgeServices: PeekabooBridgeServiceProviding {
    let permissions: PermissionsService
    let screenCapture: any ScreenCaptureServiceProtocol
    let automation: any UIAutomationServiceProtocol
    let windows: any WindowManagementServiceProtocol
    let applications: any ApplicationServiceProtocol
    let menu: any MenuServiceProtocol
    let dock: any DockServiceProtocol
    let dialogs: any DialogServiceProtocol
    let snapshots: any SnapshotManagerProtocol

    init() {
        let logging = LoggingService(subsystem: "ai.klaus.peekaboo")
        let feedback = NoopAutomationFeedbackClient()

        self.snapshots = InMemorySnapshotManager(options: .init(
            snapshotValidityWindow: 600,    // 10 minutes
            maxSnapshots: 50,
            deleteArtifactsOnCleanup: false
        ))

        self.permissions = PermissionsService(logging: logging)
        self.screenCapture = ScreenCaptureService(logging: logging)
        self.automation = UIAutomationService(
            logging: logging,
            feedback: feedback,
            searchPolicy: .balanced
        )
        self.windows = WindowManagementService(logging: logging)
        self.applications = ApplicationService(logging: logging)
        self.menu = MenuService(logging: logging)
        self.dock = DockService(logging: logging)
        self.dialogs = DialogService(logging: logging)
    }
}
