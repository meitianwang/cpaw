import SwiftUI

/// Settings view: server URL, user info, logout (Chinese localized).
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showLogoutConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                // User info
                if let user = appState.currentUser {
                    Section(L10n.account) {
                        LabeledContent(L10n.nameLabel, value: user.displayName)
                        LabeledContent(L10n.emailLabel, value: user.email)
                        LabeledContent(L10n.roleLabel, value: user.role == "admin" ? "管理员" : "用户")
                    }
                }

                // Connection
                Section {
                    HStack {
                        Circle()
                            .fill(connectionColor)
                            .frame(width: 8, height: 8)
                        Text(connectionLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Actions
                Section {
                    Button(L10n.logOut, role: .destructive) {
                        showLogoutConfirm = true
                    }
                }

                // About
                Section(L10n.about) {
                    LabeledContent(L10n.version, value: "1.0.0")
                    LabeledContent(L10n.platform, value: "iOS")
                }
            }
            .navigationTitle(L10n.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(L10n.done) { dismiss() }
                }
            }
            .confirmationDialog(L10n.logOutConfirm, isPresented: $showLogoutConfirm) {
                Button(L10n.logOut, role: .destructive) {
                    Task {
                        await appState.logout()
                        dismiss()
                    }
                }
            }
        }
    }

    private var connectionColor: Color {
        switch appState.webSocket.state {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return .red
        }
    }

    private var connectionLabel: String {
        switch appState.webSocket.state {
        case .connected: return L10n.connected
        case .connecting: return L10n.connecting
        case .disconnected: return L10n.disconnected
        }
    }
}
