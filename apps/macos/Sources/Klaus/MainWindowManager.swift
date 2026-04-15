import AppKit
import SwiftUI

/// Manages the main application window (three-column layout).
/// Separate from the floating chat panel which remains for quick interactions.
@MainActor
final class MainWindowManager {
    static let shared = MainWindowManager()

    func show() {
        // Use SwiftUI's openWindow environment action via NSApp
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "main" }) {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } else {
            // Fallback: activate the app which should show the default window
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
