# Electron shell

Read `docs/desktop.md`; the shell hosts the web experience and owns window state,
IPC, navigation restrictions and renderer recovery.

- Preserve sandbox/context isolation, navigation/origin validation and narrow IPC.
  Do not move web account secrets into renderer globals or disable the access gate.
- Run `pnpm run test:desktop` and `pnpm run build` from root. Use
  `pnpm run test:desktop:e2e` for lifecycle/IPC/window changes on a supported host.
- `pnpm run desktop:dev` starts an interactive app; packaging is a separate action.
  A unit-test pass does not prove signed/notarized or hosted packaged acceptance.

See root AGENTS.md for scope and delivery rules.
