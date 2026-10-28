<div align="center">

# Folio

**Read, edit and carry your Markdown documents without writing code.**

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Türkçe](https://img.shields.io/badge/lang-T%C3%BCrk%C3%A7e-red.svg)](README.tr.md)

[![Desktop validation](https://github.com/onurcankaraman/folio-markdown/actions/workflows/desktop.yml/badge.svg)](https://github.com/onurcankaraman/folio-markdown/actions/workflows/desktop.yml)
![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-45-47848F.svg?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)

[Features](#features) · [Getting started](#getting-started) · [Development](#development) · [Testing](#testing) · [Packaging](#packaging) · [Contributing](CONTRIBUTING.md)

![Folio desktop app](docs/screenshots/folio-packaged.png)

</div>

Folio is a local-first desktop Markdown reader and visual editor built with Electron, React and TypeScript. It works directly with files on your computer and needs no account or application server.

> [!NOTE]
> **Project status:** the desktop app works and local packages are produced for all three platforms. Full production acceptance is still open. Verified features and open items are tracked in the [delivery checklist](docs/TESLIMAT_KONTROLU.md) (Turkish).

## Table of contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Getting started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Packaging](#packaging)
- [MCP server](#mcp-server)
- [Data safety and privacy](#data-safety-and-privacy)
- [Portable data folder](#portable-data-folder)
- [Known limits](#known-limits)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Dependencies and license](#dependencies-and-license)

## Features

- **Four views:** read, edit visually, edit the real Markdown source, or split view.
- **Text formatting:** headings, bold, italic, strikethrough, lists, task lists, quotes and code blocks.
- **Tables:** add, delete, move and align rows and columns, paste TSV, and import or export CSV/TSV with a preview.
- **Images and links:** images from files or the clipboard, a relative assets folder and local links.
- **Math:** visual input with MathLive, sized matrices and determinants, a symbol and template palette, KaTeX rendering, LaTeX/MathML copy and offline SVG/PNG export with scale and transparency options.
- **Diagrams:** canvas or form based editing for 16 Mermaid diagram types with live preview, source view and SVG export.
- **Rich blocks:** footnotes, callouts, collapsible sections with a visual body editor and a YAML properties panel.
- **Tabs and sessions:** pinning, reordering, reopening closed tabs and restoring the last saved session.
- **Workspace:** folder tree, new file and folder, rename, move to trash and folder-wide search and replace.
- **Safe saving:** conflict detection against the real file, atomic save, three-way merge, recovery drafts and version history.
- **Encodings:** UTF-8 with or without BOM and UTF-16, an encoding picker for invalid UTF-8, and existing line endings are preserved.
- **Export:** PDF, standalone HTML with embedded fonts and ZIP with images. ZIP import checks paths, sizes, name collisions and CRC.
- **Interface:** Turkish and English UI, light, dark and system themes, zoom, focus mode and validated settings import with a preview.

This list covers the main features and does not claim every advanced option of each feature. See the delivery checklist for details, especially for advanced diagram options.

## Screenshots

| Light                                                  | Dark                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| ![Folio light theme](docs/screenshots/folio-light.png) | ![Folio dark theme](docs/screenshots/folio-dark.png) |

## Getting started

There is no signed public release yet. When a GitHub Actions run succeeds, platform packages can be downloaded from the **Artifacts** section of that run.

| Platform              | Output in `release/`                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| macOS (Apple Silicon) | `mac-arm64/Folio.app`, `Folio-<version>-mac-arm64.dmg` and a ZIP of the app |
| Windows x64           | Setup and Portable `.exe`                                                   |
| Linux x64             | AppImage and DEB                                                            |

> [!WARNING]
> Local packages are not signed with a publisher certificate and the macOS app is not notarized. Signed public distribution needs the publisher's own certificates. Do not turn off system security settings globally to open the app.

## Development

Node.js 24 or newer and npm are required. Clone the repository and install the locked versions:

```bash
git clone https://github.com/onurcankaraman/folio-markdown.git
cd folio-markdown
npm ci
npm run desktop
```

Interface preview only:

```bash
npm run dev
```

The browser preview does not have the desktop app's file access. Saving works as a file download, so use the Electron app for local folders, version history and file watching. The status bar shows this difference in the preview.

Run the production build locally:

```bash
npm run build
npm start
```

## Testing

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

The end-to-end command builds the production bundle first. Tests use temporary files and a separate Electron profile. The packaged macOS app can be checked as well:

```bash
node scripts/smoke-packaged.mjs
```

Details are in the [test report](docs/TEST_RAPORU.md) and math coverage is in the [math inventory](docs/MATEMATIK_DESTEGI.md) (both Turkish).

## Packaging

```bash
node scripts/icons.mjs
npm run package:mac
npm run package:win
npm run package:linux
node scripts/release-metadata.mjs
```

For another architecture use a target such as `npx electron-builder --mac --x64 --publish never`. Packages should be built on their own operating system. The GitHub Actions workflow has jobs for each platform and architecture and runs on `main` pushes, version tags and manual runs.

See the [release guide](docs/YAYINLAMA.md) (Turkish) for signing, notarization and update address setup.

## MCP server

Folio includes a local [MCP](https://modelcontextprotocol.io) server so AI assistants can work with the Markdown files in one folder using the same safe save rules as the app. It runs from a source checkout and is not part of the app packages.

```bash
npm ci
npm run build:main
node dist-electron/mcp.js /path/to/notes
```

Example client configuration:

```json
{
  "mcpServers": {
    "folio": {
      "command": "node",
      "args": ["/path/to/folio-markdown/dist-electron/mcp.js", "/path/to/notes"]
    }
  }
}
```

| Tool               | What it does                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| `list_documents`   | Lists Markdown files in the folder with their sizes                                  |
| `read_document`    | Returns the source, encoding and hash of one file                                    |
| `search_documents` | Plain text search with line numbers                                                  |
| `write_document`   | Creates a file, or replaces an existing one when `baseHash` matches the file on disk |

- Only `.md` and `.markdown` files inside the folder are available. Paths and symbolic links that point outside are rejected.
- Hidden folders, `node_modules`, `dist` and `release` are skipped, and files over 5 MiB are not read.
- Writes are atomic, keep the file's encoding and CRLF line endings, and refuse to overwrite a file that changed after it was read.

## Data safety and privacy

- The original source of the file is kept. Unchanged top-level blocks are never rewritten and changed blocks are generated in a controlled way. The whole document is never saved through a Markdown to HTML to Markdown round trip. Unrecognized content opens with its source preserved.
- Saving writes to a temporary file in the same folder, syncs it, checks the latest disk hash and then replaces the file atomically. If saving fails the document stays open. On file systems without OS-level conditional replace, a very small race window remains between the last check and the rename. Network file systems do not get local disk guarantees.
- Recovery drafts and real autosave are separate. Real autosave is off by default. Drafts are stored after 2 seconds of idle time, or every 10 seconds while typing. Drafts are plain text and are not encrypted by the app.
- Node access is disabled in the renderer, with sandbox and context isolation on. On desktop, diagrams are rendered in a separate unprivileged window that is closed on timeout. Documents never run code. Remote images are not loaded by default. Update checks never start a network request without a user action.

## Portable data folder

- The Windows portable package uses the `data/` folder next to itself.
- On macOS put `portable.json` next to the `.app`, and on Linux next to the executable, to turn on portable data mode. The file content can be `{}`.
- An `.app` extracted from a ZIP does not make settings portable by itself, the marker file is required.
- The `FOLIO_DATA_DIR` environment variable picks a custom data folder when there is no portable marker. Package tests use it to stay out of the user profile.
- If the data location is not writable, Folio offers to pick a folder or use a temporary session instead of silently switching to another profile.

Operating system temporary files and logs mean Folio does not claim to leave no trace at all.

## Known limits

| Area                 | Limit                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Local Markdown file  | 60 MiB to open. Performance targets for large documents are not fully verified yet.                               |
| Image                | 25 MiB per file                                                                                                   |
| Visual diagram model | 500 nodes, 1,000 edges or 2,000 data rows, and 256 KiB of source                                                  |
| Formula              | 32 KiB. Untrusted HTML and link commands are disabled.                                                            |
| ZIP import           | 100 MiB compressed, 500 MiB uncompressed and 10,000 files. Multi-part, ZIP64 and encrypted archives are rejected. |
| ZIP export           | 40 MiB total source and assets. Folio never silently produces an incomplete package.                              |
| Folder search        | 2,000 files and 50 MiB total, 5 MiB per file                                                                      |

## Project structure

```text
electron/          File access, saving, security, packaging, updates and platform bridge
src/core/          Markdown source preservation, diagram models, search and history
src/components/    Visual editors and document tools
src/App.tsx        App layout and document session coordination
tests/             Core, file, package and real user flow tests
build/             App and platform icons
scripts/           Icon, package check and release metadata generation
docs/              Delivery status, release guide and screenshots
```

## Documentation

| Document                                        | Language                               |
| ----------------------------------------------- | -------------------------------------- |
| [Contributing guide](CONTRIBUTING.md)           | English, [Turkish](CONTRIBUTING.tr.md) |
| [Delivery checklist](docs/TESLIMAT_KONTROLU.md) | Turkish                                |
| [Test report](docs/TEST_RAPORU.md)              | Turkish                                |
| [Math support](docs/MATEMATIK_DESTEGI.md)       | Turkish                                |
| [Release guide](docs/YAYINLAMA.md)              | Turkish                                |

## Dependencies and license

Third-party notices are generated with `node scripts/release-metadata.mjs` and license texts are bundled with app packages. Generated files are not committed. An open source license for the project's own source code has not been chosen yet.
