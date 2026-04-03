# zotero-getcitation

Zotero 7 extension that looks up citation counts for selected papers and writes a structured citation line into `Extra`.

현재 기능:

- Zotero `Preferences` 안에 `Get Citation` 설정 페이지 추가
- source priority order 설정 가능: `semanticscholar`, `crossref`, `inspire`
- Semantic Scholar API key를 local Zotero preference에서 수정 가능
- settings에서 `Export Log`로 최근 plugin log를 `.txt`로 저장 가능
- `Tools -> Update Citation Counts` 메뉴 추가
- item context menu에 `Update Citation Counts` 항목 추가
- item tree custom column `Citations` 등록
- `Semantic Scholar`, `Crossref`, `INSPIRE-HEP` 순차 fallback 지원
- 성공 시 기존 `Extra`의 비-citation 줄은 보존하고 citation metadata 줄만 갱신

저장되는 `Extra` 예시:

```text
123
Some existing note
```

## Quick Start

1. Build the plugin package:

   ```sh
   ./scripts/build.sh
   ```

2. Resolve the active Zotero profile and configured data directory from Zotero's own settings:

   ```sh
   ./scripts/zotero-env.sh
   ```

3. Install the plugin into the active Zotero profile in development mode:

   ```sh
   ./scripts/install-dev.sh
   ```

   This creates an extension proxy file in the active profile that points Zotero directly at this source directory.
   For local development it also sets `extensions.autoDisableScopes=0` in the active Zotero profile so the sideloaded source-proxy add-on is enabled automatically.

4. Run background runtime verification:

   ```sh
   ./scripts/verify-runtime.sh 30
   ```

   This launches Zotero in the background, verifies the add-on becomes active, and runs a dev-only self-test that:

   - finds a real regular item with a usable identifier
   - looks up citation data through the configured fallback sources
   - writes a citation line into `Extra`
   - restores the original `Extra` immediately after verification

5. Open Zotero preferences and configure:

   - `Get Citation`
   - source order, e.g. `semanticscholar,crossref,inspire`
   - Semantic Scholar API key if you want Semantic Scholar enabled

6. In Zotero, select one or more papers and run:

   - `Tools -> Update Citation Counts`
   - or right-click selected items -> `Update Citation Counts`

## Notes

- Tested against local Zotero `7.0.32`.
- No Semantic Scholar API key is committed in this repository. Enter your own key in Zotero preferences if you want Semantic Scholar enabled.
- Semantic Scholar matching is attempted in this order: `DOI -> PMID -> arXiv -> title search`.
- Crossref uses DOI only.
- INSPIRE-HEP uses DOI and arXiv identifiers.
- `scripts/zotero-env.sh` reads `profiles.ini` and the active Zotero `prefs.js` instead of hardcoding paths.
- Zotero `data directory` and Zotero `profile directory` are different; local plugin development uses the active `profile directory`.
- Runtime verification writes local marker prefs under `extensions.getcitation.*`, including startup/shutdown markers and `devSelfTest.*` results.
- In background mode, Zotero may not create a frontmost main window, so `lastMainWindowLoadAt` is informative only and is not required for the automated runtime pass.
