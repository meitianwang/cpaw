import SwiftUI
import UniformTypeIdentifiers

// MARK: - Settings View (replaces the old SettingsRootView in main window context)

struct MainSettingsView: View {
    @Binding var isPresented: Bool
    var initialTab: SettingsTab = .profile
    @State private var selectedTab: SettingsTab = .profile
    @State private var state = AppState.shared
    @State private var didApplyInitialTab = false

    enum SettingsTab: String, CaseIterable {
        case profile = "个人资料"
        case appearance = "外观"
        case permissions = "权限模式"
        case models = "模型"
        case channels = "频道"
        case skills = "技能"
        case mcp = "MCP 服务器"
        case cron = "定时任务"
        case voiceWake = "语音唤醒"
        case engine = "引擎"
        case about = "关于"

        var icon: String {
            switch self {
            case .profile: return "person.circle"
            case .appearance: return "paintbrush"
            case .permissions: return "lock.shield"
            case .models: return "cpu"
            case .channels: return "bubble.left.and.bubble.right"
            case .skills: return "sparkles"
            case .mcp: return "server.rack"
            case .cron: return "clock.arrow.circlepath"
            case .voiceWake: return "waveform"
            case .engine: return "gearshape.2"
            case .about: return "info.circle"
            }
        }
    }

    var body: some View {
        HSplitView {
            // Settings sidebar
            VStack(alignment: .leading, spacing: 0) {
                // Back button
                Button {
                    isPresented = false
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.caption)
                        Text("返回")
                            .font(.subheadline)
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)

                Text("设置")
                    .font(.title3.weight(.bold))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)

                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(SettingsTab.allCases, id: \.self) { tab in
                            SettingsNavButton(
                                tab: tab,
                                isActive: selectedTab == tab
                            ) {
                                selectedTab = tab
                            }
                        }
                    }
                    .padding(.horizontal, 8)
                }
            }
            .frame(minWidth: 180, idealWidth: 200, maxWidth: 220)
            .background(Color(nsColor: .windowBackgroundColor))

            // Settings content
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch selectedTab {
                    case .profile:
                        ProfileSettingsContent(state: state)
                    case .appearance:
                        AppearanceSettingsContent(state: state)
                    case .permissions:
                        PermissionsSettingsContent(state: state)
                    case .models:
                        ModelsSettingsContent()
                    case .channels:
                        ChannelsSettingsContent()
                    case .skills:
                        SkillsSettingsContent()
                    case .mcp:
                        MCPSettingsContent()
                    case .cron:
                        CronSettingsContent()
                    case .voiceWake:
                        VoiceWakeSettingsContent(state: state)
                    case .engine:
                        EngineSettingsContent(state: state)
                    case .about:
                        AboutSettingsContent()
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .onAppear {
            if !didApplyInitialTab {
                selectedTab = initialTab
                didApplyInitialTab = true
            }
        }
    }
}

// MARK: - Settings Nav Button

struct SettingsNavButton: View {
    let tab: MainSettingsView.SettingsTab
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: tab.icon)
                    .font(.caption)
                    .frame(width: 16)
                Text(tab.rawValue)
                    .font(.subheadline)
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isActive ? Color.accentColor : Color.clear)
            )
            .foregroundStyle(isActive ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Settings Section Helper

struct SettingsSectionHeader: View {
    let title: String
    let subtitle: String?

    init(_ title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title3.weight(.semibold))
            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.bottom, 16)
    }
}

// MARK: - Profile Settings

struct ProfileSettingsContent: View {
    @Bindable var state: AppState
    @State private var userId: String = ""
    @State private var email: String = ""
    @State private var displayName: String = ""
    @State private var role: String = "user"
    @State private var saved = false
    @State private var avatarImage: NSImage?

    var body: some View {
        SettingsSectionHeader("个人资料")

        HStack(spacing: 16) {
            ZStack {
                if let img = avatarImage {
                    Image(nsImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 64, height: 64)
                        .clipShape(Circle())
                } else {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 64, height: 64)
                        .overlay(
                            Text(String((displayName.isEmpty ? email : displayName).first ?? Character("U")).uppercased())
                                .font(.title.weight(.bold))
                                .foregroundStyle(.white)
                        )
                }
            }
            .overlay(
                Circle()
                    .fill(Color.black.opacity(0.4))
                    .overlay(
                        Image(systemName: "camera.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(.white)
                    )
                    .opacity(0)
            )
            .onTapGesture { pickAvatar() }
            .help("点击更换头像")

            VStack(alignment: .leading, spacing: 2) {
                Text(displayName.isEmpty ? email : displayName)
                    .font(.headline)
                Text(role)
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(role == "admin" ? Color.orange.opacity(0.15) : Color.secondary.opacity(0.1))
                    .foregroundStyle(role == "admin" ? .orange : .secondary)
                    .clipShape(Capsule())
            }
        }
        .padding(.bottom, 20)

        VStack(alignment: .leading, spacing: 6) {
            Text("邮箱")
                .font(.subheadline.weight(.medium))
            TextField("Email", text: .constant(email))
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 300)
                .disabled(true)
                .foregroundStyle(.secondary)
        }
        .padding(.bottom, 12)

        VStack(alignment: .leading, spacing: 6) {
            Text("显示名称")
                .font(.subheadline.weight(.medium))
            TextField("Display name", text: $displayName)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 300)
        }
        .padding(.bottom, 12)

        HStack(spacing: 8) {
            Button("保存") {
                if !userId.isEmpty {
                    SettingsDB.shared.updateDisplayName(userId, displayName)
                }
                saved = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
            }
            .buttonStyle(.borderedProminent)

            if saved {
                Text("已保存")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
        .task {
            if let user = SettingsDB.shared.getFirstUser() {
                userId = user.id
                email = user.email
                displayName = user.displayName
                role = user.role
                loadAvatarImage(avatarUrl: user.avatarUrl)
            }
        }
    }

    private func pickAvatar() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.jpeg, .png, .webP]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard !userId.isEmpty else { return }

        let ext = url.pathExtension.lowercased()
        let avatarsDir = "\(KlausPaths.configDir)/avatars"
        let filename = "\(userId).\(ext)"
        let destPath = "\(avatarsDir)/\(filename)"

        try? FileManager.default.createDirectory(atPath: avatarsDir, withIntermediateDirectories: true)
        // Remove any existing avatar with different extension
        if let existing = try? FileManager.default.contentsOfDirectory(atPath: avatarsDir) {
            for file in existing where file.hasPrefix("\(userId).") {
                try? FileManager.default.removeItem(atPath: "\(avatarsDir)/\(file)")
            }
        }
        try? FileManager.default.copyItem(at: url, to: URL(fileURLWithPath: destPath))

        let avatarUrlValue = "/api/avatars/\(filename)"
        SettingsDB.shared.updateAvatarUrl(userId, avatarUrlValue)
        loadAvatarImage(avatarUrl: avatarUrlValue)
    }

    private func loadAvatarImage(avatarUrl: String?) {
        guard let avatarUrl, !avatarUrl.isEmpty else {
            avatarImage = nil
            return
        }
        // Extract filename from URL like /api/avatars/userId.ext
        let filename = (avatarUrl as NSString).lastPathComponent
        let path = "\(KlausPaths.configDir)/avatars/\(filename)"
        avatarImage = NSImage(contentsOfFile: path)
    }
}

// MARK: - Appearance Settings

struct AppearanceSettingsContent: View {
    @Bindable var state: AppState
    @State private var currentTheme: String = "auto"

    var body: some View {
        SettingsSectionHeader("外观", subtitle: "自定义主题和显示选项")

        Text("主题")
            .font(.subheadline.weight(.medium))
            .padding(.bottom, 8)

        HStack(spacing: 12) {
            ThemeCard(title: "浅色", theme: "light", isActive: currentTheme == "light") {
                applyTheme("light")
            }
            ThemeCard(title: "深色", theme: "dark", isActive: currentTheme == "dark") {
                applyTheme("dark")
            }
            ThemeCard(title: "跟随系统", theme: "auto", isActive: currentTheme == "auto") {
                applyTheme("auto")
            }
        }
        .padding(.bottom, 20)

        Toggle("在 Dock 中显示图标", isOn: $state.showDockIcon)
            .toggleStyle(.switch)
            .task {
                currentTheme = UserDefaults.standard.string(forKey: "klaus.theme") ?? "auto"
            }
    }

    private func applyTheme(_ theme: String) {
        currentTheme = theme
        UserDefaults.standard.set(theme, forKey: "klaus.theme")
        switch theme {
        case "light":
            NSApp.appearance = NSAppearance(named: .aqua)
        case "dark":
            NSApp.appearance = NSAppearance(named: .darkAqua)
        default:
            NSApp.appearance = nil
        }
    }
}

struct ThemeCard: View {
    let title: String
    let theme: String
    let isActive: Bool
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(themeBackground)
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isActive ? Color.accentColor : Color.secondary.opacity(0.2), lineWidth: isActive ? 2 : 1)
                }
                .frame(width: 80, height: 50)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(isActive ? Color.accentColor : .secondary)
            }
        }
        .buttonStyle(.plain)
    }

    private var themeBackground: some ShapeStyle {
        switch theme {
        case "dark": return AnyShapeStyle(Color.black)
        case "light": return AnyShapeStyle(Color.white)
        default: return AnyShapeStyle(Color.gray.opacity(0.3))
        }
    }
}

// MARK: - Permissions Settings

struct PermissionsSettingsContent: View {
    @Bindable var state: AppState

    var body: some View {
        SettingsSectionHeader("权限模式", subtitle: "选择工具执行时是否需要你的批准")

        VStack(spacing: 8) {
            PermModeCard(
                icon: "shield",
                title: "默认",
                desc: "对可能有风险的操作请求权限",
                mode: "default",
                isActive: state.permissionMode == "default"
            ) { state.permissionMode = "default" }

            PermModeCard(
                icon: "doc.text",
                title: "计划模式",
                desc: "在执行前审查和批准计划",
                mode: "plan",
                isActive: state.permissionMode == "plan"
            ) { state.permissionMode = "plan" }

            PermModeCard(
                icon: "pencil.line",
                title: "接受编辑",
                desc: "自动批准文件编辑，其他操作需确认",
                mode: "acceptEdits",
                isActive: state.permissionMode == "acceptEdits"
            ) { state.permissionMode = "acceptEdits" }

            PermModeCard(
                icon: "bolt",
                title: "YOLO 模式",
                desc: "自动批准所有工具，无需确认",
                mode: "bypassPermissions",
                isActive: state.permissionMode == "bypassPermissions"
            ) { state.permissionMode = "bypassPermissions" }
        }
    }
}

struct PermModeCard: View {
    let icon: String
    let title: String
    let desc: String
    let mode: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.body)
                    .frame(width: 24)
                    .foregroundStyle(isActive ? Color.accentColor : .secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                    Text(desc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isActive {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.accentColor)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isActive ? Color.accentColor.opacity(0.06) : Color.secondary.opacity(0.03))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isActive ? Color.accentColor.opacity(0.3) : Color.secondary.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 500)
    }
}

// MARK: - Models Settings

struct ModelsSettingsContent: View {
    @State private var models: [SettingsDB.ModelRow] = []
    @State private var showAddSheet = false

    var body: some View {
        SettingsSectionHeader("模型", subtitle: "配置 AI 模型和 API 密钥")

        HStack(spacing: 8) {
            Button {
                showAddSheet = true
            } label: {
                Label("添加模型", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)

            Button {
                refreshModels()
            } label: {
                Label("刷新", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
        }
        .padding(.bottom, 12)

        if models.isEmpty {
            Text("暂无模型配置")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
        } else {
            VStack(spacing: 8) {
                ForEach(models) { model in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(model.name)
                                    .font(.subheadline.weight(.medium))
                                if model.isDefault {
                                    Text("默认")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.accentColor.opacity(0.15))
                                        .foregroundStyle(Color.accentColor)
                                        .clipShape(Capsule())
                                }
                                if let role = model.role, !role.isEmpty {
                                    Text(role)
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.purple.opacity(0.15))
                                        .foregroundStyle(.purple)
                                        .clipShape(Capsule())
                                }
                            }
                            Text("\(model.provider) / \(model.model)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if model.thinking != "off" {
                                Text("Thinking: \(model.thinking)")
                                    .font(.caption2)
                                    .foregroundStyle(.orange)
                            }
                            if let ci = model.costInput, let co = model.costOutput {
                                Text(String(format: "$%.3f / $%.3f", ci, co))
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        Spacer()
                        if !model.isDefault {
                            Button("设为默认") {
                                SettingsDB.shared.setDefaultModel(model.id)
                                refreshModels()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        Button(role: .destructive) {
                            SettingsDB.shared.deleteModel(model.id)
                            refreshModels()
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.secondary.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                    )
                }
            }
            .frame(maxWidth: 550)
        }

        Spacer().frame(height: 0)
            .task { refreshModels() }
            .sheet(isPresented: $showAddSheet) {
                AddModelSheet { refreshModels() }
            }
    }

    private func refreshModels() {
        models = SettingsDB.shared.listModels()
    }
}

struct AddModelSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void

    @State private var name = ""
    @State private var provider = "anthropic"
    @State private var modelId = ""
    @State private var apiKey = ""
    @State private var baseUrl = ""
    @State private var thinking = "off"
    @State private var maxContextTokens = "200000"
    @State private var role = ""
    @State private var authType = "api_key"
    @State private var costInput = ""
    @State private var costOutput = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("添加模型")
                .font(.title3.weight(.semibold))

            Form {
                TextField("名称", text: $name)
                TextField("Provider", text: $provider)
                    .textContentType(.none)
                TextField("Model ID", text: $modelId)
                SecureField("API Key", text: $apiKey)
                TextField("Base URL (可选)", text: $baseUrl)
                Picker("Thinking", selection: $thinking) {
                    Text("Off").tag("off")
                    Text("On").tag("on")
                }
                TextField("Max Context Tokens", text: $maxContextTokens)
                Picker("Role", selection: $role) {
                    Text("无").tag("")
                    Text("sonnet").tag("sonnet")
                    Text("haiku").tag("haiku")
                    Text("opus").tag("opus")
                }
                Picker("Auth Type", selection: $authType) {
                    Text("api_key").tag("api_key")
                    Text("oauth").tag("oauth")
                }
                TextField("Cost Input ($/M tokens)", text: $costInput)
                TextField("Cost Output ($/M tokens)", text: $costOutput)
            }
            .formStyle(.grouped)

            HStack {
                Spacer()
                Button("取消") { dismiss() }
                    .buttonStyle(.bordered)
                Button("保存") {
                    let row = SettingsDB.ModelRow(
                        id: UUID().uuidString,
                        name: name,
                        provider: provider,
                        model: modelId,
                        apiKey: apiKey.isEmpty ? nil : apiKey,
                        baseUrl: baseUrl.isEmpty ? nil : baseUrl,
                        maxContextTokens: Int(maxContextTokens) ?? 200000,
                        thinking: thinking,
                        isDefault: false,
                        role: role.isEmpty ? nil : role,
                        authType: authType,
                        costInput: Double(costInput),
                        costOutput: Double(costOutput),
                        costCacheRead: nil,
                        costCacheWrite: nil
                    )
                    SettingsDB.shared.upsertModel(row)
                    onSave()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(name.isEmpty || modelId.isEmpty)
            }
        }
        .padding(20)
        .frame(minWidth: 420)
    }
}

// MARK: - Channels Settings

enum ChannelType: String, CaseIterable, Identifiable {
    case feishu = "飞书"
    case dingtalk = "钉钉"
    case wechat = "微信"
    case qq = "QQ"
    case wecom = "企微"
    case telegram = "Telegram"
    case imessage = "iMessage"
    case whatsapp = "WhatsApp"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .feishu: return "paperplane"
        case .dingtalk: return "bell"
        case .wechat: return "message"
        case .qq: return "bubble.left"
        case .wecom: return "briefcase"
        case .telegram: return "paperplane.circle"
        case .imessage: return "bubble.left.and.text.bubble.right"
        case .whatsapp: return "phone.bubble"
        }
    }

    var settingsPrefix: String {
        switch self {
        case .feishu: return "channel.feishu"
        case .dingtalk: return "channel.dingtalk"
        case .wechat: return "channel.wechat"
        case .qq: return "channel.qq"
        case .wecom: return "channel.wecom"
        case .telegram: return "channel.telegram"
        case .imessage: return "channel.imessage"
        case .whatsapp: return "channel.whatsapp"
        }
    }

    /// Whether this channel requires scanning a QR code and cannot be configured locally.
    var requiresQRScan: Bool {
        self == .wechat || self == .whatsapp
    }

    /// The fields each channel needs, as (key suffix, label, isSecure) tuples.
    var configFields: [(key: String, label: String, isSecure: Bool)] {
        switch self {
        case .feishu:
            return [("app_id", "App ID", false), ("app_secret", "App Secret", true)]
        case .dingtalk:
            return [("client_id", "Client ID", false), ("client_secret", "Client Secret", true)]
        case .wechat:
            return []
        case .qq:
            return [("app_id", "App ID", false), ("client_secret", "Client Secret", true)]
        case .wecom:
            return [("bot_id", "Bot ID", false), ("secret", "Secret", true)]
        case .telegram:
            return [("bot_token", "Bot Token", true)]
        case .imessage:
            return [("cli_path", "CLI Path", false)]
        case .whatsapp:
            return []
        }
    }
}

struct ChannelsSettingsContent: View {
    @State private var enabledChannels: Set<String> = []
    @State private var configuring: ChannelType?

    var body: some View {
        SettingsSectionHeader("频道", subtitle: "连接 IM 平台，让用户可以直接从消息应用中与 Klaus 对话")

        LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 12)], spacing: 12) {
            ForEach(ChannelType.allCases) { channel in
                let isEnabled = enabledChannels.contains(channel.settingsPrefix)
                HStack(spacing: 12) {
                    Image(systemName: channel.icon)
                        .font(.title3)
                        .foregroundStyle(isEnabled ? Color.accentColor : .secondary)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(channel.rawValue)
                            .font(.subheadline.weight(.medium))
                        Text(isEnabled ? "已启用" : "未配置")
                            .font(.caption)
                            .foregroundStyle(isEnabled ? .green : .secondary)
                        if isEnabled, let meta = channelMetadata(for: channel), !meta.isEmpty {
                            Text(meta)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    Spacer()
                    Button("配置") {
                        configuring = channel
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(isEnabled ? Color.accentColor.opacity(0.04) : Color.secondary.opacity(0.03))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isEnabled ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1), lineWidth: 1)
                )
            }
        }
        .frame(maxWidth: 600)
        .task { refreshEnabled() }
        .sheet(item: $configuring) { channel in
            ChannelConfigSheet(channel: channel) { refreshEnabled() }
        }
    }

    private func refreshEnabled() {
        enabledChannels = Set(ChannelType.allCases.compactMap { ch in
            SettingsDB.shared.getSetting("\(ch.settingsPrefix).enabled") == "1" ? ch.settingsPrefix : nil
        })
    }

    private func channelMetadata(for channel: ChannelType) -> String? {
        let db = SettingsDB.shared
        let p = channel.settingsPrefix
        var parts: [String] = []

        switch channel {
        case .feishu:
            if let appId = db.getSetting("\(p).app_id"), !appId.isEmpty { parts.append("App: \(appId)") }
            if let botName = db.getSetting("\(p).bot_name"), !botName.isEmpty { parts.append(botName) }
        case .dingtalk:
            if let clientId = db.getSetting("\(p).client_id"), !clientId.isEmpty { parts.append("Client: \(clientId)") }
        case .qq:
            if let appId = db.getSetting("\(p).app_id"), !appId.isEmpty { parts.append("App: \(appId)") }
        case .wecom:
            if let botId = db.getSetting("\(p).bot_id"), !botId.isEmpty { parts.append("Bot: \(botId)") }
        case .telegram:
            if let username = db.getSetting("\(p).bot_username"), !username.isEmpty { parts.append("@\(username)") }
            if let botName = db.getSetting("\(p).bot_name"), !botName.isEmpty { parts.append(botName) }
        case .imessage:
            if let cliPath = db.getSetting("\(p).cli_path"), !cliPath.isEmpty { parts.append(cliPath) }
        case .whatsapp:
            if let phone = db.getSetting("\(p).phone_number"), !phone.isEmpty { parts.append(phone) }
        case .wechat:
            if let accountId = db.getSetting("\(p).account_id"), !accountId.isEmpty { parts.append(accountId) }
        }

        return parts.isEmpty ? nil : parts.joined(separator: " | ")
    }
}

struct ChannelConfigSheet: View {
    let channel: ChannelType
    var onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var fieldValues: [String: String] = [:]
    @State private var saved = false
    @State private var copiedPerms = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: channel.icon)
                    .font(.title3)
                Text("配置 \(channel.rawValue)")
                    .font(.title3.weight(.semibold))
            }

            if channel == .feishu {
                Button {
                    let permsJson = """
                    {"scopes":{"tenant":["contact:contact.base:readonly","im:message:send_as_bot","im:message:readonly","im:resource"],"user":["offline_access","im:message","im:chat:read"]}}
                    """
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(permsJson, forType: .string)
                    copiedPerms = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copiedPerms = false }
                } label: {
                    Label(copiedPerms ? "已复制" : "复制飞书权限 JSON", systemImage: copiedPerms ? "checkmark" : "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .padding(.bottom, 8)
            }

            if channel.requiresQRScan {
                // Native QR scanning for WeChat / WhatsApp
                QRScanView(channel: channel)
            } else {
                Form {
                    ForEach(channel.configFields, id: \.key) { field in
                        if field.isSecure {
                            SecureField(field.label, text: Binding(
                                get: { fieldValues[field.key, default: ""] },
                                set: { fieldValues[field.key] = $0 }
                            ))
                        } else {
                            TextField(field.label, text: Binding(
                                get: { fieldValues[field.key, default: ""] },
                                set: { fieldValues[field.key] = $0 }
                            ))
                        }
                    }
                }
                .formStyle(.grouped)
            }

            HStack {
                Button("断开连接") {
                    SettingsDB.shared.deleteSettingsWithPrefix(channel.settingsPrefix)
                    SettingsDB.shared.setSetting("\(channel.settingsPrefix).enabled", "0")
                    onSave()
                    dismiss()
                }
                .buttonStyle(.bordered)
                .foregroundStyle(.red)

                Spacer()
                Button("取消") { dismiss() }
                    .buttonStyle(.bordered)

                if !channel.requiresQRScan {
                    Button("保存") {
                        for field in channel.configFields {
                            let value = fieldValues[field.key, default: ""]
                            SettingsDB.shared.setSetting("\(channel.settingsPrefix).\(field.key)", value)
                        }
                        SettingsDB.shared.setSetting("\(channel.settingsPrefix).enabled", "1")
                        onSave()
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(channel.configFields.contains { fieldValues[$0.key, default: ""].isEmpty })
                }
            }
        }
        .padding(20)
        .frame(minWidth: 420)
        .task {
            for field in channel.configFields {
                fieldValues[field.key] = SettingsDB.shared.getSetting("\(channel.settingsPrefix).\(field.key)") ?? ""
            }
        }
    }
}

// MARK: - Skills Settings

struct SkillsSettingsContent: View {
    @State private var skills: [SettingsDB.SkillInfo] = []
    @State private var showMarketSheet = false
    @State private var searchText = ""
    @State private var skillFilter: SkillFilter = .all

    enum SkillFilter: String, CaseIterable {
        case all = "全部"
        case installed = "已安装"
        case enabled = "已启用"
        case disabled = "已禁用"
    }

    var filteredSkills: [SettingsDB.SkillInfo] {
        skills.filter { skill in
            let matchesSearch = searchText.isEmpty || skill.name.localizedCaseInsensitiveContains(searchText)
            let matchesFilter: Bool
            switch skillFilter {
            case .all: matchesFilter = true
            case .installed: matchesFilter = true
            case .enabled: matchesFilter = SettingsDB.shared.isSkillEnabled(skill.name)
            case .disabled: matchesFilter = !SettingsDB.shared.isSkillEnabled(skill.name)
            }
            return matchesSearch && matchesFilter
        }
    }

    var body: some View {
        SettingsSectionHeader("技能", subtitle: "管理可用的技能和命令")

        // Search and filter
        VStack(spacing: 8) {
            TextField("搜索技能...", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 550)

            Picker("筛选", selection: $skillFilter) {
                ForEach(SkillFilter.allCases, id: \.self) { f in
                    Text(f.rawValue).tag(f)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 550)
        }
        .padding(.bottom, 12)

        HStack(spacing: 8) {
            Button {
                let skillsDir = "\(KlausPaths.configDir)/skills"
                try? FileManager.default.createDirectory(atPath: skillsDir, withIntermediateDirectories: true)
                NSWorkspace.shared.open(URL(fileURLWithPath: skillsDir))
            } label: {
                Label("打开技能目录", systemImage: "folder")
            }
            .buttonStyle(.bordered)

            Button {
                showMarketSheet = true
            } label: {
                Label("从市场安装", systemImage: "square.and.arrow.down")
            }
            .buttonStyle(.borderedProminent)

            Button {
                uploadSkillFile()
            } label: {
                Label("上传技能", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.bordered)
        }
        .padding(.bottom, 12)

        if filteredSkills.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.largeTitle)
                    .foregroundStyle(.tertiary)
                Text(skills.isEmpty ? "暂无技能" : "无匹配技能")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if skills.isEmpty {
                    Text("将技能文件夹放入 ~/.klaus/skills/ 目录即可添加")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        } else {
            VStack(spacing: 8) {
                ForEach(filteredSkills) { skill in
                    HStack(spacing: 12) {
                        Image(systemName: "sparkles")
                            .foregroundStyle(.orange)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(skill.name)
                                .font(.subheadline.weight(.medium))
                            if !skill.description.isEmpty {
                                Text(skill.description)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { SettingsDB.shared.isSkillEnabled(skill.name) },
                            set: { SettingsDB.shared.setSkillEnabled(skill.name, $0) }
                        ))
                        .toggleStyle(.switch)
                        .labelsHidden()

                        Button(role: .destructive) {
                            uninstallSkill(skill.name)
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                        .help("卸载技能")
                    }
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.secondary.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                    )
                }
            }
            .frame(maxWidth: 550)
        }

        Spacer().frame(height: 0)
            .task { refreshSkills() }
            .sheet(isPresented: $showMarketSheet) {
                SkillsMarketSheet { refreshSkills() }
            }
    }

    private func refreshSkills() {
        skills = SettingsDB.shared.listSkills()
    }

    private func uploadSkillFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.zip, .folder]
        panel.canChooseDirectories = true
        panel.prompt = "安装"
        if panel.runModal() == .OK, let url = panel.url {
            let name = url.deletingPathExtension().lastPathComponent
            let dest = "\(KlausPaths.configDir)/skills/\(name)"
            try? FileManager.default.createDirectory(atPath: "\(KlausPaths.configDir)/skills", withIntermediateDirectories: true)
            if url.hasDirectoryPath {
                try? FileManager.default.copyItem(at: url, to: URL(fileURLWithPath: dest))
            } else {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
                process.arguments = ["-o", url.path, "-d", dest]
                try? process.run()
                process.waitUntilExit()
            }
            refreshSkills()
        }
    }

    private func uninstallSkill(_ name: String) {
        let path = "\(KlausPaths.configDir)/skills/\(name)"
        try? FileManager.default.removeItem(atPath: path)
        refreshSkills()
    }
}

struct SkillsMarketSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onInstall: () -> Void

    @State private var marketSkills: [SettingsDB.SkillInfo] = []
    @State private var installedNames: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("技能市场")
                .font(.title3.weight(.semibold))

            if marketSkills.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.largeTitle)
                        .foregroundStyle(.tertiary)
                    Text("暂无可用技能")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("将技能放入 ~/.klaus/skills-market/ 目录即可在此显示")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(marketSkills) { skill in
                            HStack(spacing: 12) {
                                Image(systemName: "sparkles")
                                    .foregroundStyle(.purple)
                                    .frame(width: 20)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(skill.name)
                                        .font(.subheadline.weight(.medium))
                                    if !skill.description.isEmpty {
                                        Text(skill.description)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                }
                                Spacer()
                                if installedNames.contains(skill.name) {
                                    Text("已安装")
                                        .font(.caption)
                                        .foregroundStyle(.green)
                                } else {
                                    Button("安装") {
                                        installSkill(skill.name)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                }
                            }
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color.secondary.opacity(0.04))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                            )
                        }
                    }
                }
                .frame(maxHeight: 400)
            }

            HStack {
                Spacer()
                Button("关闭") { dismiss() }
                    .buttonStyle(.bordered)
            }
        }
        .padding(20)
        .frame(minWidth: 460)
        .task {
            marketSkills = listMarketSkills()
            let installed = SettingsDB.shared.listSkills()
            installedNames = Set(installed.map(\.name))
        }
    }

    private func listMarketSkills() -> [SettingsDB.SkillInfo] {
        let marketDir = "\(KlausPaths.configDir)/skills-market"
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: marketDir) else { return [] }
        var skills: [SettingsDB.SkillInfo] = []
        for entry in entries.sorted() {
            let skillMd = "\(marketDir)/\(entry)/SKILL.md"
            guard FileManager.default.fileExists(atPath: skillMd) else { continue }
            let content = (try? String(contentsOfFile: skillMd, encoding: .utf8)) ?? ""
            let desc = content.components(separatedBy: "\n").first(where: { !$0.hasPrefix("#") && !$0.isEmpty }) ?? ""
            skills.append(SettingsDB.SkillInfo(id: entry, name: entry, description: desc))
        }
        return skills
    }

    private func installSkill(_ name: String) {
        let src = "\(KlausPaths.configDir)/skills-market/\(name)"
        let dst = "\(KlausPaths.configDir)/skills/\(name)"
        try? FileManager.default.createDirectory(atPath: "\(KlausPaths.configDir)/skills", withIntermediateDirectories: true)
        try? FileManager.default.copyItem(atPath: src, toPath: dst)
        installedNames.insert(name)
        onInstall()
    }
}

// MARK: - MCP Settings

struct MCPSettingsContent: View {
    @State private var servers: [SettingsDB.MCPServer] = []
    @State private var showAddSheet = false

    var body: some View {
        SettingsSectionHeader("MCP 服务器", subtitle: "管理 Model Context Protocol 服务器连接")

        Button {
            showAddSheet = true
        } label: {
            Label("添加 MCP 服务器", systemImage: "plus")
        }
        .buttonStyle(.borderedProminent)
        .padding(.bottom, 12)

        if servers.isEmpty {
            Text("暂无 MCP 服务器配置")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
        } else {
            VStack(spacing: 8) {
                ForEach(servers) { server in
                    HStack(spacing: 12) {
                        Image(systemName: "server.rack")
                            .foregroundStyle(.blue)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(server.name)
                                    .font(.subheadline.weight(.medium))
                                Text(server.type)
                                    .font(.caption2)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(Color.blue.opacity(0.12))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }
                            if let cmd = server.command, !cmd.isEmpty {
                                Text("\(cmd) \(server.args.joined(separator: " "))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            } else if let url = server.url, !url.isEmpty {
                                Text(url)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { SettingsDB.shared.getSetting("mcp.\(server.name).disabled") != "1" },
                            set: { enabled in
                                SettingsDB.shared.toggleMCPServer(name: server.name, enabled: enabled)
                                refreshServers()
                            }
                        ))
                        .toggleStyle(.switch)
                        .labelsHidden()

                        Button(role: .destructive) {
                            SettingsDB.shared.deleteMCPServer(name: server.name)
                            refreshServers()
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.secondary.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                    )
                }
            }
            .frame(maxWidth: 550)
        }

        Spacer().frame(height: 0)
            .task { refreshServers() }
            .sheet(isPresented: $showAddSheet) {
                AddMCPSheet { refreshServers() }
            }
    }

    private func refreshServers() {
        servers = SettingsDB.shared.listMCPServers()
    }
}

struct AddMCPSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void

    @State private var useJsonMode = false
    @State private var jsonText = ""
    @State private var jsonError: String?

    @State private var name = ""
    @State private var type = "stdio"
    @State private var command = ""
    @State private var argsText = ""
    @State private var url = ""
    @State private var envText = ""
    @State private var timeoutText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("添加 MCP 服务器")
                .font(.title3.weight(.semibold))

            Picker("添加方式", selection: $useJsonMode) {
                Text("手动配置").tag(false)
                Text("JSON 导入").tag(true)
            }
            .pickerStyle(.segmented)

            if useJsonMode {
                Text("粘贴 .mcp.json 格式的 JSON 配置")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextEditor(text: $jsonText)
                    .font(.system(.caption, design: .monospaced))
                    .frame(height: 150)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                    )
                if let jsonError {
                    Text(jsonError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            } else {
                Form {
                    TextField("名称", text: $name)
                    Picker("类型", selection: $type) {
                        Text("stdio").tag("stdio")
                        Text("sse").tag("sse")
                        Text("http").tag("http")
                    }

                    if type == "stdio" {
                        TextField("Command", text: $command)
                        TextField("Args (空格分隔)", text: $argsText)
                    } else {
                        TextField("URL", text: $url)
                    }

                    TextField("Env (key=value, 每行一个)", text: $envText, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Timeout (秒, 可选)", text: $timeoutText)
                }
                .formStyle(.grouped)
            }

            HStack {
                Spacer()
                Button("取消") { dismiss() }
                    .buttonStyle(.bordered)
                Button("保存") {
                    if useJsonMode {
                        saveFromJson()
                    } else {
                        saveManual()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(useJsonMode ? jsonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty : (name.isEmpty || (type == "stdio" && command.isEmpty) || (type != "stdio" && url.isEmpty)))
            }
        }
        .padding(20)
        .frame(minWidth: 460)
    }

    private func saveManual() {
        let args = argsText.isEmpty ? [] : argsText.components(separatedBy: " ").filter { !$0.isEmpty }
        var env: [String: String] = [:]
        for line in envText.components(separatedBy: "\n") {
            let parts = line.split(separator: "=", maxSplits: 1)
            if parts.count == 2 {
                env[String(parts[0]).trimmingCharacters(in: .whitespaces)] = String(parts[1]).trimmingCharacters(in: .whitespaces)
            }
        }
        SettingsDB.shared.addMCPServer(
            name: name,
            type: type,
            command: command.isEmpty ? nil : command,
            args: args,
            url: url.isEmpty ? nil : url,
            env: env,
            timeout: Int(timeoutText)
        )
        onSave()
        dismiss()
    }

    private func saveFromJson() {
        jsonError = nil
        guard let data = jsonText.data(using: .utf8) else {
            jsonError = "无法解析文本"
            return
        }
        // Support { "mcpServers": { ... } } or bare { "serverName": { ... } }
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            jsonError = "JSON 格式错误"
            return
        }
        let servers: [String: Any]
        if let mcpServers = root["mcpServers"] as? [String: Any] {
            servers = mcpServers
        } else {
            servers = root
        }
        var addedCount = 0
        for (serverName, value) in servers {
            guard let config = value as? [String: Any] else { continue }
            let sType = config["type"] as? String ?? (config["command"] != nil ? "stdio" : "sse")
            let sCommand = config["command"] as? String
            let sArgs = config["args"] as? [String] ?? []
            let sUrl = config["url"] as? String
            var sEnv: [String: String] = [:]
            if let envDict = config["env"] as? [String: String] {
                sEnv = envDict
            }
            let sTimeout = config["timeout"] as? Int
            SettingsDB.shared.addMCPServer(
                name: serverName,
                type: sType,
                command: sCommand,
                args: sArgs,
                url: sUrl,
                env: sEnv,
                timeout: sTimeout
            )
            addedCount += 1
        }
        if addedCount == 0 {
            jsonError = "未找到有效的服务器配置"
            return
        }
        onSave()
        dismiss()
    }
}

// MARK: - Cron Settings

struct CronSettingsContent: View {
    @State private var tasks: [SettingsDB.CronTaskRow] = []
    @State private var showAddSheet = false
    @State private var schedulerRunning = false
    @State private var schedulerTaskCount = 0
    @State private var schedulerNextWake: String?

    var body: some View {
        SettingsSectionHeader("定时任务", subtitle: "配置自动执行的定时任务")

        // Scheduler status bar
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Circle()
                    .fill(schedulerRunning ? .green : .red)
                    .frame(width: 6, height: 6)
                Text(schedulerRunning ? "调度器运行中" : "调度器已停止")
                    .font(.caption)
            }
            Text("\(schedulerTaskCount) 个任务")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let nextWake = schedulerNextWake {
                Text("下次: \(nextWake)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.06))
        )
        .padding(.bottom, 8)

        Button {
            showAddSheet = true
        } label: {
            Label("添加任务", systemImage: "plus")
        }
        .buttonStyle(.borderedProminent)
        .padding(.bottom, 12)

        if tasks.isEmpty {
            Text("暂无定时任务")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
        } else {
            VStack(spacing: 8) {
                ForEach(tasks) { task in
                    HStack(spacing: 12) {
                        Toggle("", isOn: Binding(
                            get: { task.enabled },
                            set: { newVal in
                                SettingsDB.shared.toggleCronTask(task.id, enabled: newVal)
                                refreshTasks()
                            }
                        ))
                        .toggleStyle(.switch)
                        .labelsHidden()

                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(task.name ?? task.id)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(task.enabled ? .primary : .secondary)
                                if task.deleteAfterRun {
                                    Text("一次性")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.blue.opacity(0.15))
                                        .foregroundStyle(.blue)
                                        .clipShape(Capsule())
                                } else {
                                    Text("循环")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.purple.opacity(0.15))
                                        .foregroundStyle(.purple)
                                        .clipShape(Capsule())
                                }
                            }
                            HStack(spacing: 8) {
                                Text(task.schedule)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                                if let desc = task.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                        .lineLimit(1)
                                }
                            }
                            Text(task.prompt)
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Button(role: .destructive) {
                            SettingsDB.shared.deleteCronTask(task.id)
                            refreshTasks()
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.secondary.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.1), lineWidth: 1)
                    )
                }
            }
            .frame(maxWidth: 550)
        }

        Spacer().frame(height: 0)
            .task { refreshTasks(); refreshSchedulerStatus() }
            .sheet(isPresented: $showAddSheet) {
                AddCronSheet { refreshTasks(); refreshSchedulerStatus() }
            }
    }

    private func refreshTasks() {
        tasks = SettingsDB.shared.listCronTasks()
    }

    private func refreshSchedulerStatus() {
        schedulerRunning = SettingsDB.shared.getSetting("cron.scheduler.running") == "1"
        schedulerTaskCount = Int(SettingsDB.shared.getSetting("cron.scheduler.taskCount") ?? "0") ?? 0
        if let nextWakeIso = SettingsDB.shared.getSetting("cron.scheduler.nextWakeAt"), !nextWakeIso.isEmpty {
            // Format ISO date to a short readable string
            let formatter = ISO8601DateFormatter()
            if let date = formatter.date(from: nextWakeIso) {
                let display = DateFormatter()
                display.dateFormat = "MM-dd HH:mm"
                schedulerNextWake = display.string(from: date)
            } else {
                schedulerNextWake = nextWakeIso
            }
        } else {
            schedulerNextWake = nil
        }
    }
}

struct AddCronSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void

    @State private var name = ""
    @State private var description = ""
    @State private var schedule = ""
    @State private var prompt = ""
    @State private var thinking = "off"
    @State private var timeoutText = ""
    @State private var deleteAfterRun = false
    @State private var deliver = ""
    @State private var webhookUrl = ""
    @State private var webhookToken = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("添加定时任务")
                .font(.title3.weight(.semibold))

            Form {
                Section("基本信息") {
                    TextField("名称", text: $name)
                    TextField("描述 (可选)", text: $description)
                    TextField("Cron 表达式 (如 0 9 * * *)", text: $schedule)
                        .textContentType(.none)
                    TextField("Prompt", text: $prompt, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("高级选项") {
                    Picker("Thinking", selection: $thinking) {
                        Text("off").tag("off")
                        Text("minimal").tag("minimal")
                        Text("low").tag("low")
                        Text("medium").tag("medium")
                        Text("high").tag("high")
                    }
                    TextField("超时秒数 (可选)", text: $timeoutText)
                    Toggle("执行后删除", isOn: $deleteAfterRun)
                    TextField("Deliver (JSON, 可选)", text: $deliver)
                }

                Section("Webhook (可选)") {
                    TextField("Webhook URL", text: $webhookUrl)
                    SecureField("Webhook Token", text: $webhookToken)
                }
            }
            .formStyle(.grouped)

            HStack {
                Spacer()
                Button("取消") { dismiss() }
                    .buttonStyle(.bordered)
                Button("保存") {
                    let row = SettingsDB.CronTaskRow(
                        id: UUID().uuidString,
                        name: name.isEmpty ? nil : name,
                        description: description.isEmpty ? nil : description,
                        schedule: schedule,
                        prompt: prompt,
                        enabled: true,
                        thinking: thinking == "off" ? nil : thinking,
                        lightContext: false,
                        timeoutSeconds: Int(timeoutText),
                        deleteAfterRun: deleteAfterRun,
                        deliver: deliver.isEmpty ? nil : deliver,
                        webhookUrl: webhookUrl.isEmpty ? nil : webhookUrl,
                        webhookToken: webhookToken.isEmpty ? nil : webhookToken,
                        failureAlert: nil,
                        userId: nil
                    )
                    SettingsDB.shared.upsertCronTask(row)
                    onSave()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(schedule.isEmpty || prompt.isEmpty)
            }
        }
        .padding(20)
        .frame(minWidth: 460)
    }
}

struct VoiceWakeSettingsContent: View {
    @Bindable var state: AppState

    var body: some View {
        SettingsSectionHeader("语音唤醒", subtitle: "通过语音指令唤醒 Klaus")

        Toggle("启用语音唤醒", isOn: $state.voiceWakeEnabled)
            .toggleStyle(.switch)
            .padding(.bottom, 12)

        if state.voiceWakeEnabled {
            Text("语音唤醒已启用，说出唤醒词即可激活 Klaus")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

struct EngineSettingsContent: View {
    @Bindable var state: AppState

    var body: some View {
        SettingsSectionHeader("引擎", subtitle: "管理 Klaus 引擎进程")

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("引擎状态")
                    .font(.subheadline.weight(.medium))
                Spacer()
                HStack(spacing: 4) {
                    Circle()
                        .fill(engineStatusColor)
                        .frame(width: 8, height: 8)
                    Text(engineStatusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("工作目录")
                    .font(.subheadline.weight(.medium))
                HStack {
                    TextField("Working directory", text: $state.workingDirectory)
                        .textFieldStyle(.roundedBorder)
                    Button("选择") {
                        let panel = NSOpenPanel()
                        panel.canChooseDirectories = true
                        panel.canChooseFiles = false
                        if panel.runModal() == .OK, let url = panel.url {
                            state.workingDirectory = url.path
                        }
                    }
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("模型覆盖")
                    .font(.subheadline.weight(.medium))
                TextField("e.g. opus-4-6", text: $state.modelOverride)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 300)
            }

            Divider()

            HStack {
                Button("重启引擎") {
                    EngineProcess.shared.stop()
                    Task {
                        try? await Task.sleep(for: .milliseconds(500))
                        await MainActor.run { EngineProcess.shared.start() }
                    }
                }
                .buttonStyle(.bordered)

                Toggle("暂停引擎", isOn: $state.isPaused)
                    .toggleStyle(.switch)
            }
        }
        .frame(maxWidth: 500)
    }

    private var engineStatusColor: Color {
        switch EngineProcess.shared.status {
        case .running: .green
        case .starting: .orange
        case .failed: .red
        default: .secondary
        }
    }

    private var engineStatusText: String {
        switch EngineProcess.shared.status {
        case .running: "运行中"
        case .starting: "启动中..."
        case .failed: "错误"
        default: "已停止"
        }
    }
}

struct AboutSettingsContent: View {
    var body: some View {
        SettingsSectionHeader("关于")

        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 32))
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading) {
                    Text("Klaus")
                        .font(.headline)
                    Text("AI Assistant for macOS")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            LabeledContent("版本") {
                Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev")
            }
            LabeledContent("Build") {
                Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "-")
            }
        }
        .frame(maxWidth: 400)
    }
}

// MARK: - QR Scan View (WeChat / WhatsApp)

struct QRScanView: View {
    let channel: ChannelType
    @State private var qrManager = ChannelQRManager.shared

    var body: some View {
        VStack(spacing: 16) {
            if let qrImage = qrManager.qrImage {
                Image(nsImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 220, height: 220)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
            } else if qrManager.isScanning {
                VStack(spacing: 12) {
                    ProgressView()
                        .controlSize(.large)
                    Text(qrManager.statusText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(width: 220, height: 220)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "qrcode")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text(channel == .wechat ? "点击下方按钮获取微信二维码" : "点击下方按钮获取 WhatsApp 二维码")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(width: 220, height: 220)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.secondary.opacity(0.04)))
            }

            // Status text
            if !qrManager.statusText.isEmpty && qrManager.qrImage != nil {
                HStack(spacing: 6) {
                    if qrManager.isConnected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                    Text(qrManager.statusText)
                        .font(.subheadline)
                        .foregroundStyle(qrManager.isConnected ? .green : .secondary)
                }
            }

            // Action button
            if !qrManager.isScanning && !qrManager.isConnected {
                Button {
                    startScan()
                } label: {
                    Label(
                        channel == .wechat ? "获取微信二维码" : "获取 WhatsApp 二维码",
                        systemImage: "qrcode.viewfinder"
                    )
                }
                .buttonStyle(.borderedProminent)
            }

            if qrManager.isScanning && !qrManager.isConnected {
                Button("取消") {
                    qrManager.reset()
                }
                .buttonStyle(.bordered)
            }

            if qrManager.isConnected {
                Button("重新扫码") {
                    qrManager.reset()
                    startScan()
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .onDisappear {
            qrManager.reset()
        }
    }

    private func startScan() {
        if channel == .wechat {
            qrManager.startWeChatQR()
        } else {
            qrManager.startWhatsAppQR()
        }
    }
}
