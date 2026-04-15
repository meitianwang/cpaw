import SwiftUI

// MARK: - Main Window (Three-Column Layout)

struct MainWindowView: View {
    @State private var viewModel = ChatViewModel()
    @State private var showSettings = false
    @State private var settingsTab: MainSettingsView.SettingsTab = .profile
    @State private var showMonitorPanel = true
    @State private var selectedNavItem: NavItem = .tasks

    enum NavItem: String, CaseIterable {
        case tasks
        case channels
    }

    func openSettings(tab: MainSettingsView.SettingsTab) {
        settingsTab = tab
        showSettings = true
    }

    var body: some View {
        if showSettings {
            MainSettingsView(isPresented: $showSettings, initialTab: settingsTab)
                .transition(.move(edge: .trailing))
        } else {
            HSplitView {
                // Left sidebar
                LeftSidebarView(
                    viewModel: viewModel,
                    selectedNavItem: $selectedNavItem,
                    showSettings: $showSettings,
                    openSettings: openSettings
                )
                .frame(minWidth: 200, idealWidth: 240, maxWidth: 320)

                // Center chat
                CenterChatView(viewModel: viewModel)
                    .frame(minWidth: 400)

                // Right monitor panel
                if showMonitorPanel {
                    RightMonitorPanel(viewModel: viewModel)
                        .frame(minWidth: 180, idealWidth: 200, maxWidth: 260)
                }
            }
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showMonitorPanel.toggle()
                        }
                    } label: {
                        Image(systemName: "sidebar.right")
                    }
                    .help("Toggle monitor panel")
                }
            }
            .onAppear {
                viewModel.attach()
            }
        }
    }
}

// MARK: - Left Sidebar

struct LeftSidebarView: View {
    @Bindable var viewModel: ChatViewModel
    @Binding var selectedNavItem: MainWindowView.NavItem
    @Binding var showSettings: Bool
    var openSettings: (MainSettingsView.SettingsTab) -> Void
    @State private var searchText = ""

    private var filteredSessions: [ChatSession] {
        if searchText.isEmpty {
            return viewModel.sessions
        }
        let query = searchText.lowercased()
        return viewModel.sessions.filter { session in
            session.title.lowercased().contains(query) ||
            session.messages.contains(where: { $0.displayText.lowercased().contains(query) })
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // New task button
            Button {
                viewModel.newSession()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                        .font(.caption.weight(.bold))
                    Text("新任务")
                        .font(.subheadline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color.accentColor)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 8)

            // Quick access buttons
            HStack(spacing: 6) {
                QuickAccessButton(icon: "bolt.fill", label: "技能") {
                    openSettings(.skills)
                }
                QuickAccessButton(icon: "clock.arrow.circlepath", label: "定时任务") {
                    openSettings(.cron)
                }
                QuickAccessButton(icon: "bubble.left.and.bubble.right.fill", label: "频道") {
                    openSettings(.channels)
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)

            // Tab bar
            HStack(spacing: 0) {
                TabBarButton(title: "任务", isActive: selectedNavItem == .tasks) {
                    selectedNavItem = .tasks
                }
                TabBarButton(title: "频道", isActive: selectedNavItem == .channels) {
                    selectedNavItem = .channels
                }
            }
            .padding(.horizontal, 12)

            Divider()

            // Search
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.tertiary)
                    .font(.caption)
                TextField("搜索", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.caption)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.tertiary)
                            .font(.caption2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.secondary.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)

            // Session list
            if filteredSessions.isEmpty {
                ContentUnavailableView {
                    Label("暂无对话", systemImage: "bubble.left.and.bubble.right")
                } description: {
                    Text("点击「新任务」开始")
                }
                .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(groupedSessions, id: \.key) { group in
                            Text(group.key)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.tertiary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                                .padding(.top, 8)
                                .padding(.bottom, 2)

                            ForEach(group.sessions) { session in
                                SessionRow(
                                    session: session,
                                    isActive: session.id == viewModel.activeSessionId
                                ) {
                                    viewModel.switchSession(session.id)
                                }
                                .contextMenu {
                                    Button("删除", role: .destructive) {
                                        viewModel.deleteSession(session.id)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 6)
                }
            }

            Divider()

            // User footer
            HStack(spacing: 8) {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text("M")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white)
                    )

                VStack(alignment: .leading, spacing: 1) {
                    Text("meitianwang")
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                    Text(engineStatusText)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var engineStatusText: String {
        switch EngineProcess.shared.status {
        case .running: return viewModel.currentModel ?? "Ready"
        case .starting: return "Starting..."
        case .failed: return "Engine Error"
        default: return "Stopped"
        }
    }

    // Group sessions by relative date
    private var groupedSessions: [(key: String, sessions: [ChatSession])] {
        let calendar = Calendar.current
        let now = Date()
        var groups: [String: [ChatSession]] = [:]
        let order = ["今天", "昨天", "本周", "更早"]

        for session in filteredSessions {
            let key: String
            if calendar.isDateInToday(session.createdAt) {
                key = "今天"
            } else if calendar.isDateInYesterday(session.createdAt) {
                key = "昨天"
            } else if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now),
                      session.createdAt > weekAgo {
                key = "本周"
            } else {
                key = "更早"
            }
            groups[key, default: []].append(session)
        }

        return order.compactMap { key in
            guard let sessions = groups[key], !sessions.isEmpty else { return nil }
            return (key: key, sessions: sessions)
        }
    }
}

// MARK: - Quick Access Button

struct QuickAccessButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(label)
                    .font(.system(size: 9))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Color.secondary.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Tab Bar Button

struct TabBarButton: View {
    let title: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(title)
                    .font(.caption.weight(isActive ? .semibold : .regular))
                    .foregroundStyle(isActive ? Color.accentColor : .secondary)
                Rectangle()
                    .fill(isActive ? Color.accentColor : .clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Session Row

struct SessionRow: View {
    let session: ChatSession
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .font(.subheadline)
                    .lineLimit(1)
                    .foregroundStyle(isActive ? Color.accentColor : .primary)
                Text(session.createdAt, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isActive ? Color.accentColor.opacity(0.08) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(isActive ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Center Chat View

struct CenterChatView: View {
    @Bindable var viewModel: ChatViewModel
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Toolbar
            HStack(spacing: 8) {
                Text(viewModel.activeSession?.title ?? "新任务")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Spacer()

                if let model = viewModel.currentModel {
                    Text(model)
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.secondary.opacity(0.08))
                        .clipShape(Capsule())
                }

                Circle()
                    .fill(engineStatusColor)
                    .frame(width: 8, height: 8)
            }
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(Color(nsColor: .windowBackgroundColor).opacity(0.5))

            Divider()

            // Messages
            if viewModel.messages.isEmpty && !viewModel.isProcessing {
                MainWelcomeView()
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            ForEach(viewModel.messages) { message in
                                MessageView(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding(20)
                    }
                    .onChange(of: viewModel.messages.count) { _, _ in
                        scrollToBottom(proxy)
                    }
                    .onChange(of: viewModel.messages.last?.displayText) { _, _ in
                        scrollToBottom(proxy)
                    }
                }
            }

            Divider()

            // Enhanced input bar
            MainInputBar(viewModel: viewModel, isInputFocused: $isInputFocused)
        }
        .onAppear { isInputFocused = true }
        .onDrop(of: [.fileURL, .image], isTargeted: nil) { providers in
            handleDrop(providers, viewModel: viewModel)
            return true
        }
    }

    private var engineStatusColor: Color {
        switch EngineProcess.shared.status {
        case .running: .green
        case .starting: .orange
        case .failed: .red
        default: .secondary
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        if let last = viewModel.messages.last {
            withAnimation(.easeOut(duration: 0.15)) {
                proxy.scrollTo(last.id, anchor: .bottom)
            }
        }
    }
}

// MARK: - Main Welcome View

struct MainWelcomeView: View {
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "brain.head.profile")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("你好，有什么我能帮你的？")
                .font(.title2.weight(.semibold))
            Text("描述你的任务，我来帮你完成")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Enhanced Input Bar

struct MainInputBar: View {
    @Bindable var viewModel: ChatViewModel
    var isInputFocused: FocusState<Bool>.Binding
    @State private var attachedFiles: [AttachedFile] = []

    var body: some View {
        VStack(spacing: 0) {
            // Attached files
            if !attachedFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachedFiles) { file in
                            AttachedFileChip(file: file) {
                                attachedFiles.removeAll(where: { $0.id == file.id })
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
            }

            VStack(spacing: 8) {
                // Text input
                TextField("描述任务，/ 调用技能与工具", text: $viewModel.inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .focused(isInputFocused)
                    .onSubmit {
                        if !NSEvent.modifierFlags.contains(.shift) {
                            sendIfReady()
                        }
                    }

                // Bottom toolbar
                HStack(spacing: 8) {
                    // Working directory
                    Button {
                        pickWorkingDirectory()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "folder")
                                .font(.caption2)
                            Text(workingDirLabel)
                                .font(.caption2)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 5))
                    }
                    .buttonStyle(.plain)

                    // Attach
                    Button {
                        pickFiles()
                    } label: {
                        Image(systemName: "paperclip")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    // Model indicator
                    if let model = viewModel.currentModel {
                        Text(model)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.secondary.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                    }

                    // Send / Stop
                    Button {
                        if viewModel.isProcessing {
                            viewModel.interrupt()
                        } else {
                            sendIfReady()
                        }
                    } label: {
                        Image(systemName: viewModel.isProcessing ? "stop.circle.fill" : "arrow.up.circle.fill")
                            .font(.title3)
                            .foregroundStyle(
                                viewModel.isProcessing ? Color.red :
                                (hasContent ? Color.accentColor : Color.secondary)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(!hasContent && !viewModel.isProcessing)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.secondary.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
    }

    private var hasContent: Bool {
        !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachedFiles.isEmpty
    }

    private var workingDirLabel: String {
        let dir = AppState.shared.workingDirectory
        if dir.isEmpty {
            return "选择工作目录"
        }
        return URL(fileURLWithPath: dir).lastPathComponent
    }

    private func sendIfReady() {
        guard hasContent else { return }

        if !attachedFiles.isEmpty {
            var blocks: [APIContentBlock] = []
            for file in attachedFiles {
                if file.isImage, let data = try? Data(contentsOf: file.url) {
                    let base64 = data.base64EncodedString()
                    blocks.append(.image(mediaType: file.mimeType, base64Data: base64))
                }
            }
            let text = viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                blocks.append(.text(text))
            }
            for file in attachedFiles where !file.isImage {
                blocks.append(.text("[Attached file: \(file.url.path)]"))
            }
            if !blocks.isEmpty {
                let userMessage = ChatMessage(
                    id: UUID().uuidString,
                    role: .user,
                    content: [ChatMessageContent(
                        type: .text,
                        text: text.isEmpty ? "See attached files" : text,
                        thinking: nil, toolName: nil, arguments: nil
                    )],
                    timestamp: Date()
                )
                viewModel.messages.append(userMessage)
                viewModel.inputText = ""
                viewModel.isProcessing = true
                viewModel.messages.append(ChatMessage(
                    id: UUID().uuidString, role: .assistant, content: [],
                    timestamp: Date(), isStreaming: true
                ))
                EngineProcess.shared.sendUserMessage(blocks: blocks)
            }
            attachedFiles.removeAll()
        } else {
            viewModel.send()
        }
    }

    private func pickFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.image, .pdf, .plainText, .sourceCode, .json, .xml, .data]
        if panel.runModal() == .OK {
            for url in panel.urls {
                attachedFiles.append(AttachedFile(url: url))
            }
        }
    }

    private func pickWorkingDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "选择"
        if panel.runModal() == .OK, let url = panel.url {
            AppState.shared.workingDirectory = url.path
        }
    }
}

// MARK: - Right Monitor Panel

struct RightMonitorPanel: View {
    @Bindable var viewModel: ChatViewModel
    @State private var gitStatus: SettingsDB.GitStatus?
    @State private var skills: [SettingsDB.SkillInfo] = []
    @State private var mcpServers: [SettingsDB.MCPServer] = []

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("任务监控")
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(spacing: 0) {
                    // Todo section
                    MonitorSection(title: "待办", icon: "checklist") {
                        if viewModel.isProcessing {
                            HStack(spacing: 6) {
                                ProgressView()
                                    .controlSize(.mini)
                                Text("处理中...")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            let toolCalls = viewModel.messages.last?.toolCalls ?? []
                            if !toolCalls.isEmpty {
                                ForEach(toolCalls.prefix(3)) { tool in
                                    HStack(spacing: 4) {
                                        Image(systemName: tool.result != nil ? "checkmark.circle.fill" : "circle")
                                            .font(.caption2)
                                            .foregroundStyle(tool.result != nil ? .green : .secondary)
                                        Text(tool.toolName ?? "Tool")
                                            .font(.caption)
                                            .lineLimit(1)
                                    }
                                }
                            } else {
                                Text("暂无待办")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }

                    // Artifacts / working dir section
                    MonitorSection(title: "产物", icon: "doc.on.doc") {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("工作目录")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                            Text(workingDirDisplay)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Color.secondary.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }

                    // Skills & MCP section
                    MonitorSection(title: "技能与 MCP", icon: "sparkles") {
                        if skills.isEmpty && mcpServers.isEmpty {
                            Text("没有技能或 MCP")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        } else {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(skills.prefix(5)) { skill in
                                    HStack(spacing: 4) {
                                        Image(systemName: "sparkle")
                                            .font(.system(size: 8))
                                            .foregroundStyle(.orange)
                                        Text(skill.name)
                                            .font(.caption)
                                            .lineLimit(1)
                                    }
                                }
                                ForEach(mcpServers.prefix(3)) { server in
                                    HStack(spacing: 4) {
                                        Image(systemName: "server.rack")
                                            .font(.system(size: 8))
                                            .foregroundStyle(.blue)
                                        Text(server.name)
                                            .font(.caption)
                                            .lineLimit(1)
                                    }
                                }
                            }
                        }
                    }

                    // Git status section
                    MonitorSection(title: "Git 状态", icon: "arrow.triangle.branch") {
                        if let git = gitStatus {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 4) {
                                    Circle()
                                        .fill(git.isClean ? Color.green : Color.orange)
                                        .frame(width: 6, height: 6)
                                    Text(git.branch)
                                        .font(.caption)
                                }
                                if !git.isClean {
                                    Text("\(git.changedFiles) files changed")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(8)
                            .background(Color.secondary.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        } else {
                            Text("不在 Git 仓库中")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task {
            await loadData()
        }
    }

    private var workingDirDisplay: String {
        let dir = AppState.shared.workingDirectory
        if dir.isEmpty { return "未设置" }
        return dir.replacingOccurrences(of: NSHomeDirectory(), with: "~")
    }

    private func loadData() async {
        let cwd = AppState.shared.workingDirectory
        let db = SettingsDB.shared
        skills = db.listSkills()
        mcpServers = db.listMCPServers()
        if !cwd.isEmpty {
            gitStatus = db.gitStatus(cwd: cwd)
        }
    }
}

// MARK: - Monitor Section

struct MonitorSection<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    init(title: String, icon: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.icon = icon
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}

// MARK: - Drop handler helper

func handleDrop(_ providers: [NSItemProvider], viewModel: ChatViewModel) {
    for provider in providers {
        if provider.hasItemConformingToTypeIdentifier("public.file-url") {
            provider.loadItem(forTypeIdentifier: "public.file-url", options: nil) { item, _ in
                guard let data = item as? Data,
                      let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                Task { @MainActor in
                    viewModel.inputText = "I'm sharing this file: \(url.path)"
                }
            }
        } else if provider.canLoadObject(ofClass: NSImage.self) {
            provider.loadObject(ofClass: NSImage.self) { image, _ in
                guard let nsImage = image as? NSImage,
                      let tiffData = nsImage.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data: tiffData),
                      let pngData = bitmap.representation(using: .png, properties: [:]) else { return }
                Task { @MainActor in
                    let base64 = pngData.base64EncodedString()
                    let blocks: [APIContentBlock] = [
                        .image(mediaType: "image/png", base64Data: base64),
                        .text("What's in this image?")
                    ]
                    EngineProcess.shared.sendUserMessage(blocks: blocks)
                }
            }
        }
    }
}
