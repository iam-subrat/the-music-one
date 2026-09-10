import UIKit
import WebKit
import AuthenticationServices
import CommonCrypto
import Capacitor
import os.log
import AVFoundation

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let _ = (scene as? UIWindowScene) else { return }

        window?.makeKeyAndVisible()

        DispatchQueue.main.async { [weak self] in
            if let rootVC = self?.window?.rootViewController {
                self?.attachManagers(to: rootVC)
            }
        }

        if let urlContext = connectionOptions.urlContexts.first {
            handleOpenURL(urlContext.url)
        }
    }

    private func attachManagers(to root: UIViewController) {
        if let bridgeVC = root as? CAPBridgeViewController {
            AuthManager.shared.attach(to: bridgeVC)
            BackgroundAudioManager.shared.attach(to: bridgeVC)
            return
        }
        for child in root.children {
            attachManagers(to: child)
        }
    }

    private func handleOpenURL(_ url: URL) {
        if url.scheme == "musicone" {
            AuthManager.shared.handleAuthCallback(url)
            return
        }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func sceneDidDisconnect(_ scene: UIScene) {}

    func sceneDidBecomeActive(_ scene: UIScene) {
        if let rootVC = window?.rootViewController {
            attachManagers(to: rootVC)
        }
    }

    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {
        BackgroundAudioManager.shared.handleEnterForeground()
    }
    func sceneDidEnterBackground(_ scene: UIScene) {
        BackgroundAudioManager.shared.handleEnterBackground()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url {
            handleOpenURL(url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}

// MARK: - Auth Manager & Navigation Proxy

final class AuthManager {
    static let shared = AuthManager()
    private var proxy: AuthNavigationDelegateProxy?

    func attach(to bridgeVC: CAPBridgeViewController) {
        _ = bridgeVC.view
        guard let webView = bridgeVC.webView else {
            NSLog("[AuthManager] ⚠️ bridgeVC.webView is nil")
            return
        }

        if webView.navigationDelegate is AuthNavigationDelegateProxy {
            return
        }

        let proxy = AuthNavigationDelegateProxy(original: webView.navigationDelegate, webView: webView)
        self.proxy = proxy
        webView.navigationDelegate = proxy
        NSLog("[AuthManager] ✅ Successfully attached AuthNavigationDelegateProxy to WKWebView")
    }

    func handleAuthCallback(_ url: URL) {
        proxy?.handleCallback(url)
    }
}

final class AuthNavigationDelegateProxy: NSObject, WKNavigationDelegate, ASWebAuthenticationPresentationContextProviding {
    weak var originalDelegate: WKNavigationDelegate?
    weak var webView: WKWebView?
    private var authSession: ASWebAuthenticationSession?
    private var pendingVerifier: String?

    init(original: WKNavigationDelegate?, webView: WKWebView) {
        self.originalDelegate = original
        self.webView = webView
        super.init()
    }

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) {
            return true
        }
        return originalDelegate?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let original = originalDelegate, original.responds(to: aSelector) {
            return original
        }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            forwardDecidePolicy(for: webView, navigationAction: navigationAction, decisionHandler: decisionHandler)
            return
        }

        if isOAuthTrigger(url: url) {
            NSLog("[AuthManager] 🎯 Intercepted OAuth navigation to: %@", url.absoluteString)
            decisionHandler(.cancel)
            startGoogleSignIn()
            return
        }

        forwardDecidePolicy(for: webView, navigationAction: navigationAction, decisionHandler: decisionHandler)
    }

    private func forwardDecidePolicy(for webView: WKWebView, navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let original = originalDelegate {
            original.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    private func isOAuthTrigger(url: URL) -> Bool {
        let path = url.path.lowercased()
        let host = url.host?.lowercased() ?? ""

        if path.contains("/api/auth/google") || path.hasSuffix("/auth/google") {
            return true
        }
        if host == "accounts.google.com" || (host.hasSuffix(".google.com") && path.contains("oauth")) {
            return true
        }
        if host.contains("supabase.co") && path.contains("/auth/v1/authorize") {
            return true
        }
        return false
    }

    // MARK: - OAuth Flow via ASWebAuthenticationSession

    private func generatePKCEPair() -> (verifier: String, challenge: String)? {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { return nil }

        let verifier = Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))

        guard let verifierData = verifier.data(using: .utf8) else { return nil }
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        verifierData.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(verifierData.count), &hash)
        }

        let challenge = Data(hash)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))

        return (verifier, challenge)
    }

    func startGoogleSignIn() {
        guard let pkce = generatePKCEPair() else {
            NSLog("[AuthManager] ❌ Failed to generate PKCE")
            return
        }
        self.pendingVerifier = pkce.verifier

        let redirectURI = "musicone://auth-callback"
        let encodedRedirect = redirectURI.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? redirectURI
        let authURLString = "https://api.themusic.one/musicone/api/auth/mobile/authorize?code_challenge=\(pkce.challenge)&redirect_uri=\(encodedRedirect)"

        guard let authURL = URL(string: authURLString) else {
            NSLog("[AuthManager] ❌ Invalid auth URL: %@", authURLString)
            return
        }

        NSLog("[AuthManager] 🚀 Launching ASWebAuthenticationSession with URL: %@", authURLString)

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.authSession?.cancel()

            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "musicone"
            ) { [weak self] callbackURL, error in
                guard let self = self else { return }
                self.authSession = nil

                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        NSLog("[AuthManager] ℹ️ User canceled Google Sign-In sheet")
                    } else {
                        NSLog("[AuthManager] ❌ ASWebAuthenticationSession error: %@", error.localizedDescription)
                    }
                    return
                }

                guard let callbackURL = callbackURL else { return }
                self.handleCallback(callbackURL)
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            session.start()
        }
    }

    func handleCallback(_ callbackURL: URL) {
        NSLog("[AuthManager] 📥 Callback received: %@", callbackURL.absoluteString)
        guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else { return }
        guard let rawCode = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            NSLog("[AuthManager] ❌ No code in callback URL: %@", callbackURL.absoluteString)
            return
        }
        let code = rawCode.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard let verifier = self.pendingVerifier else {
            NSLog("[AuthManager] ❌ No pending verifier found")
            return
        }
        self.pendingVerifier = nil

        exchangeCode(code: code, verifier: verifier)
    }

    private func exchangeCode(code: String, verifier: String) {
        guard let exchangeURL = URL(string: "https://api.themusic.one/musicone/api/auth/mobile/exchange") else { return }
        var request = URLRequest(url: exchangeURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: String] = [
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": "musicone://auth-callback"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        NSLog("[AuthManager] 🔄 Sending exchange request to API...")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            if let error = error {
                NSLog("[AuthManager] ❌ Exchange error: %@", error.localizedDescription)
                return
            }
            guard let data = data else {
                NSLog("[AuthManager] ❌ Exchange returned no data")
                return
            }
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let accessToken = json["access_token"] as? String,
                   let refreshToken = json["refresh_token"] as? String {
                    NSLog("[AuthManager] ✅ Successfully exchanged code! Injecting cookies...")
                    self.injectCookiesAndReload(accessToken: accessToken, refreshToken: refreshToken)
                } else {
                    let str = String(data: data, encoding: .utf8) ?? ""
                    NSLog("[AuthManager] ❌ Exchange response error: %@", str)
                }
            } catch {
                NSLog("[AuthManager] ❌ Failed to decode exchange JSON: %@", error.localizedDescription)
            }
        }.resume()
    }

    private func injectCookiesAndReload(accessToken: String, refreshToken: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let webView = self.webView else { return }

            let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
            let domains = [".themusic.one", "themusic.one", "api.themusic.one"]
            let group = DispatchGroup()

            let accessExpiry = Date(timeIntervalSinceNow: 7 * 24 * 60 * 60)
            let refreshExpiry = Date(timeIntervalSinceNow: 30 * 24 * 60 * 60)

            for domain in domains {
                let accessProps: [HTTPCookiePropertyKey: Any] = [
                    .domain: domain,
                    .path: "/",
                    .name: "access_token",
                    .value: accessToken,
                    .secure: "TRUE",
                    .expires: accessExpiry
                ]
                let refreshProps: [HTTPCookiePropertyKey: Any] = [
                    .domain: domain,
                    .path: "/",
                    .name: "refresh_token",
                    .value: refreshToken,
                    .secure: "TRUE",
                    .expires: refreshExpiry
                ]

                if let ac = HTTPCookie(properties: accessProps) {
                    HTTPCookieStorage.shared.setCookie(ac)
                    group.enter()
                    cookieStore.setCookie(ac) { group.leave() }
                }
                if let rc = HTTPCookie(properties: refreshProps) {
                    HTTPCookieStorage.shared.setCookie(rc)
                    group.enter()
                    cookieStore.setCookie(rc) { group.leave() }
                }
            }

            group.notify(queue: .main) { [weak self] in
                NSLog("[AuthManager] 🍪 All cookies saved in WKHTTPCookieStore. Reloading WebView.")
                self?.webView?.reload()
            }
        }
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = self.webView?.window {
            return window
        }
        if let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) {
            return window
        }
        return ASPresentationAnchor()
    }
}

// MARK: - Background Audio Manager

final class BackgroundAudioManager {
    static let shared = BackgroundAudioManager()
    private weak var webView: WKWebView?
    private var didConfigure = false

    func attach(to bridgeVC: CAPBridgeViewController) {
        _ = bridgeVC.view
        guard let webView = bridgeVC.webView else {
            NSLog("[BackgroundAudioManager] ⚠️ bridgeVC.webView is nil")
            return
        }

        self.webView = webView

        // 1. Ensure inline playback and AirPlay capabilities on WKWebView
        webView.configuration.allowsInlineMediaPlayback = true
        webView.configuration.allowsAirPlayForMediaPlayback = true
        webView.configuration.allowsPictureInPictureMediaPlayback = true
        webView.configuration.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 14.5, *) {
            webView.configuration.preferences.isFraudulentWebsiteWarningEnabled = false
        }

        guard !didConfigure else { return }
        didConfigure = true
        NSLog("[BackgroundAudioManager] ✅ Configured WKWebView media capabilities")
    }

    func handleEnterBackground() {
        do {
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("[BackgroundAudioManager] Failed to re-activate AVAudioSession: \(error.localizedDescription)")
        }
    }

    func handleEnterForeground() {
        do {
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}
    }
}
