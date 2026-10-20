import XCTest
@testable import ProbeCore
final class DeviceAuthTests: XCTestCase {
    private func json(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object) }
    func testDeviceChallengeUsesBoundedLifetimeAndTrustedBrowserDestination() throws {
        let challenge = try DeviceChallenge.parse(json(["device_code":"fixture-code", "verification_uri_complete":"https://signin.workos.com/device?user_code=fixture", "expires_in":900, "interval":1]))
        XCTAssertEqual(challenge.lifetime,600); XCTAssertEqual(challenge.interval,5)
        XCTAssertEqual(challenge.verification.host,"signin.workos.com")
    }
    func testChallengeRejectsUnsafeURLsAndInvalidTimings() throws {
        for url in ["http://signin.workos.com", "https://signin.workos.com.evil.test", "https://user:pass@signin.workos.com", "https://signin.workos.com:444", "file:///tmp/file"] {
            XCTAssertThrowsError(try DeviceChallenge.parse(json(["device_code":"fixture", "verification_uri_complete":url, "expires_in":300, "interval":5])))
        }
        for interval in [-1,0,601] { XCTAssertThrowsError(try DeviceChallenge.parse(json(["device_code":"fixture", "verification_uri_complete":"https://signin.workos.com/device", "expires_in":300, "interval":interval]))) }
    }
    func testSessionCookieRetainsServerSecurityAndOnlyOwnOrigin() throws {
        let origin=URL(string:"https://typesafe.place")!
        let cookie=try probeSessionCookie(header:"river_oaks_session=fixture; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800",origin:origin)
        XCTAssertEqual(cookie.name,"river_oaks_session");XCTAssertEqual(cookie.domain,"typesafe.place")
        XCTAssertTrue(cookie.isSecure);XCTAssertTrue(cookie.isHTTPOnly)
        for header in ["other=fixture; Path=/; Secure; HttpOnly; Max-Age=60", "river_oaks_session=fixture; Path=/; HttpOnly; Max-Age=60", "river_oaks_session=fixture; Path=/; Secure; Max-Age=60", "river_oaks_session=fixture; Domain=evil.test; Path=/; Secure; HttpOnly; Max-Age=60", "river_oaks_session=fixture; Path=/; Secure; HttpOnly; Max-Age=0", "river_oaks_session=fixture; Path=/; Secure; HttpOnly; Max-Age=999999999"] {
            XCTAssertThrowsError(try probeSessionCookie(header:header,origin:origin),header)
        }
    }
}

@MainActor final class DeviceFlowTests: XCTestCase {
    private func reply(_ body: [String:Any], status: Int = 200, cookie: String? = nil) throws -> ProbeHTTPResponse {
        ProbeHTTPResponse(status:status,data:try JSONSerialization.data(withJSONObject:body),cookie:cookie)
    }
    private var challenge: [String:Any] { ["device_code":"fixture-device", "verification_uri_complete":"https://signin.workos.com/device", "expires_in":300,"interval":5] }
    func testFlowPollsWithBackoffAndExchangesOnlyAtOwnOrigin() async throws {
        var responses=try [reply(challenge), reply(["error":"authorization_pending"],status:400),reply(["error":"slow_down"],status:400),reply(["authentication_method":"GitHubOAuth","refresh_token":String(repeating:"x",count:30)]),reply(["authenticated":true],cookie:"river_oaks_session=fixture; Path=/; Secure; HttpOnly; Max-Age=600")]
        var waits:[Double]=[], requests:[URLRequest]=[], clock:Double=0
        let flow=ProbeDeviceAuth(origin:URL(string:"https://typesafe.place")!,clientID:"client_fixture",send:{request in requests.append(request);return responses.removeFirst()},sleep:{seconds in waits.append(seconds);clock += seconds},now:{clock})
        let cookie=try await flow.run { $0.host == "signin.workos.com" }
        XCTAssertEqual(cookie.name,"river_oaks_session");XCTAssertEqual(waits,[5,5,10]);XCTAssertEqual(requests.last?.url?.absoluteString,"https://typesafe.place/auth/desktop/exchange");XCTAssertEqual(requests.last?.value(forHTTPHeaderField:"Origin"),"https://typesafe.place")
    }
    func testUnsupportedProviderNeverReachesExchange() async throws {
        var responses=try [reply(challenge),reply(["authentication_method":"GoogleOAuth","refresh_token":"fixture-refresh"])]
        var requests=0
        let flow=ProbeDeviceAuth(origin:URL(string:"https://typesafe.place")!,clientID:"client_fixture",send:{_ in requests += 1;return responses.removeFirst()},sleep:{_ in},now:{0})
        do { _ = try await flow.run {_ in true};XCTFail("Provider must be rejected") } catch DeviceAuthError.unsupportedProvider {} catch { XCTFail("Wrong error") }
        XCTAssertEqual(requests,2)
    }
    func testCancelBeforeStartMakesNoRequest() async throws {
        var requests=0
        let flow=ProbeDeviceAuth(origin:URL(string:"https://typesafe.place")!,clientID:"client_fixture",send:{_ in requests += 1;return try self.reply(self.challenge)},sleep:{_ in},now:{0})
        let task=Task { try Task.checkCancellation();return try await flow.run {_ in true} }; task.cancel()
        do { _ = try await task.value;XCTFail("Must cancel") } catch is CancellationError {} catch { XCTFail("Wrong error") }
        XCTAssertEqual(requests,0)
    }
}

@MainActor final class DeviceFlowBoundaryTests: XCTestCase {
    func testExpiredChallengeNeverPollsOrExchanges() async throws {
        var requests=0, clock:Double=0
        let data=try JSONSerialization.data(withJSONObject:["device_code":"fixture", "verification_uri_complete":"https://signin.workos.com/device", "expires_in":1, "interval":5])
        let flow=ProbeDeviceAuth(origin:URL(string:"https://typesafe.place")!,clientID:"fixture",send:{_ in requests += 1;return ProbeHTTPResponse(status:200,data:data)},sleep:{clock += $0},now:{clock})
        do { _=try await flow.run {_ in true};XCTFail("Must expire") } catch DeviceAuthError.expired {} catch { XCTFail("Wrong error") }
        XCTAssertEqual(requests,1)
    }
    func testCancelledBrowserNeverPolls() async throws {
        var requests=0
        let data=try JSONSerialization.data(withJSONObject:["device_code":"fixture", "verification_uri_complete":"https://signin.workos.com/device", "expires_in":300, "interval":5])
        let flow=ProbeDeviceAuth(origin:URL(string:"https://typesafe.place")!,clientID:"fixture",send:{_ in requests += 1;return ProbeHTTPResponse(status:200,data:data)},sleep:{_ in},now:{0})
        do { _=try await flow.run {_ in false};XCTFail("Must cancel") } catch is CancellationError {} catch { XCTFail("Wrong error") }
        XCTAssertEqual(requests,1)
    }
    func testCancellationDuringPollOrExchangeNeverReturnsCookie() async throws {
        for cancelAt in [2,3] {
            var requests=0
            let challenge=try JSONSerialization.data(withJSONObject:["device_code":"fixture", "verification_uri_complete":"https://signin.workos.com/device", "expires_in":300, "interval":5])
            let token=try JSONSerialization.data(withJSONObject:["authentication_method":"GitHubOAuth","refresh_token":String(repeating:"x",count:30)])
            let flow=ProbeDeviceAuth(origin:URL(string:"https://typesafe.place")!,clientID:"fixture",send:{_ in
                requests += 1
                if requests == cancelAt { withUnsafeCurrentTask { $0?.cancel() } }
                return ProbeHTTPResponse(status:200,data:requests == 1 ? challenge : token,cookie:"river_oaks_session=fixture; Path=/; Secure; HttpOnly; Max-Age=600")
            },sleep:{_ in},now:{0})
            let task=Task { try await flow.run {_ in true} }
            do { _=try await task.value;XCTFail("Must cancel") } catch is CancellationError {} catch { XCTFail("Wrong error") }
            XCTAssertEqual(requests,cancelAt)
        }
    }
}
