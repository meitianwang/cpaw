import SwiftUI
import PhotosUI

/// Settings view using native iOS grouped list style.
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showLogoutConfirm = false
    @State private var showEditName = false
    @State private var editingName = ""
    @State private var errorMessage: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var isUploadingAvatar = false

    var body: some View {
        NavigationStack {
            List {
                if let user = appState.currentUser {
                    // Account section
                    Section {
                        HStack(spacing: 14) {
                            // Avatar — tap to change photo
                            PhotosPicker(selection: $selectedPhoto, matching: .images) {
                                ZStack(alignment: .bottomTrailing) {
                                    UserAvatarView(
                                        name: user.displayName,
                                        size: 48,
                                        avatarUrl: user.avatarUrl
                                    )
                                    .overlay {
                                        if isUploadingAvatar {
                                            Circle()
                                                .fill(.ultraThinMaterial)
                                            ProgressView()
                                        }
                                    }

                                    Image(systemName: "camera.fill")
                                        .font(.system(size: 10))
                                        .foregroundStyle(.white)
                                        .padding(4)
                                        .background(Color.accentColor, in: Circle())
                                        .offset(x: 2, y: 2)
                                }
                            }
                            .disabled(isUploadingAvatar)

                            // Name — tap to edit
                            Button {
                                editingName = user.displayName
                                showEditName = true
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(user.displayName)
                                        .font(.system(.body, weight: .semibold))
                                        .foregroundStyle(.primary)
                                    Text(user.email)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }

                    // Info section
                    Section {
                        HStack {
                            Label(L10n.version, systemImage: "info.circle")
                            Spacer()
                            Text("1.0.0")
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Logout section
                    Section {
                        Button(role: .destructive) {
                            showLogoutConfirm = true
                        } label: {
                            Label(L10n.logOut, systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(L10n.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(L10n.done) { dismiss() }
                        .font(.system(.body, weight: .medium))
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
            .alert(L10n.editName, isPresented: $showEditName) {
                TextField(L10n.displayNamePlaceholder, text: $editingName)
                Button(L10n.dismiss, role: .cancel) {}
                Button(L10n.save) {
                    let name = editingName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    Task {
                        do {
                            try await appState.updateDisplayName(name)
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                }
            }
            .alert(L10n.dismiss, isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                if let msg = errorMessage {
                    Text(msg)
                }
            }
            .onChange(of: selectedPhoto) { newItem in
                guard let newItem else { return }
                Task {
                    await uploadAvatar(item: newItem)
                    selectedPhoto = nil
                }
            }
        }
    }

    private func uploadAvatar(item: PhotosPickerItem) async {
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }

        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }

            guard let uiImage = UIImage(data: data) else { return }

            // Resize to max 512x512, then compress to JPEG
            let maxDim: CGFloat = 512
            let scale = min(maxDim / uiImage.size.width, maxDim / uiImage.size.height, 1.0)
            let newSize = CGSize(width: uiImage.size.width * scale, height: uiImage.size.height * scale)
            let renderer = UIGraphicsImageRenderer(size: newSize)
            let resized = renderer.image { _ in uiImage.draw(in: CGRect(origin: .zero, size: newSize)) }

            guard let imageData = resized.jpegData(compressionQuality: 0.8) else { return }
            let contentType = "image/jpeg"

            try await appState.uploadAvatar(data: imageData, contentType: contentType)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
