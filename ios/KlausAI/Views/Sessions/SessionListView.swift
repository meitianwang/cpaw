import SwiftUI

/// Sidebar view listing all chat sessions (Chinese localized).
struct SessionListView: View {
    @ObservedObject var sessionVM: SessionListViewModel
    @ObservedObject var chatVM: ChatViewModel
    @Binding var selectedSessionId: String?
    @EnvironmentObject private var appState: AppState

    var body: some View {
        List(selection: $selectedSessionId) {
            // New chat button
            Button {
                chatVM.newSession()
                selectedSessionId = chatVM.currentSessionId
            } label: {
                Label(L10n.newChat, systemImage: "plus.bubble")
            }

            // Session list
            Section(L10n.conversations) {
                if sessionVM.sessions.isEmpty && !sessionVM.isLoading {
                    EmptyStateView(
                        title: L10n.noConversations,
                        systemImage: "bubble.left.and.bubble.right",
                        description: L10n.startNewChat
                    )
                }

                ForEach(sessionVM.sessions) { session in
                    SessionRow(session: session, isActive: session.sessionId == chatVM.currentSessionId)
                        .tag(session.sessionId)
                }
                .onDelete { indexSet in
                    Task {
                        for index in indexSet {
                            let session = sessionVM.sessions[index]
                            await sessionVM.deleteSession(session.sessionId)
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .onChange(of: selectedSessionId) { newValue in
            guard let sessionId = newValue else { return }
            let title = sessionVM.sessions.first(where: { $0.sessionId == sessionId })?.title
            Task {
                await chatVM.switchSession(sessionId, title: title)
            }
            HapticManager.selection()
        }
        .refreshable {
            await sessionVM.loadSessions()
        }
        .task {
            await sessionVM.loadSessions()
        }
        .overlay {
            if sessionVM.isLoading && sessionVM.sessions.isEmpty {
                ProgressView()
            }
        }
    }
}
