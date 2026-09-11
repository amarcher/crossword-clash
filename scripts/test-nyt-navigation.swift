import Foundation

// Run with the production policy, without requiring publisher credentials:
// swiftc ios/App/App/NytNavigationPolicy.swift scripts/test-nyt-navigation.swift \
//   -o artifacts/mobile/test-nyt-navigation && artifacts/mobile/test-nyt-navigation
@main
struct NytNavigationTests {
    static func main() {
        let policy = NytNavigationPolicy()
        let puzzle = URL(string: "https://www.nytimes.com/crosswords/game/daily/2026/09/10")!
        let login = URL(string: "https://myaccount.nytimes.com/auth/login?response_type=cookie")!
        func decision(_ request: URLRequest, from: URL? = nil, main: Bool = true, popup: Bool = false) -> NytNavigationPolicy.Decision {
            policy.decide(request, sourceURL: from, isMainFrame: main, opensWindow: popup)
        }

        let initial = URLRequest(url: puzzle)
        policy.prepareToLoad(initial)
        precondition(decision(initial) == .allow, "Initial native load must not loop")

        let signIn = URLRequest(url: login)
        precondition(decision(signIn, from: puzzle) == .loadInBrowser, "Cross-host login link stays embedded")
        policy.prepareToLoad(signIn)
        precondition(decision(signIn, from: puzzle) == .allow, "Replacement GET is allowed once")
        precondition(decision(signIn, from: puzzle) == .loadInBrowser, "Exception is not permanent")

        var post = signIn
        post.httpMethod = "POST"
        post.httpBody = Data("synthetic=fixture".utf8)
        precondition(decision(post, from: login) == .allow, "Never replay a login POST")
        precondition(decision(post, from: puzzle) == .allow, "Never drop a cross-host form body")
        precondition(decision(post, from: login, popup: true) == .cancel, "Popup POST cannot be safely replayed")

        // Login can redirect through more than one NYT host before the puzzle.
        var previous = login
        for target in [URL(string: "https://www.nytimes.com/auth/callback?fixture=1")!,
                       URL(string: "https://myaccount.nytimes.com/redirect?fixture=1")!, puzzle] {
            let request = URLRequest(url: target)
            precondition(decision(request, from: previous) == .loadInBrowser, "Each cross-host redirect stays embedded")
            policy.prepareToLoad(request)
            precondition(decision(request, from: previous) == .allow, "Redirect replacement does not loop")
            previous = target
        }
        precondition(decision(initial, from: puzzle) == .allow, "Ordinary same-host navigation remains intact")
        precondition(decision(initial, from: puzzle, popup: true) == .loadInBrowser, "New windows stay in importer")

        for input in ["nytimes://crosswords", "intent://crosswords", "https://nytimes.com.evil.example/",
                      "https://evilnytimes.com/", "https://nytimes.com@evil.example/",
                      "https://user@www.nytimes.com/", "http://www.nytimes.com/", "https://www.nytimes.com:444/"] {
            let request = URLRequest(url: URL(string: input)!)
            policy.prepareToLoad(request)
            precondition(decision(request, from: login) == .cancel, "Native marker must not bypass URL restrictions")
        }
        for input in ["nytimes://crosswords", "intent://crosswords", "itms-apps://apps.apple.com/"] {
            precondition(decision(URLRequest(url: URL(string: input)!), from: login, main: false) == .cancel,
                         "Subframes must not launch another app")
        }
        precondition(decision(URLRequest(url: URL(string: "https://example.com/frame")!), from: login, main: false) == .allow,
                     "Web subframes can still load")
        print("PASS: login redirects, loop prevention, POST preservation, popup routing, URL restrictions, and subframe app links")
    }
}
