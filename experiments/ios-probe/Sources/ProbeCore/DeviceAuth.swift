import Foundation
public enum DeviceAuthError: Error { case invalidResponse, rejected, expired, unsupportedProvider }
public struct DeviceChallenge {
    public let code: String
    public let verification: URL
    public let lifetime: Double
    public let interval: Double
    public static func parse(_ data: Data) throws -> DeviceChallenge {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let code = value["device_code"] as? String, !code.isEmpty, code.count <= 2048,
              let raw = value["verification_uri_complete"] as? String, let url = URL(string: raw),
              url.scheme == "https", url.user == nil, url.password == nil, (url.port ?? 443) == 443,
              let host = url.host?.lowercased(), host == "signin.workos.com" || host == "api.workos.com" || host.hasSuffix(".authkit.app"),
              let lifetime = value["expires_in"] as? Double, lifetime.isFinite, lifetime > 0,
              let interval = value["interval"] as? Double, interval.isFinite, interval > 0, interval <= 600
        else { throw DeviceAuthError.invalidResponse }
        return DeviceChallenge(code: code, verification: url, lifetime: min(600, lifetime), interval: max(5, interval))
    }
}
public func probeSessionCookie(header: String, origin: URL, now: Date = Date()) throws -> HTTPCookie {
    guard origin.scheme == "https", let host = origin.host,
          let cookie = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie":header], for:origin).first(where: {$0.name == "river_oaks_session"}),
          cookie.domain == host || cookie.domain == "." + host,
          cookie.isSecure, cookie.isHTTPOnly, cookie.path == "/", !cookie.value.isEmpty,
          let expires = cookie.expiresDate, expires > now, expires.timeIntervalSince(now) <= 30 * 24 * 3600
    else { throw DeviceAuthError.invalidResponse }
    return cookie
}
public struct ProbeHTTPResponse {
    public var status: Int
    public var data: Data
    public var cookie: String?
    public init(status: Int, data: Data, cookie: String? = nil) { self.status=status;self.data=data;self.cookie=cookie }
}
@MainActor public final class ProbeDeviceAuth {
    private let origin: URL
    private let clientID: String
    private let send: (URLRequest) async throws -> ProbeHTTPResponse
    private let sleep: (Double) async throws -> Void
    private let now: () -> Double
    public init(origin: URL, clientID: String, send: @escaping (URLRequest) async throws -> ProbeHTTPResponse, sleep: @escaping (Double) async throws -> Void, now: @escaping () -> Double) {
        self.origin=origin;self.clientID=clientID;self.send=send;self.sleep=sleep;self.now=now
    }
    private func form(_ path: String, _ fields: [String:String]) -> URLRequest {
        var request=URLRequest(url:URL(string:"https://api.workos.com/user_management/"+path)!,timeoutInterval:15)
        request.httpMethod="POST";request.setValue("application/x-www-form-urlencoded",forHTTPHeaderField:"Content-Type")
        var components=URLComponents();components.queryItems=fields.sorted(by:{$0.key<$1.key}).map { URLQueryItem(name:$0.key,value:$0.value) }
        request.httpBody=components.percentEncodedQuery?.replacingOccurrences(of:"+",with:"%2B").data(using:.utf8)
        return request
    }
    public func run(openBrowser: (URL) -> Bool) async throws -> HTTPCookie {
        try Task.checkCancellation()
        guard origin.scheme == "https", origin.host != nil, origin.user == nil, origin.password == nil,
              origin.query == nil, origin.fragment == nil, origin.path.isEmpty || origin.path == "/", !clientID.isEmpty else { throw DeviceAuthError.invalidResponse }
        let initial=try await send(form("authorize/device",["client_id":clientID]))
        try Task.checkCancellation()
        guard initial.status == 200 else { throw DeviceAuthError.rejected }
        let challenge=try DeviceChallenge.parse(initial.data), deadline=now()+challenge.lifetime
        guard openBrowser(challenge.verification) else { throw CancellationError() }
        var interval=challenge.interval
        while now() < deadline {
            try await sleep(min(interval,max(0,deadline-now())))
            try Task.checkCancellation()
            guard now() < deadline else { throw DeviceAuthError.expired }
            let response=try await send(form("authenticate",["client_id":clientID,"device_code":challenge.code,"grant_type":"urn:ietf:params:oauth:grant-type:device_code"]))
            try Task.checkCancellation()
            guard now() < deadline else { throw DeviceAuthError.expired }
            guard let body=try JSONSerialization.jsonObject(with:response.data) as? [String:Any] else { throw DeviceAuthError.invalidResponse }
            if response.status == 200 {
                guard body["authentication_method"] as? String == "GitHubOAuth" else { throw DeviceAuthError.unsupportedProvider }
                guard let token=body["refresh_token"] as? String, token.count >= 20, token.count <= 2048 else { throw DeviceAuthError.invalidResponse }
                let target=origin.appendingPathComponent("auth/desktop/exchange")
                var exchange=URLRequest(url:target,timeoutInterval:15);exchange.httpMethod="POST"
                exchange.setValue("application/json",forHTTPHeaderField:"Content-Type")
                exchange.setValue(origin.absoluteString.trimmingCharacters(in:CharacterSet(charactersIn:"/")),forHTTPHeaderField:"Origin")
                exchange.httpBody=try JSONSerialization.data(withJSONObject:["refreshToken":token])
                let result=try await send(exchange)
                try Task.checkCancellation()
                guard result.status == 200, let header=result.cookie else { throw DeviceAuthError.rejected }
                return try probeSessionCookie(header:header,origin:origin)
            }
            switch body["error"] as? String {
            case "authorization_pending": break
            case "slow_down": interval += 5
            default: throw DeviceAuthError.rejected
            }
        }
        throw DeviceAuthError.expired
    }
}
