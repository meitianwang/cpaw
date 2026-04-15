import AppKit
import CoreImage
import Foundation
import OSLog

/// Manages QR code scanning flows for WeChat and WhatsApp channels.
/// WeChat: Direct HTTP calls to Tencent iLink API.
/// WhatsApp: Starts Bun subprocess running Baileys to get QR string.
@MainActor
@Observable
final class ChannelQRManager {
    static let shared = ChannelQRManager()

    private let logger = Logger(subsystem: "ai.klaus", category: "channel-qr")

    // MARK: - State

    var qrImage: NSImage?
    var statusText = ""
    var isScanning = false
    var isConnected = false

    private var pollTimer: Timer?
    private var whatsAppProcess: Process?

    // MARK: - WeChat QR Flow

    /// Step 1: Fetch QR code from Tencent iLink API
    func startWeChatQR() {
        isScanning = true
        isConnected = false
        statusText = "正在获取二维码..."
        qrImage = nil

        Task {
            do {
                let qrData = try await fetchWeChatQRCode()
                // qrData.qrcodeUrl is a string like "https://weixin.qq.com/x/..."
                // Generate QR image from the URL string
                qrImage = generateQRImage(from: qrData.qrcodeUrl)
                statusText = "请使用微信扫描二维码"

                // Start polling
                startWeChatPolling(qrcode: qrData.qrcode)
            } catch {
                statusText = "获取二维码失败: \(error.localizedDescription)"
                isScanning = false
                logger.error("WeChat QR fetch failed: \(error)")
            }
        }
    }

    private func fetchWeChatQRCode() async throws -> (qrcode: String, qrcodeUrl: String) {
        let url = URL(string: "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        guard let qrcode = json["qrcode"] as? String,
              let qrcodeUrl = json["qrcode_img_content"] as? String else {
            throw NSError(domain: "ChannelQR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid QR response"])
        }
        return (qrcode, qrcodeUrl)
    }

    private func startWeChatPolling(qrcode: String) {
        stopPolling()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.pollWeChatStatus(qrcode: qrcode)
            }
        }
    }

    private func pollWeChatStatus(qrcode: String) async {
        let urlString = "https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode=\(qrcode.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? qrcode)"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.setValue("1", forHTTPHeaderField: "iLink-App-ClientVersion")
        request.timeoutInterval = 35

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            let status = json["status"] as? String ?? "wait"

            switch status {
            case "scaned":
                statusText = "已扫描，请在手机上确认"
            case "confirmed":
                statusText = "连接成功！"
                isConnected = true
                isScanning = false
                stopPolling()

                // Save credentials to settings.db
                let token = json["bot_token"] as? String ?? ""
                let accountId = json["ilink_bot_id"] as? String ?? ""
                let baseUrl = json["baseurl"] as? String ?? "https://ilinkai.weixin.qq.com"

                let db = SettingsDB.shared
                db.setSetting("channel.wechat.token", token)
                db.setSetting("channel.wechat.account_id", accountId)
                db.setSetting("channel.wechat.base_url", baseUrl)
                db.setSetting("channel.wechat.enabled", "1")

                logger.info("WeChat connected: accountId=\(accountId)")
            case "expired":
                statusText = "二维码已过期，请重新获取"
                isScanning = false
                stopPolling()
            default:
                break // "wait" — continue polling
            }
        } catch {
            // Timeout is normal for long-polling, ignore
            if (error as? URLError)?.code != .timedOut {
                logger.error("WeChat poll error: \(error)")
            }
        }
    }

    // MARK: - WhatsApp QR Flow

    /// Step 1: Start Baileys subprocess to get QR code
    func startWhatsAppQR() {
        isScanning = true
        isConnected = false
        statusText = "正在启动 WhatsApp 连接..."
        qrImage = nil

        Task {
            do {
                try await runWhatsAppConnector()
            } catch {
                statusText = "WhatsApp 连接失败: \(error.localizedDescription)"
                isScanning = false
                logger.error("WhatsApp QR failed: \(error)")
            }
        }
    }

    private func runWhatsAppConnector() async throws {
        // Write a minimal JS script that starts Baileys, outputs QR, and reports status
        let scriptDir = "\(KlausPaths.configDir)/tmp"
        try FileManager.default.createDirectory(atPath: scriptDir, withIntermediateDirectories: true)
        let scriptPath = "\(scriptDir)/whatsapp-qr.mjs"

        let authDir = "\(KlausPaths.configDir)/whatsapp"

        let script = """
        import baileys from '@whiskeysockets/baileys';
        import { mkdirSync } from 'fs';
        const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;
        const authDir = \(escapeJSString(authDir));
        mkdirSync(authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ['Klaus', 'Desktop', '1.0.0'] });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', (u) => {
          if (u.qr) { console.log(JSON.stringify({ type: 'qr', data: u.qr })); }
          if (u.connection === 'open') { console.log(JSON.stringify({ type: 'connected' })); }
          if (u.connection === 'close') {
            const code = u.lastDisconnect?.error?.output?.statusCode;
            console.log(JSON.stringify({ type: 'disconnected', code }));
            if (code === DisconnectReason.loggedOut) process.exit(1);
          }
        });
        """

        try script.write(toFile: scriptPath, atomically: true, encoding: .utf8)

        // Find bun executable
        let bunPath = EngineEnvironment.shared.status.bunPath ?? "/usr/local/bin/bun"

        let process = Process()
        process.executableURL = URL(fileURLWithPath: bunPath)
        process.arguments = ["run", scriptPath]
        process.currentDirectoryURL = URL(fileURLWithPath: KlausPaths.configDir)

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        // Pass through node_modules path
        var env = ProcessInfo.processInfo.environment
        env["NODE_PATH"] = "\(KlausPaths.configDir)/node_modules"
        process.environment = env

        self.whatsAppProcess = process

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }

            for jsonLine in line.components(separatedBy: "\n") where !jsonLine.isEmpty {
                guard let lineData = jsonLine.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                      let type = json["type"] as? String else { continue }

                // Extract values before crossing isolation boundary
                let qrString = json["data"] as? String
                let disconnectCode = json["code"] as? Int

                Task { @MainActor [weak self] in
                    switch type {
                    case "qr":
                        if let qrString {
                            self?.qrImage = self?.generateQRImage(from: qrString)
                            self?.statusText = "请使用 WhatsApp 扫描二维码"
                        }
                    case "connected":
                        self?.statusText = "WhatsApp 连接成功！"
                        self?.isConnected = true
                        self?.isScanning = false
                        SettingsDB.shared.setSetting("channel.whatsapp.enabled", "1")
                        self?.logger.info("WhatsApp connected")
                    case "disconnected":
                        self?.statusText = "WhatsApp 已断开 (code: \(disconnectCode ?? 0))"
                        self?.isScanning = false
                    default:
                        break
                    }
                }
            }
        }

        try process.run()
    }

    // MARK: - QR Image Generation

    /// Generate a QR code NSImage from a string (URL or raw QR data)
    func generateQRImage(from string: String) -> NSImage? {
        guard let data = string.data(using: .utf8) else { return nil }
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")

        guard let ciImage = filter.outputImage else { return nil }

        // Scale up for clarity
        let scale = CGAffineTransform(scaleX: 8, y: 8)
        let scaledImage = ciImage.transformed(by: scale)

        let rep = NSCIImageRep(ciImage: scaledImage)
        let nsImage = NSImage(size: rep.size)
        nsImage.addRepresentation(rep)
        return nsImage
    }

    // MARK: - Cleanup

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    func stopWhatsApp() {
        whatsAppProcess?.terminate()
        whatsAppProcess = nil
    }

    func reset() {
        stopPolling()
        stopWhatsApp()
        qrImage = nil
        statusText = ""
        isScanning = false
        isConnected = false
    }

    // MARK: - Helpers

    private func escapeJSString(_ s: String) -> String {
        let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        return "'\(escaped)'"
    }
}
