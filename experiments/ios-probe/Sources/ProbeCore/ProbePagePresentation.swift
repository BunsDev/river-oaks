// Diagnostic presentation only. This value grants no navigation or bridge access.
public struct ProbePagePresentation: Sendable {
    private enum State: Sendable, Equatable { case loading, loaded, failed, terminated }
    private var state: State = .loading
    private var navigation: String?
    private var document: String?
    private var seenDocuments: Set<String> = []
    private var ambiguousResponse = true
    public private(set) var responseStatus: Int?
    public init() {}

    public mutating func started(navigation: String, document: String? = nil) {
        self.navigation = navigation
        state = .loading
        responseStatus = nil
        associate(document)
    }
    private mutating func associate(_ document: String?) {
        guard let document, document.utf8.count <= 8192 else {
            self.document = nil; ambiguousResponse = true; return
        }
        self.document = document
        ambiguousResponse = seenDocuments.contains(document) || seenDocuments.count >= 32
        if seenDocuments.count < 32 { seenDocuments.insert(document) }
    }
    public mutating func redirected(navigation: String, document: String?) {
        guard self.navigation == navigation, state == .loading, self.document != document else { return }
        associate(document)
        responseStatus = nil
    }
    public mutating func finished(navigation: String) {
        guard self.navigation == navigation, state == .loading else { return }
        state = .loaded
    }
    public mutating func failed(navigation: String) {
        guard self.navigation == navigation, state != .terminated else { return }
        state = .failed
    }
    // Response-policy callbacks expose no navigation identity. Attribute only a
    // unique current main-document URL; repeats/unknowns cannot poison a retry.
    @discardableResult
    public mutating func receivedResponse(status: Int, isMainFrame: Bool, document: String) -> Bool {
        guard isMainFrame, self.document == document, !ambiguousResponse,
              (100...599).contains(status), state != .terminated else { return false }
        responseStatus = status
        if status >= 400 { state = .failed; return true }
        return false
    }
    public mutating func terminated() { state = .terminated }
    public func status(_ fallback: String) -> String {
        switch state {
        case .loading: return "Loading page · Reload / Browser available"
        case .loaded: return fallback
        case .failed: return "Load failed · retry with Reload"
        case .terminated: return "Web content terminated · manual Reload required"
        }
    }
}
