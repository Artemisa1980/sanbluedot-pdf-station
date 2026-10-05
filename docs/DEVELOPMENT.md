# Developer guide

Orientation for anyone working on this repository, human or AI session, starting cold.
The repository root is the application: `package.json`, `src/`, `tests/` and this guide
are everything needed to build, test and release it.

## Ground rules

1. **Never rasterize export content.** Imported PDF pages go through `pdf-lib`;
   Markdown and HTML go through Chromium `printToPDF`. pdf.js canvases are screen
   previews only and never reach an exported file.
2. **Imported PDFs are immutable plates.** The app may reorder, rotate, duplicate,
   delete, draw a background below (or tint above with the Multiply blend mode, for
   pages that paint their own white sheet) and place patches above. It never rewrites their
   text, fonts or colors.
3. **Owned Markdown/HTML is the source of truth.** The compiled PDF stored in a
   `.sbstation` is a cache that is recompiled whenever the text or style changes.
4. **Mixed page sizes keep their dimensions.** No normalization.
5. **Offline and local.** No CDN, cloud service or API key. Fonts and libraries are
   bundled; the production window blocks all network requests.
6. **Spanish UI, English code and docs.** User-facing strings are Spanish.
7. **The sanblueᵈᵒᵗ signature lives in document content.** The app never injects it.
8. **Every shipped binary gets a new version** in `package.json`.

## Commands

| Command | What it proves |
|---|---|
| `npm install` | Dependencies. npm 12 blocks install scripts; Electron downloads its binary on first run (`node node_modules/electron/install.js` forces it). |
| `npm test` | Regression suites: page reconciliation, project schema, reducer, compiled HTML and staleness, formulas, vector export. |
| `npm run lint` | TypeScript, renderer and main/preload projects. |
| `npm run build` | Production bundle in `out/`. |
| `npm run dev` | Development app with hot reload. Changes under `src/main/` or `src/preload/` restart Electron and drop an unsaved project. |
| `npm run dist:mac` / `npm run dist:win` | Installers in `release/`. The Windows installer must be tested on Windows. |

Tests need Node 22.18 or newer, because some suites import TypeScript files directly.
The rendering checks call Poppler (`pdftoppm`, `pdftotext`, `pdfimages`) and skip
themselves when it is not installed; install Poppler to run them for real.

## Map

```
src/main/index.ts            window, offline network block, close guard
src/main/ipc.ts              dialogs, atomic writes, recovery draft, My Styles file
src/main/htmlToPdf.ts        hidden sandboxed window → printToPDF (margins, page numbers)
src/preload/index.ts         window.station bridge (the only native API)
src/shared/types.ts          StationProject, SourceDoc, PageRef, Patch, DocStyle
src/renderer/src/App.tsx     header actions: new, open, save, export
src/renderer/src/state/      store reducer, auto-recompile, recovery draft, My Styles
src/renderer/src/engine/     compile, export, presets, fonts, formulas, project file
src/renderer/src/components/ left panel, organizer, editor, patch editor, reader
src/renderer/src/assets/     sanbluedot-pdf.css (embedded PDF stylesheet), fonts/
tests/                       node:test suites
```

### Owned document → PDF

`engine/compile.ts` `buildDocHtml()` turns the source into one HTML page: embedded
font faces (body font, preset fonts and Fira Code for code blocks) →
`assets/sanbluedot-pdf.css` → formula CSS (`mathCss` from `engine/math.ts`) → preset
overrides → the document's granular style. `marked` with `engine/math.ts` converts
Markdown and its formulas; HTML documents pass through unchanged. The main process
prints it in `htmlToPdf.ts`, with a two-minute timeout.

Each compiled document stores `compiledSig`, the signature (`engine/staleness.ts`) of
the text, style, preset, page size and margins it was compiled from. A document whose
signature no longer matches is stale: `state/useAutoRecompile.ts` recompiles it after a
pause, discards results that arrive after the document changed, and does not retry a
signature that failed. The export button waits while documents are updating and stays
paused while any document is stale. Projects saved before v1.10 have no signature and
recompile once when opened.

### Master document → exported PDF

`engine/exportProject.ts`:

- A page without background or patches is copied with `copyPages` (direct path).
- A page with a background or patches is embedded as a form XObject on a new page:
  background rectangle, original page, patches (layered path). With `tint` the
  rectangle goes above the original page with `BlendMode.Multiply` instead; the
  thumbnails mirror it with a CSS `mix-blend-mode: multiply` overlay. The visible box is the
  CropBox clipped to the MediaBox, and the source `/Rotate` is kept.
- Pages are copied and embedded in one batch per source document; per-page calls would
  duplicate shared fonts and images.
- Patch coordinates are normalized to the page as pdf.js shows it (top-left origin,
  after the source rotation); `viewToPdf()` converts them.
- A layered page is a new page, so link annotations of the source page are not carried
  over (documented limit in the README).

### Project file

`engine/projectFile.ts` validates a `.sbstation` before it is loaded and repairs only
the legacy case of sizes of 0 or below. Writes are atomic in `ipc.ts`.

## Common changes

- **New base style:** add a `Preset` in `engine/presets.ts` (`base`, `overrides`, and
  `fontIds` for any extra font the overrides use). Check it with an export: zero raster
  images, selectable text.
- **New typeface:** add it to `FONT_CHOICES` in `engine/fonts.ts` with `?inline`
  WOFF2 imports so the hidden print window can embed it.
- **PDF typography:** edit `assets/sanbluedot-pdf.css`. Avoid blur shadows, filters
  and background images: Chromium may turn them into raster images.

## Known traps

- `pdf-lib` errors are compiled to ES5, so `instanceof EncryptedPDFError` is false.
  Match the error message instead (see `exportProject.ts`).
- Standard PDF fonts only encode WinAnsi. Validate text before `drawText`
  (`unsupportedPatchChars`).
- `printToPDF` never paints page margins; the export draws the paper color as a vector
  layer under the page.
- In `printToPDF` header and footer templates, generic `monospace` resolves to Times.
  Name real fonts (`Menlo, Consolas`).
- The `@fontsource` files are Latin subsets. Characters outside the subset fall back to
  another font; that is why code blocks use the bundled full Fira Code.

## Release checklist

1. `npm test`, `npm run lint`, `npm run build`.
2. Export checks: text stays selectable, `pdfimages -list` shows no images added to
   vector-only input, Letter and A4 keep their sizes, a box diagram keeps its right
   edges aligned, and item 10 of a numbered list prints whole.
3. Upgrade render-sensitive dependencies (Electron, pdf-lib, pdfjs, marked) only as the
   last step of a batch, and compare the same documents exported before and after.
4. Bump the version, update `CHANGELOG.md`, build installers once, smoke-launch the
   macOS app and test the Windows installer on Windows.
