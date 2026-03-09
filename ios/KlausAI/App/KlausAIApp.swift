import SwiftUI

@main
struct KlausAIApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isCheckingAuth {
                    ProgressView("Connecting...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if appState.isAuthenticated {
                    MainView()
                        .environmentObject(appState)
                } else {
                    AuthView()
                        .environmentObject(appState)
                }
            }
            .task {
                await appState.checkSession()
            }
        }
    }
}
