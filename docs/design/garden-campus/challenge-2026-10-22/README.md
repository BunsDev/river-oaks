# Campus challenge evidence for #507 / PR #575

Candidate `6ab4260de51ed51ec59b6a39d79978aad78a2b6a`, district `river-oaks-gardens-3`, layout 3.2. This packet publishes retained local fixture evidence for independent review. Val's acceptance of its visual and resource evidence is recorded in the [ledger](../../../superpowers/plans/2026-10-21-campus-challenge-507.md) (2026-10-23); it records no production/device acceptance. The older `finish/` sheets remain historical comparisons.

## Review views

- [Matched aerial sheet](aerial/sheet-day.jpg), [campus aerial](aerial/gardens-day-01-southeast-aerial.png), [garage control aerial](aerial/garage-day-01-southeast-aerial.png), [camera/pose receipt](aerial/result.json).
- [Measured site plan](site-plan.svg): generated contract artifact, validated by `node scripts/garden-campus-views.mjs --check` with zero findings and no stale artifacts on 2026-10-22. This is a dimensional contract view, not a rendered aerial capture.
- [Matched garage/campus sheet](matched/sheet-day.jpg), [camera/pose/metrics receipt](matched/result.json).
- [East 11](matched/gardens-day-11-east-long-side.png): count occupied floor bands; compare parapets and foliage with the contract.
- [West 12](matched/gardens-day-12-west-long-side.png): retained IPIC edge and surrounding context; foreground occlusion limits lower-storey visibility.
- [Under B12 / 02](matched/gardens-day-02-street-under-b12.png) and [under B23 / 14](matched/gardens-day-14-street-under-b23.png): bridge anchors, ground plane and context. Authoritative sweeps, not fixed images, supply movement evidence.
- Actual admitted office terrace: [cycle 0 with UI](office/campus-aimed-0.png), [cycle 1 with UI](office/campus-aimed-1.png), [cycle 0 scene](office/campus-aimed-clean-0.png), [cycle 1 scene](office/campus-aimed-clean-1.png), [receipt with camera poses and source hashes](office/result.json). Aiming uses normal pointer input and preserves the walking position. Far towers naturally occlude; this view cannot count all storeys.

## Provenance and limits

[Provenance](provenance.json) records the candidate, file checksums and 18 office source hashes revalidated against this candidate. The matched images are the retained prior run described in the ledger; its original receipt has poses but no capture-time source hashes. Current applicability checks do not manufacture missing capture-time provenance. The original single-arm [resource receipt](resources-original.json) has six source hashes revalidated against this candidate and a finite first-reload +10 geometry/+10 texture step, followed by a plateau. The [paired resource receipt](resources-paired.json) and [supplementary aerial receipt](aerial/result.json) both passed at this candidate. [Input binding](capture-inputs.json) records source hashes taken before the queued runs and verified unchanged afterward.

## Decisions for Val

- [x] Visual and resource evidence. Val (repository owner) answered "Accepted" on 2026-10-23 for this packet at `24f41d4b`/`91da966b`: views 11/12/02/14, the aerial, the aimed office outlook and the resource receipt, including the unattributed +10/+10 first-reload step. No pose was rejected. The acceptance covers these recorded captures only; later campus runtime changes on main postdate them.
- [ ] Accept the entry-evidence boundary: E1/E2/E3 are authored seams, not surveyed historical doors. Not yet put to Val; no production/device/accessibility sign-off is implied.
- Preserved gaps: physical-device/GPU, visible-UI keyboard/accessibility and live auth.
- Built-client/no-HMR admitted-session revision recovery is tracked in #512 release acceptance. The lifecycle harness remains a teardown smoke test; fresh server state, legacy manifest fallback and possible Vite reload prevent independent deployed recovery proof.
- Landing was authorized by Val on 2026-10-24 (open-PR sweep). Landing publishes this evidence; it does not tick the entry-evidence box or close #507.

Close recommendation: keep #507 open until the entry-evidence boundary is decided. Do not interpret source/test acceptance as release approval.


## Historical control comparison

The separately dated [2026-10-18 A/B receipt](../finish/resources-2026-10-18.json) contains two garage rounds with geometries 547→565→565→565 (+18) and textures 181→191→191→191 (+10). Its two campus rounds show geometries 559→569→569→569 (+10) and the same texture sequence. This supports an older shared first-reload effect, not identical geometry deltas or an attribution to intentional caches. Five of its six source hashes differ from this candidate, so it does not replace the current-candidate paired run below.

Packet inspection on 2026-10-22: the retained matched sheet shows the garage/campus comparison at identical poses; the east view exposes the three stepped masses and the west view is partly occluded by IPIC. Both aimed office images show the same terrace position and partially occluded campus skyline. This is an agent inspection of the recorded local images, not Val's sign-off. Packet checksums, JSON parsing and local Markdown links passed before publication; no new browser result is implied by this inspection.


## Current paired resource result

Command: `node preview/e2e/garden-campus-render-resources.mjs garage=garage gardens=gardens --rounds 2 --rebuilds 3 --frames 60 --out campus-challenge-resource-ab-20261022`. Both rounds completed without browser errors, with arm order reversed for round 2. Candidate `6ab4260de51ed51ec59b6a39d79978aad78a2b6a`; unchanged source hashes verified before/after. Every round produced the same counts:

| Revision | Geometries, initial → reloads 1/2/3 | Textures, initial → reloads 1/2/3 | Draw calls throughout |
| --- | --- | --- | --- |
| Garage | 546 → 564 → 564 → 564 | 181 → 191 → 191 → 191 | 1354 |
| Campus | 560 → 570 → 570 → 570 | 181 → 191 → 191 → 191 | 1402 |

The first-reload step is shared with the garage: +18 geometries/+10 textures for garage and +10/+10 for campus. Both plateau across subsequent rebuild/disposal cycles. No continuing growth or duplicated draw submissions were demonstrated in these six measured reloads per revision. This comparison does not identify retained instances, establish an intentional cache, measure post-context-close counters, or prove indefinite-soak/zero-retention behavior. No campus-owned leak is established by these counts; no runtime change is justified by them. Val's acceptance of this finite boundary remains a release decision.

The supplementary matched aerial run also passed, with no page errors. Its overhead oblique view shows the three stepped shells, two connecting bridge spans and retained adjacent roof/road context. It supplements the measured plan and side images; exact dimensions remain contract evidence. All captures are local Chromium/Metal fixture evidence, not physical-device or production proof.
