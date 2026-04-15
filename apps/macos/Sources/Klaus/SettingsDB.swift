import Foundation
import OSLog
import SQLite3

/// Direct SQLite access to ~/.klaus/settings.db — shares the same DB as the Web backend.
/// Read/write models, prompts, cron tasks, and KV settings without needing the Web server running.
@MainActor
final class SettingsDB {
    static let shared = SettingsDB()

    private var db: OpaquePointer?
    private var usersDb: OpaquePointer?
    private let logger = Logger(subsystem: "ai.klaus", category: "settingsdb")
    private let dbPath: String
    private let usersDbPath: String

    private init() {
        dbPath = "\(KlausPaths.configDir)/settings.db"
        usersDbPath = "\(KlausPaths.configDir)/users.db"
        open()
    }

    // Note: db handles are closed when the process exits.
    // Cannot close in deinit due to MainActor isolation.

    private func open() {
        try? FileManager.default.createDirectory(
            atPath: KlausPaths.configDir,
            withIntermediateDirectories: true
        )
        if sqlite3_open(dbPath, &db) != SQLITE_OK {
            logger.error("Failed to open settings.db at \(self.dbPath)")
        } else {
            exec("PRAGMA journal_mode = WAL")
            exec("PRAGMA foreign_keys = ON")
        }
        if sqlite3_open(usersDbPath, &usersDb) != SQLITE_OK {
            logger.error("Failed to open users.db at \(self.usersDbPath)")
        } else {
            execOn(usersDb, "PRAGMA journal_mode = WAL")
        }
    }

    // MARK: - Low-level helpers

    private func exec(_ sql: String) {
        guard let db else { return }
        execOn(db, sql)
    }

    private func execOn(_ handle: OpaquePointer?, _ sql: String) {
        guard let handle else { return }
        var err: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(handle, sql, nil, nil, &err) != SQLITE_OK {
            let msg = err.map { String(cString: $0) } ?? "unknown"
            logger.error("SQL exec error: \(msg)")
            sqlite3_free(err)
        }
    }

    private func prepare(_ sql: String) -> OpaquePointer? {
        prepareOn(db, sql)
    }

    private func prepareOn(_ handle: OpaquePointer?, _ sql: String) -> OpaquePointer? {
        guard let handle else { return nil }
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(handle, sql, -1, &stmt, nil) != SQLITE_OK {
            let msg = String(cString: sqlite3_errmsg(handle))
            logger.error("SQL prepare error: \(msg)")
            return nil
        }
        return stmt
    }

    private func columnText(_ stmt: OpaquePointer, _ idx: Int32) -> String? {
        guard let ptr = sqlite3_column_text(stmt, idx) else { return nil }
        return String(cString: ptr)
    }

    private func columnInt(_ stmt: OpaquePointer, _ idx: Int32) -> Int {
        Int(sqlite3_column_int64(stmt, idx))
    }

    private func columnDouble(_ stmt: OpaquePointer, _ idx: Int32) -> Double? {
        sqlite3_column_type(stmt, idx) == SQLITE_NULL ? nil : sqlite3_column_double(stmt, idx)
    }

    // MARK: - KV Settings

    func getSetting(_ key: String) -> String? {
        guard let stmt = prepare("SELECT value FROM settings WHERE key = ?") else { return nil }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, key, -1, nil)
        return sqlite3_step(stmt) == SQLITE_ROW ? columnText(stmt, 0) : nil
    }

    func setSetting(_ key: String, _ value: String) {
        guard let stmt = prepare(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ) else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, key, -1, nil)
        sqlite3_bind_text(stmt, 2, value, -1, nil)
        sqlite3_step(stmt)
    }

    // MARK: - Models

    struct ModelRow: Identifiable, Sendable {
        let id: String
        var name: String
        var provider: String
        var model: String
        var apiKey: String?
        var baseUrl: String?
        var maxContextTokens: Int
        var thinking: String
        var isDefault: Bool
        var role: String?
        var authType: String?
        var costInput: Double?
        var costOutput: Double?
        var costCacheRead: Double?
        var costCacheWrite: Double?
    }

    func listModels() -> [ModelRow] {
        guard let stmt = prepare("""
            SELECT id, name, provider, model, api_key, base_url, max_context_tokens, thinking,
                   is_default, role, auth_type, cost_input, cost_output, cost_cache_read, cost_cache_write
            FROM models ORDER BY is_default DESC, name
            """) else { return [] }
        defer { sqlite3_finalize(stmt) }
        var rows: [ModelRow] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            rows.append(ModelRow(
                id: columnText(stmt, 0) ?? "",
                name: columnText(stmt, 1) ?? "",
                provider: columnText(stmt, 2) ?? "",
                model: columnText(stmt, 3) ?? "",
                apiKey: columnText(stmt, 4),
                baseUrl: columnText(stmt, 5),
                maxContextTokens: columnInt(stmt, 6),
                thinking: columnText(stmt, 7) ?? "off",
                isDefault: columnInt(stmt, 8) != 0,
                role: columnText(stmt, 9),
                authType: columnText(stmt, 10),
                costInput: columnDouble(stmt, 11),
                costOutput: columnDouble(stmt, 12),
                costCacheRead: columnDouble(stmt, 13),
                costCacheWrite: columnDouble(stmt, 14)
            ))
        }
        return rows
    }

    func upsertModel(_ m: ModelRow) {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let sql = """
            INSERT INTO models (id, name, provider, model, api_key, base_url, max_context_tokens, thinking,
                   is_default, role, auth_type, cost_input, cost_output, cost_cache_read, cost_cache_write, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, provider=excluded.provider, model=excluded.model,
              api_key=excluded.api_key, base_url=excluded.base_url,
              max_context_tokens=excluded.max_context_tokens, thinking=excluded.thinking,
              is_default=excluded.is_default, role=excluded.role, auth_type=excluded.auth_type,
              cost_input=excluded.cost_input, cost_output=excluded.cost_output,
              cost_cache_read=excluded.cost_cache_read, cost_cache_write=excluded.cost_cache_write,
              updated_at=excluded.updated_at
            """
        guard let stmt = prepare(sql) else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, m.id, -1, nil)
        sqlite3_bind_text(stmt, 2, m.name, -1, nil)
        sqlite3_bind_text(stmt, 3, m.provider, -1, nil)
        sqlite3_bind_text(stmt, 4, m.model, -1, nil)
        if let key = m.apiKey { sqlite3_bind_text(stmt, 5, key, -1, nil) } else { sqlite3_bind_null(stmt, 5) }
        if let url = m.baseUrl { sqlite3_bind_text(stmt, 6, url, -1, nil) } else { sqlite3_bind_null(stmt, 6) }
        sqlite3_bind_int64(stmt, 7, Int64(m.maxContextTokens))
        sqlite3_bind_text(stmt, 8, m.thinking, -1, nil)
        sqlite3_bind_int(stmt, 9, m.isDefault ? 1 : 0)
        if let role = m.role { sqlite3_bind_text(stmt, 10, role, -1, nil) } else { sqlite3_bind_null(stmt, 10) }
        if let at = m.authType { sqlite3_bind_text(stmt, 11, at, -1, nil) } else { sqlite3_bind_null(stmt, 11) }
        if let ci = m.costInput { sqlite3_bind_double(stmt, 12, ci) } else { sqlite3_bind_null(stmt, 12) }
        if let co = m.costOutput { sqlite3_bind_double(stmt, 13, co) } else { sqlite3_bind_null(stmt, 13) }
        if let cr = m.costCacheRead { sqlite3_bind_double(stmt, 14, cr) } else { sqlite3_bind_null(stmt, 14) }
        if let cw = m.costCacheWrite { sqlite3_bind_double(stmt, 15, cw) } else { sqlite3_bind_null(stmt, 15) }
        sqlite3_bind_int64(stmt, 16, Int64(now))
        sqlite3_bind_int64(stmt, 17, Int64(now))
        sqlite3_step(stmt)
    }

    func setModelRole(_ id: String, _ role: String?) {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        guard let stmt = prepare("UPDATE models SET role = ?, updated_at = ? WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        if let role { sqlite3_bind_text(stmt, 1, role, -1, nil) } else { sqlite3_bind_null(stmt, 1) }
        sqlite3_bind_int64(stmt, 2, Int64(now))
        sqlite3_bind_text(stmt, 3, id, -1, nil)
        sqlite3_step(stmt)
    }

    func deleteModel(_ id: String) {
        guard let stmt = prepare("DELETE FROM models WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, id, -1, nil)
        sqlite3_step(stmt)
    }

    func setDefaultModel(_ id: String) {
        exec("UPDATE models SET is_default = 0")
        guard let stmt = prepare("UPDATE models SET is_default = 1 WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, id, -1, nil)
        sqlite3_step(stmt)
    }

    // MARK: - Cron Tasks

    struct CronTaskRow: Identifiable, Sendable {
        let id: String
        var name: String?
        var description: String?
        var schedule: String
        var prompt: String
        var enabled: Bool
        var thinking: String?
        var lightContext: Bool
        var timeoutSeconds: Int?
        var deleteAfterRun: Bool
        var deliver: String?
        var webhookUrl: String?
        var webhookToken: String?
        var failureAlert: String?
        var userId: String?
    }

    func listCronTasks() -> [CronTaskRow] {
        guard let stmt = prepare("""
            SELECT id, name, description, schedule, prompt, enabled, thinking, light_context,
                   timeout_seconds, delete_after_run, deliver, webhook_url, webhook_token,
                   failure_alert, user_id
            FROM cron_tasks WHERE user_id IS NULL ORDER BY name
            """) else { return [] }
        defer { sqlite3_finalize(stmt) }
        var rows: [CronTaskRow] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            rows.append(CronTaskRow(
                id: columnText(stmt, 0) ?? "",
                name: columnText(stmt, 1),
                description: columnText(stmt, 2),
                schedule: columnText(stmt, 3) ?? "",
                prompt: columnText(stmt, 4) ?? "",
                enabled: columnInt(stmt, 5) != 0,
                thinking: columnText(stmt, 6),
                lightContext: columnInt(stmt, 7) != 0,
                timeoutSeconds: sqlite3_column_type(stmt, 8) == SQLITE_NULL ? nil : columnInt(stmt, 8),
                deleteAfterRun: columnInt(stmt, 9) != 0,
                deliver: columnText(stmt, 10),
                webhookUrl: columnText(stmt, 11),
                webhookToken: columnText(stmt, 12),
                failureAlert: columnText(stmt, 13),
                userId: columnText(stmt, 14)
            ))
        }
        return rows
    }

    func upsertCronTask(_ t: CronTaskRow) {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let sql = """
            INSERT INTO cron_tasks (id, name, description, schedule, prompt, enabled, thinking, light_context,
                   timeout_seconds, delete_after_run, deliver, webhook_url, webhook_token, failure_alert, user_id,
                   created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, description=excluded.description, schedule=excluded.schedule,
              prompt=excluded.prompt, enabled=excluded.enabled, thinking=excluded.thinking,
              light_context=excluded.light_context, timeout_seconds=excluded.timeout_seconds,
              delete_after_run=excluded.delete_after_run, deliver=excluded.deliver,
              webhook_url=excluded.webhook_url, webhook_token=excluded.webhook_token,
              failure_alert=excluded.failure_alert, user_id=excluded.user_id,
              updated_at=excluded.updated_at
            """
        guard let stmt = prepare(sql) else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, t.id, -1, nil)
        if let n = t.name { sqlite3_bind_text(stmt, 2, n, -1, nil) } else { sqlite3_bind_null(stmt, 2) }
        if let d = t.description { sqlite3_bind_text(stmt, 3, d, -1, nil) } else { sqlite3_bind_null(stmt, 3) }
        sqlite3_bind_text(stmt, 4, t.schedule, -1, nil)
        sqlite3_bind_text(stmt, 5, t.prompt, -1, nil)
        sqlite3_bind_int(stmt, 6, t.enabled ? 1 : 0)
        if let th = t.thinking { sqlite3_bind_text(stmt, 7, th, -1, nil) } else { sqlite3_bind_null(stmt, 7) }
        sqlite3_bind_int(stmt, 8, t.lightContext ? 1 : 0)
        if let ts = t.timeoutSeconds { sqlite3_bind_int64(stmt, 9, Int64(ts)) } else { sqlite3_bind_null(stmt, 9) }
        sqlite3_bind_int(stmt, 10, t.deleteAfterRun ? 1 : 0)
        if let d = t.deliver { sqlite3_bind_text(stmt, 11, d, -1, nil) } else { sqlite3_bind_null(stmt, 11) }
        if let wu = t.webhookUrl { sqlite3_bind_text(stmt, 12, wu, -1, nil) } else { sqlite3_bind_null(stmt, 12) }
        if let wt = t.webhookToken { sqlite3_bind_text(stmt, 13, wt, -1, nil) } else { sqlite3_bind_null(stmt, 13) }
        if let fa = t.failureAlert { sqlite3_bind_text(stmt, 14, fa, -1, nil) } else { sqlite3_bind_null(stmt, 14) }
        if let ui = t.userId { sqlite3_bind_text(stmt, 15, ui, -1, nil) } else { sqlite3_bind_null(stmt, 15) }
        sqlite3_bind_int64(stmt, 16, Int64(now))
        sqlite3_bind_int64(stmt, 17, Int64(now))
        sqlite3_step(stmt)
    }

    func deleteCronTask(_ id: String) {
        guard let stmt = prepare("DELETE FROM cron_tasks WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, id, -1, nil)
        sqlite3_step(stmt)
    }

    func toggleCronTask(_ id: String, enabled: Bool) {
        guard let stmt = prepare("UPDATE cron_tasks SET enabled = ?, updated_at = ? WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        let now = Int(Date().timeIntervalSince1970 * 1000)
        sqlite3_bind_int(stmt, 1, enabled ? 1 : 0)
        sqlite3_bind_int64(stmt, 2, Int64(now))
        sqlite3_bind_text(stmt, 3, id, -1, nil)
        sqlite3_step(stmt)
    }

    // MARK: - KV Settings (delete)

    func deleteSetting(_ key: String) {
        guard let stmt = prepare("DELETE FROM settings WHERE key = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, key, -1, nil)
        sqlite3_step(stmt)
    }

    func deleteSettingsWithPrefix(_ prefix: String) {
        guard let stmt = prepare("DELETE FROM settings WHERE key LIKE ? || '%'") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, prefix, -1, nil)
        sqlite3_step(stmt)
    }

    // MARK: - Skills (enable/disable via KV)

    func isSkillEnabled(_ skillName: String) -> Bool {
        getSetting("skill.\(skillName).enabled") != "0"
    }

    func setSkillEnabled(_ skillName: String, _ enabled: Bool) {
        setSetting("skill.\(skillName).enabled", enabled ? "1" : "0")
    }

    // MARK: - Git Status (reads from working directory)

    struct GitStatus: Sendable {
        let branch: String
        let changedFiles: Int
        let isClean: Bool
    }

    nonisolated func gitStatus(cwd: String) -> GitStatus? {
        guard !cwd.isEmpty else { return nil }
        let pipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["status", "--porcelain", "-b"]
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
        } catch { return nil }
        guard process.terminationStatus == 0 else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""
        let lines = output.components(separatedBy: "\n").filter { !$0.isEmpty }
        let branch = lines.first.map { line -> String in
            // ## main...origin/main
            let trimmed = line.replacingOccurrences(of: "## ", with: "")
            return trimmed.components(separatedBy: "...").first ?? trimmed
        } ?? "unknown"
        let changed = lines.dropFirst().count
        return GitStatus(branch: branch, changedFiles: changed, isClean: changed == 0)
    }

    // MARK: - Skills (reads .klaus/skills/ directory)

    struct SkillInfo: Identifiable, Sendable {
        let id: String
        let name: String
        let description: String
    }

    nonisolated func listSkills() -> [SkillInfo] {
        let skillsDir = "\(KlausPaths.configDir)/skills"
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: skillsDir) else { return [] }
        var skills: [SkillInfo] = []
        for entry in entries.sorted() {
            let skillMd = "\(skillsDir)/\(entry)/SKILL.md"
            guard FileManager.default.fileExists(atPath: skillMd) else { continue }
            let content = (try? String(contentsOfFile: skillMd, encoding: .utf8)) ?? ""
            let desc = content.components(separatedBy: "\n").first(where: { !$0.hasPrefix("#") && !$0.isEmpty }) ?? ""
            skills.append(SkillInfo(id: entry, name: entry, description: desc))
        }
        return skills
    }

    // MARK: - MCP Servers (reads/writes ~/.klaus/.mcp.json)

    struct MCPServer: Identifiable, Sendable {
        let id: String
        let name: String
        let type: String
        let command: String?
        let args: [String]
        let url: String?
        let env: [String: String]
        let timeout: Int?
    }

    private nonisolated var mcpJsonPath: String {
        "\(KlausPaths.configDir)/.mcp.json"
    }

    private nonisolated func readMCPJson() -> [String: Any] {
        let paths = [
            "\(KlausPaths.configDir)/.mcp.json",
            "\(KlausPaths.configDir)/mcp.json",
        ]
        for path in paths {
            guard let data = FileManager.default.contents(atPath: path),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            return json
        }
        return ["mcpServers": [String: Any]()]
    }

    private nonisolated func writeMCPJson(_ json: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? data.write(to: URL(fileURLWithPath: mcpJsonPath))
    }

    nonisolated func listMCPServers() -> [MCPServer] {
        let json = readMCPJson()
        guard let servers = json["mcpServers"] as? [String: Any] else { return [] }
        return servers.compactMap { key, value -> MCPServer? in
            guard let config = value as? [String: Any] else { return nil }
            return MCPServer(
                id: key,
                name: key,
                type: config["type"] as? String ?? "stdio",
                command: config["command"] as? String,
                args: config["args"] as? [String] ?? [],
                url: config["url"] as? String,
                env: config["env"] as? [String: String] ?? [:],
                timeout: config["timeout"] as? Int
            )
        }.sorted { $0.name < $1.name }
    }

    nonisolated func addMCPServer(name: String, type: String, command: String?, args: [String], url: String?, env: [String: String], timeout: Int?) {
        var json = readMCPJson()
        var servers = json["mcpServers"] as? [String: Any] ?? [:]
        var entry: [String: Any] = ["type": type]
        if let command { entry["command"] = command }
        if !args.isEmpty { entry["args"] = args }
        if let url { entry["url"] = url }
        if !env.isEmpty { entry["env"] = env }
        if let timeout { entry["timeout"] = timeout }
        servers[name] = entry
        json["mcpServers"] = servers
        writeMCPJson(json)
    }

    nonisolated func deleteMCPServer(name: String) {
        var json = readMCPJson()
        var servers = json["mcpServers"] as? [String: Any] ?? [:]
        servers.removeValue(forKey: name)
        json["mcpServers"] = servers
        writeMCPJson(json)
    }

    func toggleMCPServer(name: String, enabled: Bool) {
        setSetting("mcp_disabled_\(name)", enabled ? "0" : "1")
    }

    // MARK: - Users (reads/writes ~/.klaus/users.db)

    struct UserRow: Sendable {
        let id: String
        let email: String
        let displayName: String
        let role: String
        let avatarUrl: String?
    }

    func getFirstUser() -> UserRow? {
        guard let stmt = prepareOn(usersDb, "SELECT id, email, display_name, role, avatar_url FROM users WHERE is_active = 1 LIMIT 1") else { return nil }
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return UserRow(
            id: columnText(stmt, 0) ?? "",
            email: columnText(stmt, 1) ?? "",
            displayName: columnText(stmt, 2) ?? "",
            role: columnText(stmt, 3) ?? "user",
            avatarUrl: columnText(stmt, 4)
        )
    }

    func updateDisplayName(_ userId: String, _ name: String) {
        guard let stmt = prepareOn(usersDb, "UPDATE users SET display_name = ? WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, name, -1, nil)
        sqlite3_bind_text(stmt, 2, userId, -1, nil)
        sqlite3_step(stmt)
    }

    func updateAvatarUrl(_ userId: String, _ url: String) {
        guard let stmt = prepareOn(usersDb, "UPDATE users SET avatar_url = ? WHERE id = ?") else { return }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, url, -1, nil)
        sqlite3_bind_text(stmt, 2, userId, -1, nil)
        sqlite3_step(stmt)
    }
}
