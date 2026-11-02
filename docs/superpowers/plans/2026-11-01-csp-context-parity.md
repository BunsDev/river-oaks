# CSP content-world comparison plan

Goal: determine whether the diagnostic content world changes current-source CSP behavior, without selecting a production host or exposing a native capability.

Use the existing bundled-origin simulator experiment and loopback witness. Serve one synthetic page and a module worker; generate the explicit CSP input from `server/security-headers.js`. Compare CSP disabled/enabled, each with identical main-frame probes injected into page and isolated worlds. The probes perform a bounded witness fetch and require a nonce-matched worker reply. No production origin, account, signing, dependency download or real game qualification is involved.

Register no message handler in comparison mode. Native code polls bounded result strings from the two worlds, checks expected document, navigation generation, role and run identifier, and writes local diagnostic results. Require an explicit bounded policy file within the fixture bundle; no fallback to the archived policy. The measured context difference justified moving ordinary experiment measurements into the page world with native polling and removing all message-handler registration; retain its archived-policy limitation.

- [x] Add failing policy-file and probe-result regressions; implement bounded file loading and privacy-limited probes.
- [x] Integrate the opt-in mode, current-policy input and native result collection with navigation fences.
- [x] Build unsigned simulator app and run both modes on one owned simulator, retaining actual witness/native outputs and hashes. Do not restart a live process merely because observation times out.
- [x] Review source and measured differences, then update the host decision/ledger with exact scope. Keep real assets/decoders, actual Capacitor, production, physical-device and focus acceptance open.

The two prior aggregate core attempts remain failed at the preview deadline. This fixture comparison is additional evidence, never a replacement for that gate or the original host scope.
