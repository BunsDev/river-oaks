import Foundation

// Never follow redirects with a refresh credential or device code, and never
// persist provider cookies or tokens in URLSession's shared stores.
final class ProbeHTTP: NSObject, URLSessionTaskDelegate {
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()
    func send(_ request: URLRequest) async throws -> ProbeHTTPResponse {
        let (data, response) = try await session.data(for: request)
        guard data.count <= 65536, let http = response as? HTTPURLResponse else { throw DeviceAuthError.invalidResponse }
        return ProbeHTTPResponse(status:http.statusCode,data:data,cookie:http.value(forHTTPHeaderField:"Set-Cookie"))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
