# White Balance for Safelight

The Develop **White Balance** panel: Temp (Kelvin) and Tint, with an
eyedropper, Auto, and a preset menu with your camera's own presets.

- **Picker:** switch it on, then click something in the photo that should be
  neutral grey. Safelight adjusts Temp and Tint until that point is neutral,
  as one Undo step, and the picker switches off. Escape switches it off too.
- **Auto:** a grey-world balance of the whole photo, as one Undo step.
- **Presets:** As Shot, Auto, and the light-source presets for the photo:
  - a RAW: its camera's own presets (Daylight, Cloudy, Tungsten, the
    fluorescent kinds and so on), for 486 camera bodies;
  - a DNG: standard presets (Daylight 5500 K, Cloudy 6500 K, Shade 7500 K,
    Tungsten 2850 K, Fluorescent 3800 K, Flash 5500 K);
  - a JPEG or other rendered photo: As Shot and Auto only.

  The menu shows Custom once Temp or Tint moves off an entry.
- **Temp** opens at the photo's as-shot temperature; double-click the slider
  to go back to it. On a JPEG or other rendered photo it runs from −100
  (cooler) to +100 (warmer) around the as-shot instead of in Kelvin. **Tint**
  runs from green (−150) to magenta (+150). Shift+double-click either slider
  for Auto (Safelight 3.2.5 and later).
- Under the sliders: the as-shot temperature and the camera's white balance
  setting, when the photo records them.
- **Adaptation** (3.2.0), under the as-shot line: how Temp and Tint change
  the colours. **RGB gains** (the default) scales red, green and blue, as
  before. **CAT16**, **Bradford** and **XYZ** adapt the light in a
  cone-response space instead, which keeps saturated colours truer under
  strong corrections. They also gently compress the most saturated colours
  toward white. Whatever you pick, the colour Temp and Tint make neutral is
  still exactly neutral, so Picker, Auto and the presets work the same. Each
  photo keeps its own choice, and presets, Copy and Paste carry it.
- Masks get relative Temp and Tint shifts (−100 to 100) of their own.

Picker and Auto wait for the photo's first rendered frame. Right-click the
panel's header and choose **Reset to defaults** to put Temp and Tint back as
one step, with Adaptation back at RGB gains.

Until Safelight 3.2.0 this panel was built in. It keeps the built-in panel's
id (`core.white-balance`), so layouts saved before then keep it where it was,
and photos keep their white balance. While the extension is off or
uninstalled, photos show at their as-shot white balance; Develop says so for
photos that had their own. Masks' Temp and Tint keep rendering either way.

## Release lines

A release's major version is its line, the process version its stage text was
written for. White balance never differed between process versions, so every
line carries the same text.

## Camera presets

`src/camera-presets.data.ts` is generated from darktable's
`data/wb_presets.json` (GPL-3.0-or-later) by `scripts/camera-presets.mjs`; the
file's header names the darktable commit. To refresh it, download that file
and run:

```bash
node scripts/camera-presets.mjs <path to wb_presets.json> <darktable commit>
```

Canon's Rebel and Kiss names find their EOS body through
`src/camera-aliases.data.ts`, generated from rawspeed's `data/cameras.xml` by
`scripts/camera-aliases.mjs`:

```bash
node scripts/camera-aliases.mjs <path to cameras.xml> <rawspeed commit>
```

`docs/SPEC.md` explains how a preset becomes Temp and Tint, and why DNGs and
JPEGs get different menus.

## Development

```bash
npm install
npm run typecheck
npm run build    # dist/index.js, the file Safelight loads
npm test         # vitest; the bundle checks read dist/, so build first
npm run check    # all three, in that order
```

`test/white-balance.test.tsx` pins the stage text with the same hash as
Safelight's own copy (`src/rendering/webgl/essential-stages.test.ts` in the
app). Change both together.
