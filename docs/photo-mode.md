# Photo mode

Open **Commands → Photo mode**, or **Play & rides → Camera → Photo mode**.
Frame the scene with pan, tilt, roll, lens movement and field of view. Choose an
original, square, portrait, story or cinema crop, and Natural, Warm film or
Black & white. The grid helps composition; **Hide controls** clears the controls
while leaving the shutter available. **Reset framing** restores your starting lens
and view. Escape or Close returns to play and restores the previous camera.

**Take photo** opens a preview. **Download PNG** saves it locally; **Share photo**
opens the device's share sheet when file sharing is supported. Otherwise, download
and share the file yourself. Nothing is automatically uploaded or posted. Cancelling
sharing keeps the photo available. Back to camera lets you compose another while
keeping the last photo; **View last photo** returns to it. Closing and reopening
Photo mode also restores that preview and download. A successful new capture
replaces the old one; a failed capture leaves it available. **Discard photo**
explicitly removes it. Only one photo is held in memory for this page session;
reloading or leaving the page loses it, so download anything you want to keep.

Only the rendered world is captured, with a small River Oaks/OpenStreetMap credit.
Chat, controls, account details and the composition grid are excluded. Output uses
the selected crop at the current canvas resolution, capped at 2048 pixels on its
longest edge, without upscaling. Composition shows the next PNG dimensions,
framing angles in degrees and lens movement in meters. The photo UI also shows
the current graphics mode, scene resolution and ambient occlusion; these can
limit image detail even when the PNG dimensions are larger. Use
Settings → Graphics → Sharpest before opening the camera for the highest scene
detail. The town keeps moving; photo mode holds your local walking input and camera,
not the shared simulation. It does not move your character to the lens position.

## Verification

```sh
node --test preview/tests/photo-camera.test.js
RIVER_OAKS_E2E_REPORT=photo-mode.json pnpm run test:experience photo-mode
pnpm run test:desktop
pnpm run test:desktop:photo
pnpm run build
```

The browser journey checks real rendered PNG pixels, output dimensions, successful
download, failed encoding recovery, framing reset, cancelled share recovery,
camera UI exit, retained previews, failed replacement recovery, explicit discard,
object URL release, late-share fencing, numeric framing values, prospective output
dimensions, graphics limitations and narrow-screen composition. Native sharing is stubbed to cancel;
it does not send an image. The camera module tests exact pose/lens restoration,
resize preservation and bounded cropping. The fixture uses approved local identities.

Desktop saves retain the native file picker. The desktop download policy permits
only user-triggered, bounded PNG blobs with photo filenames, initiated by the exact
game origin in its own window. Other downloads remain blocked. The policy uses
Electron's [initiator-origin and download APIs](https://www.electronjs.org/docs/latest/api/download-item).

The [desktop receipt](../data/reports/photo-mode-desktop.json) records a real
Electron run joined to the local shared town: a generated square PNG saved through
the download handler, and a non-photo blob was blocked. The test supplies a temporary
save destination, so it does not establish native Save dialog interaction.

This is the shared browser/Electron web renderer. Real OS share-sheet completion,
packaged Electron, native Unreal and human keyboard/VoiceOver review have not been
established by these checks. See [the current browser receipt](../data/reports/photo-mode.json).
