var { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");

var GetCitationPrefs = {
  sourcePref: "extensions.getcitation.sourceOrder",
  apiKeyPref: "extensions.getcitation.semanticScholarApiKey",
  logPref: "extensions.getcitation.logBuffer",
  defaultSourceOrder: "semanticscholar,crossref,inspire",
  defaultApiKey: "",

  init() {
    document.getElementById("getcitation-source-order").value =
      Zotero.Prefs.get(this.sourcePref, true) || this.defaultSourceOrder;
    document.getElementById("getcitation-semantic-scholar-api-key").value =
      Zotero.Prefs.get(this.apiKeyPref, true) || this.defaultApiKey;
    this.setStatus("");
  },

  save() {
    const sourceOrder = document.getElementById("getcitation-source-order").value.trim().toLowerCase();
    const apiKey = document.getElementById("getcitation-semantic-scholar-api-key").value.trim();

    const validation = this.validateSourceOrder(sourceOrder);
    if (!validation.valid) {
      this.setStatus(validation.message, true);
      return;
    }

    Zotero.Prefs.set(this.sourcePref, validation.value, true);
    Zotero.Prefs.set(this.apiKeyPref, apiKey, true);
    this.setStatus("Saved.");
  },

  resetDefaults() {
    document.getElementById("getcitation-source-order").value = this.defaultSourceOrder;
    document.getElementById("getcitation-semantic-scholar-api-key").value = this.defaultApiKey;
    Zotero.Prefs.set(this.sourcePref, this.defaultSourceOrder, true);
    Zotero.Prefs.set(this.apiKeyPref, this.defaultApiKey, true);
    this.setStatus("Reset to defaults.");
  },

  async exportLog() {
    const exportText = this.buildExportText();
    let outputPath = "";
    let usedFallback = false;
    let pickerError = null;

    try {
      try {
        const fp = new FilePicker();
        fp.init(window, "Export Get Citation Log", fp.modeSave);
        fp.appendFilter("Text File", "*.txt");
        fp.defaultExtension = "txt";
        fp.defaultString = `getcitation-log-${this.timestampForFilename()}.txt`;

        const result = await fp.show();
        if (result !== fp.returnOK && result !== fp.returnReplace) {
          this.setStatus("Export cancelled.");
          return;
        }

        outputPath = fp.file;
      }
      catch (error) {
        pickerError = error;
      }

      if (!outputPath) {
        outputPath = this.getFallbackExportPath();
        usedFallback = true;
      }

      await Zotero.File.putContentsAsync(outputPath, exportText);
      this.setStatus(`Log exported to ${outputPath}`);
      this.showAlert(
        "Get Citation",
        usedFallback
          ? `Log exported to:\n${outputPath}\n\nThe file picker was unavailable, so a fallback location was used.`
          : `Log exported to:\n${outputPath}`
      );
    }
    catch (error) {
      this.setStatus(`Export failed: ${error?.message || error}`, true);
      this.showAlert(
        "Get Citation",
        `Log export failed.\n\n${error?.message || error}${pickerError ? `\n\nFile picker error: ${pickerError?.message || pickerError}` : ""}`
      );
    }
  },

  validateSourceOrder(raw) {
    const allowed = new Set(["semanticscholar", "crossref", "inspire"]);
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) {
      return { valid: false, message: "Enter at least one source." };
    }

    const seen = new Set();
    for (const part of parts) {
      if (!allowed.has(part)) {
        return { valid: false, message: `Unknown source: ${part}` };
      }
      if (seen.has(part)) {
        return { valid: false, message: `Duplicate source: ${part}` };
      }
      seen.add(part);
    }

    return { valid: true, value: parts.join(",") };
  },

  setStatus(message, isError = false) {
    const node = document.getElementById("getcitation-preferences-status");
    node.textContent = message;
    node.style.color = isError ? "#b00020" : "#0a7a2f";
  },

  buildExportText() {
    const apiKey = Zotero.Prefs.get(this.apiKeyPref, true) || this.defaultApiKey;
    const logEntries = this.getLogEntries();
    const metadata = [
      `exportedAt: ${new Date().toISOString()}`,
      `zoteroVersion: ${Zotero.version || "unknown"}`,
      `sourceOrder: ${Zotero.Prefs.get(this.sourcePref, true) || this.defaultSourceOrder}`,
      `semanticScholarApiKeyPresent: ${Boolean(apiKey)}`,
      `semanticScholarApiKeyMasked: ${this.maskApiKey(apiKey)}`,
      `lastStartupAt: ${this.getPref("extensions.getcitation.lastStartupAt")}`,
      `lastMainWindowLoadAt: ${this.getPref("extensions.getcitation.lastMainWindowLoadAt")}`,
      `lastShutdownAt: ${this.getPref("extensions.getcitation.lastShutdownAt")}`,
      `devSelfTest.status: ${this.getPref("extensions.getcitation.devSelfTest.status")}`,
      `devSelfTest.message: ${this.getPref("extensions.getcitation.devSelfTest.message")}`,
      `devSelfTest.itemKey: ${this.getPref("extensions.getcitation.devSelfTest.itemKey")}`,
      `devSelfTest.source: ${this.getPref("extensions.getcitation.devSelfTest.source")}`,
      `devSelfTest.count: ${this.getPref("extensions.getcitation.devSelfTest.count")}`,
      `devSelfTest.startedAt: ${this.getPref("extensions.getcitation.devSelfTest.startedAt")}`,
      `devSelfTest.finishedAt: ${this.getPref("extensions.getcitation.devSelfTest.finishedAt")}`
    ];

    const logLines = logEntries.length
      ? logEntries.map((entry) => this.formatLogEntry(entry))
      : ["<no plugin log entries recorded>"];

    return [
      "Get Citation Log Export",
      "",
      "[Metadata]",
      ...metadata,
      "",
      "[Recent Plugin Log]",
      ...logLines,
      ""
    ].join("\n");
  },

  getPref(name) {
    return Zotero.Prefs.get(name, true) || "";
  },

  getLogEntries() {
    const raw = Zotero.Prefs.get(this.logPref, true) || "";
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    catch (_error) {
      return [{ ts: new Date().toISOString(), level: "error", event: "log-parse-failed", details: {} }];
    }
  },

  formatLogEntry(entry) {
    const parts = [
      entry.ts || "",
      entry.level || "info",
      entry.event || "unknown"
    ];
    const detailEntries = Object.entries(entry.details || {});
    if (detailEntries.length) {
      parts.push(
        detailEntries
          .map(([key, value]) => `${key}=${value}`)
          .join(" ")
      );
    }
    return parts.join(" | ");
  },

  maskApiKey(value) {
    if (!value) {
      return "";
    }
    if (value.length < 8) {
      return "<short>";
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  },

  timestampForFilename() {
    return new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
  },

  getFallbackExportPath() {
    const fileName = `getcitation-log-${this.timestampForFilename()}.txt`;

    try {
      return PathUtils.join(Services.dirsvc.get("Desk", Ci.nsIFile).path, fileName);
    }
    catch (_error) {
      return PathUtils.join(Zotero.DataDirectory.dir, fileName);
    }
  },

  showAlert(title, message) {
    try {
      Services.prompt.alert(window, title, message);
    }
    catch (_error) {
    }
  }
};
