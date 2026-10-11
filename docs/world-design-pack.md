# Portable World Design pack

`scripts/studio-skill-pack.js` builds a host-readable knowledge bundle from the
fourteen repository workflows and the Studio design role. It recursively includes
linked Markdown guides, validates local files and required workflow heading anchors, and preserves
relative links between included documents. Non-Markdown file/directory links point
to the repository revision; their manifest entries retain path and local content
SHA-256 of raw bytes (directories have no content hash). These references are not installed source
code, runtime tools, or new validation evidence. A dirty source may differ from the
pinned public revision; the recorded local hash identifies what was inspected.
Missing fragment anchors in secondary historical guides appear in manifest
`linkWarnings`; missing files and broken anchors from skill entrypoints or the
primary skill index fail the build. This does not repair historical evidence.
An exported source tree without Git records unpinned `main` reference URLs explicitly.

The deterministic manifest records format and pack versions, role entrypoint, skill
index, source revision, file sizes, per-file SHA-256 and a SHA-256 over manifest
content. It omits timestamps and absolute host paths. SHA-256 verifies consistency,
not publisher authenticity; use a trusted bundle/transport. Historical reports
remain evidence only for their recorded revision.

## Host API

```js
import { buildWorldDesignPack, installWorldDesignPack, verifyWorldDesignPack }
  from './scripts/studio-skill-pack.js';

const pack = await buildWorldDesignPack(repositoryRoot);
// Read entry.content for prompt loading; no installation is needed to load text.
const role = pack.files.find(entry => entry.path === pack.manifest.entrypoint);
const receipt = await installWorldDesignPack(pack, newOwnedPackWorkspace);
const verification = await verifyWorldDesignPack(pack, newOwnedPackWorkspace);
```

`pack.files` contains `{ path, content, sha256 }`; `pack.manifest.skills` maps names
to paths. Load the role and shared contract first, then the relevant skill guides
within the runtime's context budget. Do not inject the whole bundle automatically.
Expose which skills were loaded alongside the current tool capability snapshot.

Installation is a host operation on an explicitly selected new/empty pack workspace.
The caller must own the directory and serialize access throughout installation;
this helper is not a sandbox against another process concurrently renaming ancestors.
Every existing symlink, including an ancestor, is rejected. Reads require regular
files before and after a nonblocking open, so a named pipe cannot hang verification. The installer uses
exclusive creation and never replaces files. A complete identical installation is
idempotent. The installer writes `.world-design-pack.json` ownership metadata first.
On a retry, that manifest must match exactly, every existing payload must have the
expected hash, and the directory may contain only expected pack files/directories.
Only then can the installer create missing files. It never overwrites changed or
truncated files, follows symlinks, or removes unrelated content. Missing/corrupt
ownership metadata, unrelated identities/workspaces, changed content and different
pack versions require explicit host recovery. No temporary directories accumulate.
Keep identity creation separate.

The ownership manifest alone is not a completed-install receipt. Verification is
read-only and reports missing files, unsafe paths and hash mismatches. `ok: true`
means the expected knowledge files match; it does not mean a familiar was created,
a provider is connected, editor tools exist, or a design check passed. The helper
does not find or change familiar directories, credentials, SOUL or IDENTITY files.

Fixture verification uses worktree-local `.runtime/tmp` directories. No real
familiar installation, remote provider invocation or production write is needed.
