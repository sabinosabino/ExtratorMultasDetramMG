# AGENTS.md

Brave/Chrome MV3 extension ("Extrair Detalhes das Infrações") that scrapes modals from a
specific internal web page and downloads them as a `.txt`.

## Build / run

- No build step, no package.json, no tests, no lint. Plain JS files.
- Load unpacked: `brave://extensions` → Developer mode → "Load unpacked" → select this directory.
- Reload the extension after every edit to `background.js` or `manifest.json`
  (MV3 service worker is not hot-reloaded).

## Gotchas

- `processarLinhas` runs in the **page context** via `chrome.scripting.executeScript({ func })`.
  It must be fully self-contained: it cannot reference `ID_BLOQUEADAS`, `gerarNome`,
  `mostrarBadge`, or anything else defined in background scope. Helpers it needs are
  declared inside `processarLinhas`.
- Page-specific selectors (will break if the target page changes):
  `button[id="abrir-modal"]`, `[data-ait]`, `.modal.show` / `.modal`, `.ait`,
  `.numero-placa`, `dl.row` with `dt`/`dd` pairs, `[data-dismiss="modal"]` (Bootstrap 4 style).
- Output separator is `========== AIT <id> ==========`. The modal count shown on the badge is
  derived by counting `/========== AIT/g` in `background.js:30` — keep both in sync if you
  change the format.
- Extraction relies on hardcoded `sleep()` delays (1000–3000 ms) between modals; a full run
  over many rows is intentionally slow. Do not remove them to "optimize" without verifying
  the page loads modals faster.
- Badge text is capped at 4 chars (`Math.min(total, 99)`); `setBadgeText` silently fails on
  some pages, which is why `mostrarBadge` swallows errors.
- URL scheme guard `ID_BLOQUEADAS` blocks `chrome:`, `brave:`, `about:`, etc. — internal
  pages have no DOM to scrape and `executeScript` would reject.

## Conventions

- Identifiers, user-facing strings, and manifest text are in **Portuguese**
  (`mostrarBadge`, `processarLinhas`, `extrairDados`, badge `"ERR"`/`"OPS"`). Keep new code
  consistent.
- Download uses a `data:text/plain` URL with `saveAs: false` (silent save to default
  Downloads dir); filename pattern `infracoes-<uuid>.txt`.
- Permissions are minimal and intentional: `scripting`, `downloads`, `<all_urls>`. Adding
  permissions triggers a re-review prompt for users — avoid unless required.
