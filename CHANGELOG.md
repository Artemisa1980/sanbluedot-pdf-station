# Changelog

Earlier versions are described in the [GitHub Releases](https://github.com/Artemisa1980/sanbluedot-pdf-station/releases).

## 1.11.1

### Changed

- The header no longer shows the round logo image; the identity starts with
  `SANDY.SYSDEV`. The app icon in the Dock, installer and Windows is unchanged.

## 1.11.0 — unreleased

PDF output is unchanged: the same documents export byte-identical pages, sizes, fonts
and text as in 1.10.1.

### Fixed

- A recovery draft can no longer make Save write to a file the user never chose, and a
  failed Open no longer leaves that file as the save target.
- A damaged recovery draft is discarded instead of being offered again on every launch.
- A project page pointing past the end of its source is named in Spanish at export
  instead of failing with an internal error.
- A damaged previous compilation no longer blocks recompiling, and recompiling never
  brings back pages that were deleted on purpose.
- Two compilations of the same document finishing in a row no longer re-add deleted pages.
- Patch text with Windows line breaks or tabs no longer blocks the export.
- Delete, Backspace and Cmd+A no longer act on hidden pages while a dialog is open;
  Cmd+O and Cmd+S are ignored while a dialog is open; Esc closes only the top dialog.
- A second PDF in the import queue no longer inherits the first one's page selection,
  and the queue is emptied on Nuevo and Abrir.
- Nuevo and Abrir are refused with a message while an export is running.
- The reader and editor previews release page images that leave the screen; thumbnail
  memory is bounded by size, and thumbnails are keyed by the full page content, so a
  recompiled page never reuses the old image.
- Failed thumbnails, reader pages, previews, imports and dialogs show a Spanish message
  with a retry where it applies, instead of an endless placeholder or silence.
- A plain click on the page no longer erases the patch rectangle, and the patch size
  field accepts typing and stays within 6–72 pt.
- Shift-click selects from the first clicked page; empty project and document names
  fall back to "Sin título"; changing the base style asks before discarding edits.
- Compilation runs at most two hidden print windows at a time and fails at once if one
  crashes. The packaged app ignores the development server variable and also blocks
  `ftp:` requests.

### Accessibility

- Dialogs trap focus, close with Esc and return focus; page cards and source rows work
  from the keyboard (Alt+Arrow reorders a page); every icon button has a Spanish label;
  a shared focus ring; error notices stay until closed and are announced; the dark
  theme's danger color meets 4.5:1 contrast.

### Development

- Tests for the main-process rules, thumbnails and the new export cases (72 in total);
  the vector tests fail instead of skipping when `CI` is set without Poppler.
- The production build fails if its content-security policy still allows `localhost`.
- Renderer libraries are build-time dependencies: Vite already bundles them, so the
  installer no longer ships a second copy (the app archive drops from 92 MB to 5.5 MB).
- Electron 43.7.7 → 43.8.3 (patch release); export output verified identical.
- `npm run dist:win:zip` builds the portable Windows zip on Apple silicon.

## 1.10.1

### Fixed

- Code blocks and tables printed at a fixed 10pt and 10.5pt, larger than a 9–9.5pt
  body, and ignored the document's font size. Both now follow the body at 0.95 of its
  size (9pt for a 9.5pt body). Recompile a document to apply it.

## 1.10.0 — unreleased

### Added

- Formulas: `$…$` inline and `$$` blocks render as MathML with KaTeX at compile time.
  Money such as `$200` stays text and `\$` prints a dollar sign.
- Base styles **Máquina de Escribir** and **Terminal Ámbar**; **Sage Orgánico** redesigned
  with a warmer paper, forest-green ink, Lora body text and Instrument Serif headings.
- Twelve background swatches for imported PDF pages; the custom picker opens on the
  current color and the panel shows its hex code.
- **Teñir la hoja**: for PDFs that paint their own opaque white sheet (Google Docs,
  letterheads), the page color is drawn above the page with the Multiply blend mode, so
  the white takes the color and black text stays black. Thumbnails show the same tint,
  and the panel warns when a dark color would hide the text.
- Full Fira Code 6.2 (SIL OFL 1.1) bundled for the Fira typeface and every code block.

### Fixed

- Editing a document and exporting without ⚡ Compilar exported the previous text. Each
  document now records what its compiled PDF was made from; the text recompiles
  automatically and export waits for it. If an update fails, export stays paused with a
  message instead of using the previous PDF.
- A project saved during the update pause kept the new text with the previous PDF. Stale
  documents now recompile when the project opens; projects saved by earlier versions
  recompile their documents once.
- Opening a copy of the open project (same document ids) started a spurious update, and
  a late result could land in the other project.
- A PDF that the preview engine could not read left the page picker on «Leyendo el PDF…»
  and stayed cached as failed; the picker now closes with a message and the next attempt
  reloads it.
- A compilation that hangs now stops after two minutes with a message.
- Error messages from the main process no longer start with Electron's English
  «Error invoking remote method…» prefix.
- Box diagrams in code blocks mixed two fonts; letters, lines, arrows and symbols now
  share Fira Code.
- Item 10 and above of a numbered list was clipped.
- Page numbers printed in Times instead of a monospace font.
- A patch containing a character outside WinAnsi (`→ ✓ ≥`, emoji) made the whole export
  fail with an English error. The patch editor now names those characters, and the
  export reports them in Spanish.
- Long patch text ran outside the patch in the PDF; it now wraps and clips like the
  patch editor preview.
- Pages with their own `/Rotate` lost that rotation, and their patches moved, when they
  had a background or patches.
- PDFs protected with a permissions password imported fine and then failed at export;
  they are now rejected at import with a message. Damaged PDFs too.
- A compilation that finished after its document was deleted, or after Nuevo/Abrir,
  added hidden pages, and the saved project could not be reopened.
- Exports with many pages from one source grew by duplicating shared fonts and images.
- The CropBox was ignored on pages with a background or patches.
- A blank page without content stopped the export when it had a background or patch.
- Size fields accepted 0 or negative values; projects saved that way now open with the
  sizes repaired.
- A new notification could be closed early by the previous one's timer.
- A recovery-draft write in progress could survive a save and ask to restore later.
- Corrupt entries in My Styles are ignored instead of reaching a document.
- Thumbnails of pages turned 90° were cropped at the sides.

### Changed

- Electron 43.1.0 → 43.7.7 (security fixes). The same documents exported with both
  versions render identically.
- `esbuild` is declared as a development dependency (the tests use it), and
  `engines` requires Node 22.18 or newer for development.
- The packaged app's content-security policy no longer allows localhost connections
  (only the development server needs them); browser permission requests and
  `<webview>` are denied in every window.
- Formulas are documented as a Markdown feature; HTML documents keep dollar signs as
  written. Link annotations of pages with a background, tint or patch are documented
  as not carried into the export.
