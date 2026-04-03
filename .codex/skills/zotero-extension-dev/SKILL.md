---
name: zotero-extension-dev
description: Build, package, and verify the Zotero Get Citation extension in this repository. Use when working on this project's Zotero plugin code, preference pane, packaging, runtime checks, or citation-source integrations.
---

# Zotero Extension Dev

Use this skill for the `zotero-getcitation` repository.

## Goal

Keep a reliable loop for this Zotero 7 extension:

1. inspect real local files first
2. make the smallest safe code change
3. run syntax/build checks
4. verify the generated `.xpi`
5. prefer real Zotero runtime validation when practical

## Project Facts

- Main extension entrypoint: `bootstrap.js`
- Packaging script: `scripts/build.sh`
- Output artifact: `dist/getcitation-<version>.xpi`
- Preferences pane files:
  - `preferences.xhtml`
  - `preferences.js`
  - `prefs.js`
- Zotero app path on this machine:
  - `/Applications/Zotero.app`

## Default Workflow

1. Read current files before deciding:
   - `manifest.json`
   - `bootstrap.js`
   - `preferences.xhtml`
   - `preferences.js`
   - `prefs.js`
   - `README.md`

2. After edits, always run:

```sh
node --check bootstrap.js
./scripts/build.sh
unzip -l dist/getcitation-*.xpi
```

3. If packaging changed, confirm required files are inside the `.xpi`.

4. If Zotero UI behavior changed, prefer runtime verification in Zotero 7.

## Runtime Validation

Useful command:

```sh
/Applications/Zotero.app/Contents/MacOS/zotero -ZoteroDebugText
```

Check these areas when relevant:

- `Tools` menu injection
- item context menu injection
- Preferences pane registration
- custom column registration
- update flow on selected items
- `Extra` field write format

## Citation Source Rules

- Keep `Semantic Scholar API key` only in Zotero preferences, never hardcode it.
- Prefer source order from preferences instead of fixed source priority in code.
- Treat `Semantic Scholar`, `Crossref`, and `INSPIRE-HEP` as independent sources.
- If one source fails, continue to the next source unless the failure makes further lookup pointless.
- Preserve old non-citation `Extra` lines.

## Safety Rules

- Do not commit API keys, tokens, or machine-local secrets.
- Do not assume an external API still behaves the same; verify if needed.
- If an API returns `401`, `403`, or `429`, surface that clearly in UI or logs.

## Reference Repos

When comparing implementation patterns, the two strongest prior references already identified for this project are:

- `FrLars21/ZoteroCitationCountsManager`
- `daeh/zotero-citation-tally`

Reuse ideas, not large copied code blocks. Focus on:

- `PreferencePanes.register`
- `ItemTreeManager.registerColumn`
- multi-source fallback
- rate limiting
- `Extra` field citation-line handling

## Good Outcomes

- build passes
- `.xpi` contains the right files
- no secret is stored in repo
- Zotero settings page can configure source order and API key
- citation data can be updated from one or more sources without breaking existing item metadata
