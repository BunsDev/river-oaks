// Visual regression for diagnostic host controls. Local Vision OCR examines
// only the screenshot's top quarter and reports expected action labels, never
// arbitrary page text. This does not establish accessibility or hit testing.
import Foundation
import Vision

let arguments = CommandLine.arguments
if arguments.count != 2 { fatalError("Pass one simulator screenshot path") }
let expected: Set<String> = ["Reload", "Browser", "Stop"]
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = false
request.regionOfInterest = CGRect(x: 0, y: 0.75, width: 1, height: 0.25)
try VNImageRequestHandler(url: URL(fileURLWithPath: arguments[1])).perform([request])
let observed = Set((request.results ?? []).flatMap { result in
    (result.topCandidates(1).first?.string ?? "").components(separatedBy: .whitespacesAndNewlines)
}.filter { expected.contains($0) })
let missing = expected.subtracting(observed).sorted()
let evidence: [String: Any] = ["scope": "Visual labels only, not accessibility or touch-target proof", "found": observed.sorted(), "missing": missing]
let data = try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
exit(missing.isEmpty ? 0 : 1)
