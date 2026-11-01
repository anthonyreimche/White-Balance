# White Balance for Safelight

The Develop **White Balance** panel: Temp (Kelvin) and Tint, with an
eyedropper and Auto.

- **Picker:** switch it on, then click something in the photo that should be
  neutral grey. Safelight adjusts Temp and Tint until that point is neutral,
  as one Undo step, and the picker switches off. Escape switches it off too.
- **Auto:** a gray-world balance of the whole photo, as one Undo step.
- **Temp** opens at the photo's as-shot temperature; double-click the slider
  to go back to it. **Tint** runs from green (−150) to magenta (+150).
- Masks get relative Temp and Tint shifts (−100 to 100) of their own.

Picker and Auto wait for the photo's first rendered frame. Right-click the
panel's header and choose **Reset to defaults** to put Temp and Tint back as
one step.

Until Safelight 3.2.0 this panel was built in. It keeps the built-in panel's
id (`core.white-balance`), so layouts saved before then keep it where it was,
and photos keep their white balance. While the extension is off or
uninstalled, photos show at their as-shot white balance; Develop says so for
photos that had their own. Masks' Temp and Tint keep rendering either way.

## Release lines

A release's major version is its line, the process version its stage text was
written for. White balance never differed between process versions, so every
line carries the same text.

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
