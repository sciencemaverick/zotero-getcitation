const PLUGIN_NAME = "Get Citation";
const PREFS_PREFIX = "extensions.getcitation.";
const PREF_SOURCE_ORDER = `${PREFS_PREFIX}sourceOrder`;
const PREF_SEMANTIC_SCHOLAR_API_KEY = `${PREFS_PREFIX}semanticScholarApiKey`;
const PREF_LAST_STARTUP_AT = `${PREFS_PREFIX}lastStartupAt`;
const PREF_LAST_MAIN_WINDOW_LOAD_AT = `${PREFS_PREFIX}lastMainWindowLoadAt`;
const PREF_LAST_SHUTDOWN_AT = `${PREFS_PREFIX}lastShutdownAt`;
const PREF_LOG_BUFFER = `${PREFS_PREFIX}logBuffer`;
const PREF_DEV_SELF_TEST_ENABLED = `${PREFS_PREFIX}devSelfTest.enabled`;
const PREF_DEV_SELF_TEST_STATUS = `${PREFS_PREFIX}devSelfTest.status`;
const PREF_DEV_SELF_TEST_MESSAGE = `${PREFS_PREFIX}devSelfTest.message`;
const PREF_DEV_SELF_TEST_ITEM_KEY = `${PREFS_PREFIX}devSelfTest.itemKey`;
const PREF_DEV_SELF_TEST_SOURCE = `${PREFS_PREFIX}devSelfTest.source`;
const PREF_DEV_SELF_TEST_COUNT = `${PREFS_PREFIX}devSelfTest.count`;
const PREF_DEV_SELF_TEST_CITATION_LINE = `${PREFS_PREFIX}devSelfTest.citationLine`;
const PREF_DEV_SELF_TEST_STARTED_AT = `${PREFS_PREFIX}devSelfTest.startedAt`;
const PREF_DEV_SELF_TEST_FINISHED_AT = `${PREFS_PREFIX}devSelfTest.finishedAt`;
const PREF_PANE_ID = "getcitation-prefpane";

const MENU_IDS = {
  toolsSeparator: "getcitation-tools-separator",
  toolsUpdate: "getcitation-tools-update",
  toolsSettings: "getcitation-tools-settings",
  itemSeparator: "getcitation-item-separator",
  itemUpdate: "getcitation-item-update"
};

const COLUMN_DEFINITION = {
  dataKey: "citationCount",
  label: "Citations"
};

const SOURCE_DEFINITIONS = {
  semanticscholar: {
    key: "semanticscholar",
    label: "Semantic Scholar",
    baseDelay: 3000
  },
  crossref: {
    key: "crossref",
    label: "Crossref",
    baseDelay: 1000
  },
  inspire: {
    key: "inspire",
    label: "INSPIRE-HEP",
    baseDelay: 1000
  }
};

const CITATION_LINE_PATTERNS = [
  /^Citations:\s*\d+\s*\((Semantic Scholar|Crossref|INSPIRE-HEP)\)\s*\[\d{4}-\d{2}-\d{2}\]$/i,
  /^\d+\s+citations\s+\((Semantic Scholar|Crossref|INSPIRE-HEP|Semantic Scholar\/DOI|Semantic Scholar\/arXiv|Crossref\/DOI|Inspire\/DOI|Inspire\/arXiv)\)\s*\[\d{4}-\d{2}-\d{2}\]$/i,
  /^\d+$/i,
  /^Semantic Scholar Citation Count:\s*\d+$/i,
  /^Semantic Scholar Paper Id:\s*.+$/i,
  /^Semantic Scholar Last Updated:\s*.+$/i
];

let preferencePaneID = null;
let columnKey = null;
const LOG_LIMIT = 200;
const LOG_PREF_MAX_LENGTH = 60000;

const RateLimitManager = {
  multipliers: Object.create(null),
  lastRequestAt: Object.create(null),

  async wait(sourceKey) {
    const source = SOURCE_DEFINITIONS[sourceKey];
    const multiplier = this.multipliers[sourceKey] || 1;
    const delay = source.baseDelay * multiplier;
    const lastRequestAt = this.lastRequestAt[sourceKey] || 0;
    const waitFor = delay - (Date.now() - lastRequestAt);
    if (waitFor > 0) {
      await Zotero.Promise.delay(waitFor);
    }
    this.lastRequestAt[sourceKey] = Date.now();
  },

  onRateLimit(sourceKey) {
    const current = this.multipliers[sourceKey] || 1;
    this.multipliers[sourceKey] = Math.min(current * 1.5, 10);
  },

  onSuccess(sourceKey) {
    const current = this.multipliers[sourceKey] || 1;
    if (current > 1) {
      this.multipliers[sourceKey] = Math.max(current * 0.9, 1);
    }
  }
};

function install() {}

function uninstall() {}

async function startup(data, reason) {
  Zotero.debug(`[${PLUGIN_NAME}] startup: reason=${reason}`);
  Services.prefs.setStringPref(PREF_LAST_STARTUP_AT, new Date().toISOString());
  appendPluginLog("info", "startup", { reason, version: data.version });

  preferencePaneID = await Zotero.PreferencePanes.register({
    pluginID: data.id,
    id: PREF_PANE_ID,
    label: "Get Citation",
    src: "preferences.xhtml",
    scripts: ["preferences.js"]
  });

  columnKey = Zotero.ItemTreeManager.registerColumn({
    pluginID: data.id,
    dataKey: COLUMN_DEFINITION.dataKey,
    label: COLUMN_DEFINITION.label,
    width: "80",
    flex: 0,
    zoteroPersist: ["width", "ordinal", "hidden", "sortDirection"],
    dataProvider: (item) => getCitationCountForColumn(item)
  });

  for (const window of Zotero.getMainWindows()) {
    if (window?.ZoteroPane) {
      injectUI(window);
    }
  }

  void maybeRunDevSelfTest();
}

function shutdown(_data, reason) {
  Zotero.debug(`[${PLUGIN_NAME}] shutdown: reason=${reason}`);
  Services.prefs.setStringPref(PREF_LAST_SHUTDOWN_AT, new Date().toISOString());
  appendPluginLog("info", "shutdown", { reason });

  if (columnKey) {
    Zotero.ItemTreeManager.unregisterColumn(columnKey);
    columnKey = null;
  }

  if (preferencePaneID) {
    Zotero.PreferencePanes.unregister(preferencePaneID);
    preferencePaneID = null;
  }

  if (reason === APP_SHUTDOWN) {
    return;
  }

  for (const win of Zotero.getMainWindows()) {
    removeInjectedUI(win);
  }
}

function onMainWindowLoad({ window }) {
  Services.prefs.setStringPref(PREF_LAST_MAIN_WINDOW_LOAD_AT, new Date().toISOString());
  appendPluginLog("info", "main-window-load", {
    windowTitle: window?.document?.title || ""
  });
  injectUI(window);
}

function onMainWindowUnload({ window }) {
  appendPluginLog("info", "main-window-unload", {
    windowTitle: window?.document?.title || ""
  });
  removeInjectedUI(window);
}

async function maybeRunDevSelfTest() {
  if (!Services.prefs.getBoolPref(PREF_DEV_SELF_TEST_ENABLED, false)) {
    return;
  }

  Services.prefs.setBoolPref(PREF_DEV_SELF_TEST_ENABLED, false);
  appendPluginLog("info", "dev-self-test-started");
  setDevSelfTestResult({
    status: "running",
    message: "Searching for a testable Zotero item.",
    itemKey: "",
    source: "",
    count: "",
    citationLine: "",
    startedAt: new Date().toISOString(),
    finishedAt: ""
  });

  try {
    await Zotero.Promise.delay(1000);

    const item = await findSelfTestItem();
    if (!item) {
      setDevSelfTestResult({
        status: "failed",
        message: "No regular Zotero item with DOI, PMID, or arXiv identifier was found.",
        finishedAt: new Date().toISOString()
      });
      appendPluginLog("warn", "dev-self-test-no-item");
      return;
    }

    const previousExtra = item.getField("extra") || "";
    const result = await updateItemFromSources(item, getSourceOrder());
    if (!result.foundSource) {
      setDevSelfTestResult({
        status: "failed",
        message: `Lookup failed for item ${item.key}.`,
        itemKey: item.key,
        finishedAt: new Date().toISOString()
      });
      appendPluginLog("warn", "dev-self-test-lookup-failed", {
        itemKey: item.key
      });
      return;
    }

    const updatedExtra = item.getField("extra") || "";
    const citationLine = `${updatedExtra}`
      .split("\n")
      .find((line) => /^\d+$/.test(line.trim())) || "";

    if (updatedExtra !== previousExtra) {
      item.setField("extra", previousExtra);
      await item.saveTx();
    }

    setDevSelfTestResult({
      status: "passed",
      message: `Lookup succeeded for item ${item.key} via ${result.foundSource.label}.`,
      itemKey: item.key,
      source: result.foundSource.label,
      count: String(result.foundSource.count),
      citationLine,
      finishedAt: new Date().toISOString()
    });
    appendPluginLog("info", "dev-self-test-passed", {
      itemKey: item.key,
      source: result.foundSource.label,
      count: result.foundSource.count
    });
  }
  catch (error) {
    Zotero.logError(error);
    appendPluginLog("error", "dev-self-test-error", {
      message: error?.message || String(error)
    });
    setDevSelfTestResult({
      status: "failed",
      message: error?.message || String(error),
      finishedAt: new Date().toISOString()
    });
  }
}

async function findSelfTestItem() {
  const libraryID = Zotero.Libraries.userLibraryID;
  if (!libraryID) {
    return null;
  }

  const items = await Zotero.Items.getAll(libraryID, true, false, false);
  for (const item of items) {
    if (item?.isRegularItem?.() && getAllItemIdentifiers(item).length) {
      return item;
    }
  }

  return null;
}

function setDevSelfTestResult(fields) {
  const mappings = [
    [PREF_DEV_SELF_TEST_STATUS, fields.status],
    [PREF_DEV_SELF_TEST_MESSAGE, fields.message],
    [PREF_DEV_SELF_TEST_ITEM_KEY, fields.itemKey],
    [PREF_DEV_SELF_TEST_SOURCE, fields.source],
    [PREF_DEV_SELF_TEST_COUNT, fields.count],
    [PREF_DEV_SELF_TEST_CITATION_LINE, fields.citationLine],
    [PREF_DEV_SELF_TEST_STARTED_AT, fields.startedAt],
    [PREF_DEV_SELF_TEST_FINISHED_AT, fields.finishedAt]
  ];

  for (const [pref, value] of mappings) {
    if (value === undefined) {
      continue;
    }
    Services.prefs.setStringPref(pref, value || "");
  }
}

function injectUI(window) {
  const doc = window.document;

  const toolsPopup = doc.getElementById("menu_ToolsPopup");
  if (toolsPopup && !doc.getElementById(MENU_IDS.toolsUpdate)) {
    const separator = doc.createXULElement("menuseparator");
    separator.id = MENU_IDS.toolsSeparator;

    const updateItem = doc.createXULElement("menuitem");
    updateItem.id = MENU_IDS.toolsUpdate;
    updateItem.setAttribute("label", "Update Citation Counts");
    updateItem.addEventListener("command", () => void handleUpdateCommand(window));

    const settingsItem = doc.createXULElement("menuitem");
    settingsItem.id = MENU_IDS.toolsSettings;
    settingsItem.setAttribute("label", "Get Citation Settings...");
    settingsItem.addEventListener("command", () => {
      Zotero.Utilities.Internal.openPreferences(PREF_PANE_ID);
    });

    toolsPopup.append(separator, updateItem, settingsItem);
  }

  const itemMenu = doc.getElementById("zotero-itemmenu");
  if (itemMenu && !doc.getElementById(MENU_IDS.itemUpdate)) {
    const separator = doc.createXULElement("menuseparator");
    separator.id = MENU_IDS.itemSeparator;

    const updateItem = doc.createXULElement("menuitem");
    updateItem.id = MENU_IDS.itemUpdate;
    updateItem.setAttribute("label", "Update Citation Counts");
    updateItem.addEventListener("command", () => void handleUpdateCommand(window));

    itemMenu.append(separator, updateItem);
  }
}

function removeInjectedUI(window) {
  const doc = window.document;
  for (const id of Object.values(MENU_IDS)) {
    doc.getElementById(id)?.remove();
  }
}

async function handleUpdateCommand(window) {
  const items = getTargetItems(window);
  if (!items.length) {
    appendPluginLog("warn", "update-command-no-selection");
    Services.prompt.alert(
      window,
      PLUGIN_NAME,
      "Select at least one regular Zotero item or an attachment whose parent item is a paper."
    );
    return;
  }

  const sourceOrder = getSourceOrder();
  if (!sourceOrder.length) {
    appendPluginLog("warn", "update-command-invalid-source-order");
    Services.prompt.alert(
      window,
      PLUGIN_NAME,
      "No valid source order is configured. Open Get Citation Settings and save a source list such as semanticscholar,crossref,inspire."
    );
    return;
  }

  const progressWindow = new Zotero.ProgressWindow({ window, closeOnClick: true });
  progressWindow.changeHeadline("Updating citation counts");
  progressWindow.show();
  appendPluginLog("info", "update-command-started", {
    itemCount: items.length,
    sourceOrder
  });

  let updated = 0;
  let notFound = 0;
  let failed = 0;
  let skippedSemanticScholar = false;

  for (const item of items) {
    const title = item.getField("title") || `Item ${item.id}`;
    const itemProgress = new progressWindow.ItemProgress(item.getItemTypeIconName(), title);
    itemProgress.setProgress(20);

    try {
      const result = await updateItemFromSources(item, sourceOrder);
      if (!result.foundSource) {
        notFound++;
        if (result.skippedSources.includes("semanticscholar")) {
          skippedSemanticScholar = true;
        }
        itemProgress.setText(`${title} (not found)`);
        itemProgress.setError();
        appendPluginLog("warn", "item-update-not-found", {
          itemKey: item.key,
          itemID: item.id,
          title,
          skippedSources: result.skippedSources
        });
        continue;
      }

      updated++;
      if (result.skippedSources.includes("semanticscholar")) {
        skippedSemanticScholar = true;
      }
      itemProgress.setText(
        `${title} (${result.foundSource.count} via ${result.foundSource.label})`
      );
      itemProgress.setProgress(100);
      appendPluginLog("info", "item-update-success", {
        itemKey: item.key,
        itemID: item.id,
        title,
        source: result.foundSource.label,
        count: result.foundSource.count
      });
    }
    catch (error) {
      failed++;
      itemProgress.setText(`${title} (error)`);
      itemProgress.setError();
      Zotero.logError(error);
      appendPluginLog("error", "item-update-error", {
        itemKey: item.key,
        itemID: item.id,
        title,
        message: error?.message || String(error)
      });
    }
  }

  Zotero.ItemTreeManager.refreshColumns();

  const summaryLines = [
    `Processed ${items.length} item(s).`,
    `Updated: ${updated}`,
    `Not found: ${notFound}`,
    `Errors: ${failed}`
  ];

  if (skippedSemanticScholar) {
    summaryLines.push("Semantic Scholar was skipped for at least one item because no API key is configured.");
  }

  const summary = summaryLines.join("\n");
  appendPluginLog("info", "update-command-finished", {
    itemCount: items.length,
    updated,
    notFound,
    failed,
    skippedSemanticScholar
  });
  progressWindow.addDescription(summary);
  progressWindow.startCloseTimer(8000);
  Services.prompt.alert(window, PLUGIN_NAME, summary);
}

function getTargetItems(window) {
  const selected = window.ZoteroPane?.getSelectedItems?.() || [];
  const deduped = new Map();

  for (const item of selected) {
    let target = null;
    if (item?.isRegularItem?.()) {
      target = item;
    }
    else if (item?.isAttachment?.() && item.parentItem?.isRegularItem?.()) {
      target = item.parentItem;
    }

    if (target) {
      deduped.set(target.id, target);
    }
  }

  return Array.from(deduped.values());
}

function getSourceOrder() {
  const raw = Services.prefs.getStringPref(PREF_SOURCE_ORDER, "semanticscholar,crossref,inspire");
  const seen = new Set();
  const parsed = [];

  for (const part of raw.split(",")) {
    const key = part.trim().toLowerCase();
    if (!SOURCE_DEFINITIONS[key] || seen.has(key)) {
      continue;
    }
    seen.add(key);
    parsed.push(key);
  }

  return parsed;
}

async function updateItemFromSources(item, sourceOrder) {
  const skippedSources = [];

  for (const sourceKey of sourceOrder) {
    if (sourceKey === "semanticscholar" && !getSemanticScholarApiKey()) {
      skippedSources.push(sourceKey);
      appendPluginLog("warn", "source-skipped-no-api-key", {
        itemKey: item.key,
        source: sourceKey
      });
      continue;
    }

    appendPluginLog("info", "source-attempt", {
      itemKey: item.key,
      source: sourceKey
    });
    const result = await fetchCitationCountForSource(item, sourceKey);
    if (result.status === "success") {
      const foundSource = {
        key: sourceKey,
        label: SOURCE_DEFINITIONS[sourceKey].label,
        count: result.count
      };
      await writeCitationCount(item, foundSource);
      return { foundSource, skippedSources };
    }
    appendPluginLog("info", "source-result", {
      itemKey: item.key,
      source: sourceKey,
      status: result.status
    });
  }

  return { foundSource: null, skippedSources };
}

function getSemanticScholarApiKey() {
  return Services.prefs.getStringPref(PREF_SEMANTIC_SCHOLAR_API_KEY, "").trim();
}

async function fetchCitationCountForSource(item, sourceKey) {
  if (sourceKey === "semanticscholar") {
    return await fetchSemanticScholarCount(item);
  }
  if (sourceKey === "crossref") {
    return await fetchCrossrefCount(item);
  }
  if (sourceKey === "inspire") {
    return await fetchInspireCount(item);
  }
  return { status: "not_found" };
}

async function fetchSemanticScholarCount(item) {
  const apiKey = getSemanticScholarApiKey();
  if (!apiKey) {
    return { status: "skipped" };
  }

  const identifiers = getAllItemIdentifiers(item);
  if (!identifiers.length) {
    return { status: "not_found" };
  }

  for (const identifier of identifiers) {
    await RateLimitManager.wait("semanticscholar");

    let id = identifier.id;
    let prefix = "";

    if (identifier.type === "doi" && /arxiv\./i.test(id)) {
      const match = id.match(/arxiv\.(\d+\.\d+)/i);
      if (match) {
        id = match[1];
        prefix = "arXiv:";
      }
    }
    else if (identifier.type === "arxiv") {
      prefix = "arXiv:";
    }

    const response = await httpJSON(
      `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(prefix + id)}?fields=paperId,citationCount,title,year`,
      {
        Accept: "application/json",
        "x-api-key": apiKey
      }
    );

    if (response.status === 429) {
      RateLimitManager.onRateLimit("semanticscholar");
      appendPluginLog("warn", "semanticscholar-rate-limited", {
        itemKey: item.key,
        identifierType: identifier.type
      });
      return { status: "rate_limited" };
    }
    if (response.status === 401 || response.status === 403) {
      Zotero.warn(`[${PLUGIN_NAME}] Semantic Scholar rejected the configured API key.`);
      appendPluginLog("error", "semanticscholar-api-rejected", {
        itemKey: item.key,
        status: response.status,
        identifierType: identifier.type
      });
      return { status: "api_error" };
    }
    if (response.status === 404) {
      appendPluginLog("info", "semanticscholar-not-found", {
        itemKey: item.key,
        identifierType: identifier.type
      });
      continue;
    }
    if (response.status >= 200 && response.status < 300 && typeof response.json?.citationCount === "number") {
      RateLimitManager.onSuccess("semanticscholar");
      appendPluginLog("info", "semanticscholar-success", {
        itemKey: item.key,
        count: response.json.citationCount,
        identifierType: identifier.type
      });
      return { status: "success", count: response.json.citationCount };
    }
  }

  const titleMatch = await fetchSemanticScholarByTitle(item, apiKey);
  if (titleMatch.status === "success") {
    RateLimitManager.onSuccess("semanticscholar");
  }
  return titleMatch;
}

async function fetchSemanticScholarByTitle(item, apiKey) {
  const title = (item.getField("title") || "").trim();
  if (!title) {
    return { status: "not_found" };
  }

  await RateLimitManager.wait("semanticscholar");

  const response = await httpJSON(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=10&fields=title,year,citationCount`,
    {
      Accept: "application/json",
      "x-api-key": apiKey
    }
  );

  if (response.status === 429) {
    RateLimitManager.onRateLimit("semanticscholar");
    appendPluginLog("warn", "semanticscholar-title-rate-limited", {
      itemKey: item.key
    });
    return { status: "rate_limited" };
  }
  if (!(response.status >= 200 && response.status < 300)) {
    appendPluginLog("warn", "semanticscholar-title-failed", {
      itemKey: item.key,
      status: response.status
    });
    return { status: "not_found" };
  }

  const candidates = response.json?.data || [];
  const targetTitle = normalizeTitle(title);
  const targetYear = parseYear(item.getField("year"));

  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreTitleCandidate(targetTitle, targetYear, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best && bestScore >= 60 && typeof best.citationCount === "number") {
    appendPluginLog("info", "semanticscholar-title-success", {
      itemKey: item.key,
      count: best.citationCount,
      score: bestScore
    });
    return { status: "success", count: best.citationCount };
  }

  return { status: "not_found" };
}

async function fetchCrossrefCount(item) {
  const doi = getPreferredDOI(item);
  if (!doi || /arxiv\./i.test(doi)) {
    return { status: "not_found" };
  }

  await RateLimitManager.wait("crossref");

  const encodedDOI = encodeURIComponent(doi);
  const url = `https://api.crossref.org/works/${encodedDOI}/transform/application/vnd.citationstyles.csl+json`;
  let response = await httpJSON(url, { Accept: "application/json" });

  if (response.status === 429) {
    RateLimitManager.onRateLimit("crossref");
    appendPluginLog("warn", "crossref-rate-limited", {
      itemKey: item.key
    });
    return { status: "rate_limited" };
  }

  if (response.status === 404 || response.status >= 500 || !response.json) {
    response = await httpJSON(`https://doi.org/${encodedDOI}`, {
      Accept: "application/vnd.citationstyles.csl+json"
    });
  }

  if (response.status === 429) {
    RateLimitManager.onRateLimit("crossref");
    appendPluginLog("warn", "crossref-rate-limited", {
      itemKey: item.key,
      fallback: "doi.org"
    });
    return { status: "rate_limited" };
  }

  const count = response.json?.["is-referenced-by-count"];
  if (typeof count === "number") {
    RateLimitManager.onSuccess("crossref");
    appendPluginLog("info", "crossref-success", {
      itemKey: item.key,
      count
    });
    return { status: "success", count };
  }
  if (typeof count === "string" && /^\d+$/.test(count)) {
    RateLimitManager.onSuccess("crossref");
    appendPluginLog("info", "crossref-success", {
      itemKey: item.key,
      count: Number.parseInt(count, 10)
    });
    return { status: "success", count: Number.parseInt(count, 10) };
  }

  return { status: "not_found" };
}

async function fetchInspireCount(item) {
  const identifiers = getAllItemIdentifiers(item).filter(
    (identifier) => identifier.type === "doi" || identifier.type === "arxiv"
  );
  if (!identifiers.length) {
    return { status: "not_found" };
  }

  for (const identifier of identifiers) {
    await RateLimitManager.wait("inspire");

    const pathType = identifier.type === "doi" ? "dois" : "arxiv";
    const response = await httpJSON(
      `https://inspirehep.net/api/${pathType}/${encodeURIComponent(identifier.id)}`,
      { Accept: "application/json" }
    );

    if (response.status === 429) {
      RateLimitManager.onRateLimit("inspire");
      appendPluginLog("warn", "inspire-rate-limited", {
        itemKey: item.key,
        identifierType: identifier.type
      });
      return { status: "rate_limited" };
    }
    if (response.status === 404) {
      appendPluginLog("info", "inspire-not-found", {
        itemKey: item.key,
        identifierType: identifier.type
      });
      continue;
    }

    const count = response.json?.metadata?.citation_count;
    if (typeof count === "number") {
      RateLimitManager.onSuccess("inspire");
      appendPluginLog("info", "inspire-success", {
        itemKey: item.key,
        count,
        identifierType: identifier.type
      });
      return { status: "success", count };
    }
    if (typeof count === "string" && /^\d+$/.test(count)) {
      RateLimitManager.onSuccess("inspire");
      appendPluginLog("info", "inspire-success", {
        itemKey: item.key,
        count: Number.parseInt(count, 10),
        identifierType: identifier.type
      });
      return { status: "success", count: Number.parseInt(count, 10) };
    }
  }

  return { status: "not_found" };
}

function getPreferredDOI(item) {
  const extra = item.getField("extra") || "";
  const parsed = Zotero.Utilities.Internal.extractExtraFields(extra);
  return cleanIdentifier(item.getField("DOI") || parsed.fields?.get("DOI") || "");
}

function getAllItemIdentifiers(item) {
  const identifiers = [];
  const seen = new Set();

  const push = (type, id, source) => {
    const cleaned = cleanIdentifier(id);
    if (!cleaned) {
      return;
    }
    const dedupeKey = `${type}:${cleaned}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    identifiers.push({ type, id: cleaned, source });
  };

  const extra = item.getField("extra") || "";
  const parsedExtra = Zotero.Utilities.Internal.extractExtraFields(extra);
  const extraFields = parsedExtra.fields || new Map();

  push("doi", item.getField("DOI"), "DOI");
  push("doi", extraFields.get("DOI"), "Extra");
  push("pmid", extraFields.get("PMID"), "Extra");

  const arxivRegex = /(?:arxiv\.org\/abs\/|arxiv:)([a-z.-]+\/\d+|\d+\.\d+)/i;
  const reportNumber = item.getField("reportNumber") || "";
  const url = item.getField("url") || "";
  const callNumber = item.getField("callNumber") || "";

  for (const value of [extra, reportNumber, url, callNumber]) {
    const match = value.match(arxivRegex);
    if (match) {
      push("arxiv", match[1], "Metadata");
    }
  }

  return identifiers;
}

function cleanIdentifier(value) {
  return `${value || ""}`.trim();
}

async function writeCitationCount(item, sourceResult) {
  const currentExtra = item.getField("extra") || "";
  const keptLines = currentExtra
    .split("\n")
    .filter((line) => line && !CITATION_LINE_PATTERNS.some((pattern) => pattern.test(line)));

  const citationLine = `${sourceResult.count}`;
  item.setField("extra", [citationLine, ...keptLines].join("\n"));
  await item.saveTx();
}

function getCitationCountForColumn(item) {
  if (item.isAttachment?.() || item.isNote?.()) {
    return "";
  }

  const entries = parseCitationLines(item.getField("extra") || "");
  if (!entries.length) {
    return "";
  }

  const sourceOrder = getSourceOrder();
  for (const sourceKey of sourceOrder) {
    const label = SOURCE_DEFINITIONS[sourceKey].label.toLowerCase();
    const match = entries.find((entry) => entry.label.toLowerCase() === label);
    if (match) {
      return match.count;
    }
  }

  return entries[0].count;
}

function parseCitationLines(extra) {
  const entries = [];
  for (const line of `${extra || ""}`.split("\n")) {
    let match = line.match(/^Citations:\s*(\d+)\s*\(([^)]+)\)\s*\[(\d{4}-\d{2}-\d{2})\]$/i);
    if (!match) {
      match = line.match(/^(\d+)\s+citations\s+\(([^)]+)\)\s*\[(\d{4}-\d{2}-\d{2})\]$/i);
    }
    if (match) {
      entries.push({
        count: Number.parseInt(match[1], 10),
        label: match[2],
        date: match[3]
      });
      continue;
    }

    match = line.match(/^Semantic Scholar Citation Count:\s*(\d+)$/i);
    if (match) {
      entries.push({
        count: Number.parseInt(match[1], 10),
        label: "Semantic Scholar",
        date: null
      });
      continue;
    }

    match = line.match(/^(\d+)$/);
    if (match) {
      entries.push({
        count: Number.parseInt(match[1], 10),
        label: "Stored",
        date: null
      });
    }
  }

  return entries;
}

function normalizeTitle(value) {
  return `${value || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseYear(value) {
  const match = `${value || ""}`.match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function scoreTitleCandidate(targetTitle, targetYear, candidate) {
  const candidateTitle = normalizeTitle(candidate.title || "");
  if (!candidateTitle) {
    return 0;
  }

  let score = 0;
  if (candidateTitle === targetTitle) {
    score += 100;
  }
  else if (candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle)) {
    score += 70;
  }
  else {
    const targetWords = new Set(targetTitle.split(" ").filter(Boolean));
    const candidateWords = new Set(candidateTitle.split(" ").filter(Boolean));
    let overlap = 0;
    for (const word of targetWords) {
      if (candidateWords.has(word)) {
        overlap++;
      }
    }
    score += Math.round((overlap / Math.max(targetWords.size, 1)) * 50);
  }

  const candidateYear = parseYear(candidate.year);
  if (targetYear && candidateYear) {
    if (candidateYear === targetYear) {
      score += 15;
    }
    else if (Math.abs(candidateYear - targetYear) === 1) {
      score += 5;
    }
  }

  return score;
}

async function httpJSON(url, headers = {}) {
  const req = await Zotero.HTTP.request("GET", url, {
    headers: Object.assign(
      {
        Accept: "application/json",
        "User-Agent": `${PLUGIN_NAME}/0.1.0`
      },
      headers
    ),
    successCodes: false,
    timeout: 30000
  });

  let json = null;
  try {
    json = req.responseText ? JSON.parse(req.responseText) : null;
  }
  catch (_error) {}

  return { status: req.status, json, text: req.responseText };
}

function appendPluginLog(level, event, details = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      details: sanitizeLogDetails(details)
    };

    const entries = getPluginLogEntries();
    entries.push(entry);
    while (entries.length > LOG_LIMIT) {
      entries.shift();
    }

    let serialized = JSON.stringify(entries);
    while (serialized.length > LOG_PREF_MAX_LENGTH && entries.length > 1) {
      entries.shift();
      serialized = JSON.stringify(entries);
    }

    Services.prefs.setStringPref(PREF_LOG_BUFFER, serialized);
  }
  catch (error) {
    Zotero.logError(error);
  }
}

function getPluginLogEntries() {
  const raw = Services.prefs.getStringPref(PREF_LOG_BUFFER, "");
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }
  catch (_error) {
    return [];
  }
}

function sanitizeLogDetails(details) {
  const clean = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    clean[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  return clean;
}
