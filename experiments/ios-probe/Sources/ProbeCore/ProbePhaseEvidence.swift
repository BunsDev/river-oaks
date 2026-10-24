import Foundation
import CoreFoundation

// Native boundary: never append an arbitrary main-page object to local evidence.
public enum ProbePhaseEvidence {
    public static func replyIsTimely(startedAt: TimeInterval, now: TimeInterval) -> Bool {
        startedAt.isFinite && now.isFinite && now >= startedAt && now - startedAt <= 2
    }
    private static let phases = ["setup", "community", "trees", "residents", "interactions", "players", "reflections", "debug", "pipeline", "tail"]
    private static func number(_ value: Any?, maximum: Double = 60000) -> Double? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let result = number.doubleValue
        return result.isFinite && result >= 0 && result <= maximum ? result : nil
    }
    public static func sanitize(_ value: Any) -> [String: Any]? {
        guard let value = value as? [String: Any], let status = value["status"] as? String else { return nil }
        if ["unsupported", "not-ready", "busy", "invalid", "failed", "stale", "cancelled"].contains(status) { return ["status": status] }
        guard ["started", "captured"].contains(status), let start = number(value["startedAtMs"], maximum: 1e12) else { return nil }
        if status == "started" { return ["status": status, "startedAtMs": start] }
        guard let elapsed = number(value["elapsedMs"]), let raw = value["frames"] as? [[String: Any]], !raw.isEmpty, raw.count <= 7200 else { return nil }
        var frames = [[String: Any]]()
        for frame in raw {
            guard let interval = number(frame["intervalMs"]), interval > 0, let cpu = number(frame["cpuMs"]), let rawPhases = frame["phasesMs"] as? [String: Any] else { return nil }
            var times = [String: Double]()
            for name in phases { guard let time = number(rawPhases[name]) else { return nil }; times[name] = time }
            guard abs(times.values.reduce(0, +) - cpu) <= 0.001 else { return nil }
            frames.append(["intervalMs": interval, "cpuMs": cpu, "phasesMs": times])
        }
        return ["status": status, "startedAtMs": start, "elapsedMs": elapsed, "frames": frames]
    }
}
