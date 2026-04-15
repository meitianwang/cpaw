import Foundation
import OSLog

/// Local configuration manager for the macOS app.
/// Independent from the web backend — the macOS app manages its own
/// API keys, models, and settings via ~/.claude/ config files.
@MainActor
final class AdminConfigReader {
    static let shared = AdminConfigReader()

    private let logger = Logger(subsystem: "ai.klaus", category: "config")

    /// Reload config. Currently a no-op since the CC engine reads
    /// ~/.claude/ config files directly. This exists as a hook for
    /// future local config management.
    func reload() {
        logger.info("Config reload (engine reads ~/.claude/ directly)")
    }

    /// Environment variables for the CC engine subprocess.
    /// The engine reads API key from ~/.claude/credentials.json or
    /// ANTHROPIC_API_KEY env var. We pass through any explicit overrides.
    func engineEnvironment() -> [String: String] {
        var env: [String: String] = [:]

        // If user set an explicit API key in app settings, pass it
        let apiKey = UserDefaults.standard.string(forKey: "klaus.apiKey") ?? ""
        if !apiKey.isEmpty {
            env["ANTHROPIC_API_KEY"] = apiKey
        }

        return env
    }

    /// Default model name from app settings, if any.
    var defaultModelName: String? {
        let override = AppState.shared.modelOverride
        return override.isEmpty ? nil : override
    }

    /// No custom system prompt — the CC engine uses its own defaults
    /// plus ~/.claude/CLAUDE.md files.
    func buildSystemPromptFile() -> URL? {
        nil
    }
}
