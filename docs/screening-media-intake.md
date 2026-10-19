# Screening media intake

How a new film reaches the IPIC screen. The first case is #501: a second short, with real dialogue
and music, beside the approved silent short `ipic-original-v1`. The existing contract is in
[screenings](screenings.md). This page adds the intake rules, the checks and the approval steps.

## States

| State | Meaning | Who moves it on |
| --- | --- | --- |
| draft | A file or record check fails, or a record is missing | The media owner |
| engineering candidate | Every check passes on these bytes; no approval yet | Val, by approving the exact bytes |
| approved | Val's approval names every file's SHA-256 | Engineering registers it (below) |
| registered | In `sources.json` and `SCREENING_MEDIA`, merged | Merged through `pnpm run land` with Val's go |
| published | Deployed to production | Val's deployment go, recorded on #359 |

`scripts/ipic-short/intake-check.mjs` decides the first three states. It never decides the last two. A
fixture is never any of them: `ipic-fixture-v1` stays a labelled test signal. A test-only source under
`preview/e2e/fixtures/screening/` is never a catalog film. A recut, a re-encode or a caption edit changes the
bytes, so it needs its own approval and usually a new version (`ipic-<name>-v2`).

## What to deliver

Put these in one candidate directory, outside the repository until the film is approved:

- **MP4:** H.264 video and AAC audio, with fast start (`-movflags +faststart`).
- **WebM:** VP9 video and Opus audio. It must be the same cut and size as the MP4, and the two durations must match
  within 60 ms.
- **Keyframes:** one every second in both encodes (`-g <fps> -keyint_min <fps>`), as #472 established.
- **Sound:** stereo at 48 kHz, as authored. The mix should land around -16 to -23 LUFS integrated, with a true peak at
  or below -1 dBTP. Listen on headphones and on a device speaker before asking for approval.
- **Captions:** English WebVTT (below).
- **Transcript:** in the manifest, equal to the cue text.
- **Poster:** a JPEG at the film's size.
- **Manifest:** `sources.candidate.json`, an entry shaped like one in `sources.json` plus the fields below.
- **Master and edit:** the editable source and the cut instructions, kept privately. Do not commit them.

The manifest's extra fields are:

```json
{
  "id": "ipic-<name>-v1",
  "fixture": false,
  "audio": { "dialogue": true, "music": true },
  "components": {
    "footage": { "source": "…", "permission": "…" },
    "voices": { "source": "…", "permission": "…" },
    "music": { "source": "…", "permission": "…" },
    "likeness": { "source": "…", "permission": "…" },
    "credits": ["…"]
  },
  "approvedFiles": { "preview/public/assets/ipic/screening/<file>": "<sha256>" }
}
```

Only Val's approval fills in `approvedFiles`. Creative approval does not establish third-party distribution
rights. Record each part's actual permission, and never label unknown material CC0.

## Captions

The film reaches the screen as texture frames. The panel shows the active cue's text as plain text
(`ipic-screening-ui.js`), and `preview/tests/screening-media.test.js` compares the raw cue text with the transcript.
So:

- **Speakers:** name each one as plain text, `Jevica: Two seats, one screen.`. Don't use `<v>`, `<c>` or `<i>`
  markup, because the panel would show it literally.
- **Sounds:** describe meaningful sounds and music in square brackets or with ♪, for example
  `[Soft piano music]` or `♪ A slow jazz trio ♪`.
- **Timing:** cues must not overlap or run past the film.
- **Truth:** a silent film claims no dialogue, and a film without music claims none.

## Checks

```sh
node scripts/ipic-short/intake-check.mjs <candidate-dir>     # static: hashes, codecs, keyframes, fast start, loudness, captions, records
node scripts/ipic-short/decode-check.mjs <worktree> <candidate-dir>   # real decode in Chromium (takes the browser lock)
node --test scripts/tests/ipic-short-intake.test.js
```

`intake-check.json` is written beside the files, with the state, problems, notes, measured loudness and keyframe
spacing. The intake test also proves that neither the approved silent short nor the fixture passes as a film
with dialogue and music.

## Registering an approved film

Registration needs Val's approval of the exact bytes. It changes shared files, so it is one owner's edit, in
#499's chooser branch or after it:

1. Copy the approved bytes into `preview/public/assets/ipic/screening/`. Don't touch the original's files.
2. Add the `sources.json` entry, with `approval` text naming Val and the date, and `approvedItems` for anything shown
   by permission.
3. Add the `SCREENING_MEDIA` entry. It needs a new id, the duration from the files, the sources in the WebM-then-MP4
   order, the captions and the transcript. `ipic-original-v1` stays the default film.
4. Run `node scripts/make-screening-fixture.mjs --check`, `node --test preview/tests/screening-media.test.js`,
   the screening journey and `pnpm run verify`.

Publication is a separate deployment decision.

## Rollback

Once a town has started the new film, its checkpoint and operation receipts name the new id. Never delete or reuse
that id, and never change its duration. To withdraw the film, hide it from the chooser on a compatible build and
keep its catalog entry. Do not redeploy a build that predates it.
