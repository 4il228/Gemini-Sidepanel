# AI Assistant SidePanel

> Chrome-расширение, интегрирующее Google Gemini в нативную боковую панель браузера с возможностью мгновенного скриншота любой вкладки.

A Chrome extension that embeds Google Gemini into the native side panel with one-click screenshot capture and paste.

---

## Features

- **Side Panel Integration** — Gemini runs inside Chrome's native `sidePanel`, always accessible alongside your tabs.
- **Alt+G Toggle** — Open/close the panel with a single keyboard shortcut.
- **One-Click Screenshot** — Capture the active tab and paste it directly into Gemini's prompt input.
- **Automatic Paste Engine** — No manual file uploads. The content script converts the screenshot to a `ClipboardEvent` and dispatches it into Gemini's DOM.
- **CSP / X-Frame-Options Bypass** — Uses `declarativeNetRequest` to strip security headers so Gemini loads seamlessly in the iframe.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Chrome Browser                      │
│                                                        │
│  ┌──────────┐   Alt+G    ┌─────────────────────────┐   │
│  │  Any Tab  │ ◄───────► │    sidePanel (Gemini)    │   │
│  │           │           │  ┌─────────────────────┐ │   │
│  │  Page     │           │  │  iframe              │ │   │
│  │  Content  │           │  │  gemini.google.com   │ │   │
│  │           │           │  │                     │ │   │
│  └─────┬─────┘           │  │  ┌─────────────────┐│ │   │
│        │                 │  │  │ FAB (Screenshot) ││ │   │
│        │ captureVisibleTab│  │  └─────────────────┘│ │   │
│        ▼                 │  └─────────────────────┘ │   │
│  ┌─────────────────┐     └─────────────────────────┘   │
│  │ Service Worker  │                                     │
│  │ ・CAPTURE_IPC   │                                     │
│  │ ・Toggle command│                                     │
│  └─────────────────┘                                     │
└────────────────────────────────────────────────────────┘
```

**Data flow on screenshot capture:**

1. User clicks the **FAB** (`sidepanel/sidepanel.js`)
2. `chrome.runtime.sendMessage({ action: "CAPTURE_ACTIVE_TAB" })` → Service Worker
3. `chrome.tabs.captureVisibleTab()` → returns base64 `dataUrl`
4. Side panel receives the data → `postMessage({ type: "INJECT_SCREENSHOT" })` → Gemini iframe
5. Content script (`scripts/gemini_content.js`) converts dataUrl → `File` → `ClipboardEvent("paste")` → Gemini's `<textarea>`

---

## Project Structure

```
.
├── manifest.json                  # Manifest V3 configuration
├── background/
│   └── service_worker.js          # Event-driven background script
├── sidepanel/
│   ├── sidepanel.html             # Side panel UI with iframe
│   ├── sidepanel.css              # Material Design 3 styles
│   └── sidepanel.js               # IPC orchestration & FAB logic
├── scripts/
│   └── gemini_content.js          # Content script — paste automation
├── rules/
│   └── net_request_rules.json     # DNR rules for CSP / XFO bypass
├── assets/
│   ├── icon16.png                 # Extension icon (16×16)
│   ├── icon48.png                 # Extension icon (48×48)
│   └── icon128.png                # Extension icon (128×128)
├── AGENTS.md                      # AI orchestration instructions
├── PLAN.md                        # Development plan (milestones)
└── SPEC.md                        # Technical specification
```

---

## Installation

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `GeminiSidebar` folder
5. Press **Alt+G** (Mac: `⌃Ctrl+G`) to open the side panel

> **Note:** `minimum_chrome_version` is set to **116** — sidePanel API and `declarativeNetRequest` with `modifyHeaders` require Chrome 116+.

---

## Usage

### Opening the panel

| Action | Shortcut |
|--------|----------|
| Toggle side panel | `Alt+G` (Windows/Linux) |
| | `^Ctrl+G` (Mac) |

### Taking a screenshot

1. Make sure you're on the tab you want to capture
2. Click the blue **camera FAB** (floating action button) at the bottom-right of the side panel
3. The screenshot appears in Gemini's prompt input — just press Enter to send

> The panel stays open while you capture. The screenshot is taken of the page behind it, without the panel itself.

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `sidePanel` | Open Gemini in Chrome's native side panel |
| `activeTab` | Capture visible tab via `captureVisibleTab` |
| `storage` | Persist panel state across sessions |
| `commands` | Register `Alt+G` keyboard shortcut |
| `declarativeNetRequest` | Remove CSP / X-Frame-Options headers for Gemini iframe |
| `https://gemini.google.com/*` | Host permission to inject content script and modify headers |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `chrome://` or WebStore tab | Button shows red error pulse for 1.5s |
| Gemini DOM changed | Content script retries 3×500ms with fallback selectors |
| Payload > 10 MB | Returns `ERR_PAYLOAD_TOO_LARGE` |
| No internet | Button enters disabled state (auto-recovery on reconnect) |

---

## Development

### Requirements

- Google Chrome **116+**
- No build tools required — pure HTML/CSS/JS

### Local development

1. Make changes to the source files
2. Go to `chrome://extensions` → click **Reload** on the extension card
3. Test the changes in the side panel

