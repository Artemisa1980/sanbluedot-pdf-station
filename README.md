# SANDY.SYSDEV v1.10.0 — retro pdf-station

**retro pdf-station** — a personal desktop PDF studio, built by Sandy E. Quintero.
Cross-platform app (Mac + Windows, single codebase) to compose, style and export PDF
documents that are **never rasterized**: everything that leaves this station is true
vector output, razor-sharp at any zoom — Adobe-grade selectable text.

> The UI is in Spanish by design (it is a personal working tool); the codebase,
> this README and the releases are in English.

New to the codebase? Start with [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): structure,
commands, invariants, tests and release rules. Changes per version are in
[CHANGELOG.md](CHANGELOG.md).

## What it does

- **Import PDFs** and pick page-by-page which sheets enter the master document.
  Imported pages are treated as *plates*: copied intact with `copyPages`, or embedded
  unchanged as a vector layer when they get a background, tint or patch — never
  re-rendered, never reflowed — the #1 way editors damage documents.
- **Write your own content** in Markdown or HTML. Own content is compiled to vector
  PDF through Chromium's print engine and **stays editable forever** — you edit the
  source and recompile, never the output.
- **Formulas** in Markdown documents: `$…$` inline and `$$` blocks render as real math
  (KaTeX → MathML at compile time), static and vector. Money such as `$200` stays text.
  HTML documents keep their dollar signs as written.
- **Live styling per document**: six base presets (sanbluedot retro dev-station ·
  Sage Orgánico · Crema Retro 80s · Noche Navy · Máquina de Escribir · Terminal Ámbar)
  plus granular control — 12 curated embedded typefaces, size, line height, text/paper
  colors, table headers. Each document records what its compiled PDF was made from;
  editing the text or the style **recompiles it automatically in any view**, a project
  saved mid-update recompiles when it opens, and export waits (or stays paused if an
  update fails), so the master document and the export never drift out of sync.
- **Diagrams that line up**: code blocks use the full Fira Code, so letters, box-drawing
  lines (`┌─┐│`), arrows (`→`) and symbols (`≠ √ ²`) share one font and one width.
- **Full-bleed colored paper**: dark/colored sheets are painted edge to edge with an
  automatic vector layer (Chromium never paints page margins — the station does).
- **Organize**: drag & drop, rotate, duplicate, delete; grid view or an Adobe-style
  continuous reader with a synced thumbnail rail and lazy rendering (smooth at 100+ pages).
- **Per-page aesthetics on imported PDFs**: background color layers and **patches**
  (colored rectangles with optional text that wraps inside the patch) — the original
  content is never rewritten. Pages that paint their own white sheet (Google Docs
  exports, letterheads) can be **tinted** instead: the color goes on top with the
  Multiply blend mode, so the white takes the color and black text stays black. Pages that carry their own rotation (`/Rotate`, common in
  scans) keep it.
- **Insert images** with one click: the editor generates the correctly encoded
  absolute `file://` URL for you (relative paths don't survive compilation).
- **Export** the whole master document to a single vector PDF — or convert just the
  current MD/HTML document straight to PDF from the editor (quick-convert).
- **Project files**: save everything as `.sbstation` (Cmd+S / Cmd+O) and resume later.
- **Work protection**: dirty-state tracking, unsaved-changes guards on open/close,
  a rotating recovery draft, and immediate editor-to-project sync.

The sanblueᵈᵒᵗ signature lives **inside each document's content** (masthead + footer
in the MD/HTML itself) — the app never injects it.

### Limits by design

- Patch text is drawn with the standard Helvetica font (WinAnsi): Latin letters with
  accents, ñ, ¿¡, € and typographic quotes work; symbols such as `→ ✓ ≥`, Greek letters
  and emoji do not. The patch editor names the unsupported characters before saving.
- PDFs protected with a permissions password cannot be exported by pdf-lib. The app
  rejects them at import with a message; remove the protection and import again.
- A page that gets a background, tint or patch is rebuilt as a vector layer, so its
  link annotations (clickable links, notes) are not carried into the export. Pages
  without those layers keep their links.

## Principles

1. **Never rasterize.** 2. **Own content stays editable forever.**
3. **Foreign PDFs are plates** — organized, layered, never rewritten.
4. **Zero distortion** — mixed page sizes coexist untouched. 5. **Offline & local** — nothing leaves the machine.

## Development

```bash
npm install
npm run dev        # electron-vite dev --watch (hot reload)
npm test           # page-state, project-schema, formulas and vector-export regression gate
npm run lint       # tsc --noEmit (web + node)
npm run build      # production bundle in out/
```

## Packaging

```bash
npm run dist:mac   # → release/sanblueᵈᵒᵗ pdf-station-<version>-arm64.dmg
npm run dist:win   # → release/ NSIS installer (run on Windows)
```

The app is not Apple-signed (personal use): on first launch, **right-click → Open**,
or System Settings → Privacy & Security → "Open Anyway".

## Stack

Electron 43 + electron-vite · React 19 + TypeScript · Tailwind 4 ·
pdf-lib (vector engine) · pdfjs-dist (on-screen thumbnails only) ·
marked (MD→HTML) · KaTeX (formulas → MathML) · 12 embedded typefaces — serif (Charter*,
Instrument Serif, Lora, Merriweather, IBM Plex Serif, Georgia*), sans (Outfit, Space
Grotesk, Inter, Helvetica*), mono (Fira Code, IBM Plex Mono) — all offline, embedded as
real vector glyphs in the PDF. (*system fonts)

## Structure

```
src/main/       window, IPC, htmlToPdf (vector printToPDF)
src/preload/    contextBridge bridge (window.station)
src/renderer/   React UI — components/ engine/ state/ assets/
src/shared/     data model types + base64
tests/          node:test regression suites
docs/           developer guide
```

## License

[MIT](LICENSE) — the code is free to use. The **sanblueᵈᵒᵗ** name, wordmark and brand
identity are not covered by the license. Fira Code is bundled under the SIL Open Font
License 1.1 ([src/renderer/src/assets/fonts/FiraCode-OFL.txt](src/renderer/src/assets/fonts/FiraCode-OFL.txt));
the other typefaces come from @fontsource packages under their own open-font licenses.

---
© 2026 Sandy E. Quintero — sanblueᵈᵒᵗ · retro dev-station
