# ProxyPaste

ProxyPaste types text into a visible remote console and transfers text in either direction through noVNC's clipboard control. It is an independent implementation inspired by [InsertText Pro](https://github.com/hnasheralneam/inserttext-pro/). No source from that repository is included.

## Choose a send method

- **Type · keystrokes** works with accessible canvas consoles. Set the character delay (start at 50 ms), then click **Type into console**. Reopen the popup to check progress or stop a running job.
- **Paste · remote clipboard** sends the entire text in one transfer request using noVNC's existing clipboard change handler. Click **Send to remote clipboard**, then use the guest application's **Paste** command. There is no typing delay, generated keystroke, or automatic paste shortcut. Delivery and insertion inside the guest cannot be confirmed by the extension.
- **Copy out** reads the current noVNC clipboard into the popup. First copy text inside the guest, choose **Copy out**, click **Read noVNC clipboard**, review the text, and click **Copy locally**. You can then paste into an application on your computer. Reading does not change your local clipboard; only the separate Copy locally click does. If the browser blocks that write, the popup selects the text for manual Ctrl+C or Command+C copying.

Copy out requires working guest clipboard sharing. It reads the value of noVNC's clipboard field, which can contain stale text or text previously sent from your computer. It cannot establish the value's origin or freshness. Some noVNC versions use native browser clipboard integration and do not keep that field synchronized; this implementation targets the clipboard-panel integration. It does not extract text from canvas pixels or provide OCR. A text-only VM's visible screen output cannot be copied through this feature.

Paste requires guest clipboard support; a text-only VM console cannot receive clipboard paste. Proxmox requires VNC clipboard configuration and SPICE guest tools for supported guests; see its [VNC clipboard documentation](https://github.com/proxmox/pve-docs/blob/master/qm.adoc#vnc-clipboard). If the noVNC clipboard control is missing or disabled, the popup explains the limitation and disables clipboard submission. The presence of that control does not prove guest support. You can always switch back to Type.

After updating an existing installation, reload both the extension and the console page before using the new mode.

The popup keeps one local draft containing only the current text box value, so accidental closure does not lose your edits. Every edit replaces that draft. Clearing the box or successfully submitting text removes it; failed submissions keep it for retry. Loading text with Copy out replaces the same draft. There is no history, saved mode, saved delay, timestamp, or browser sync.

## Build and install

ProxyPaste shares one typing engine across desktop Firefox, Chrome, Edge, and Safari. Chrome and Edge packages are ready for unpacked installation; Safari source must first be packaged on a Mac. Browser and real-console smoke tests are still required before release.

With Node.js 18 or later installed, run `npm run build` to generate `dist/firefox`, `dist/chrome`, `dist/edge`, and `dist/safari`. Firefox-specific manifest settings are included only in the Firefox build. On Windows PowerShell, use `npm.cmd` if the system blocks `npm.ps1`.

### Chrome and Edge

1. Run `npm run build`.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**, click **Load unpacked**, and select `dist/chrome` or `dist/edge`.
4. Open the remote console, click its canvas, then open ProxyPaste from the extensions toolbar. Enter text and choose **Type** or **Paste** as described above.

Use current desktop releases. Chrome and Edge use the same extension code and permissions; see [Microsoft's porting documentation](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension).

### Safari on macOS

The Safari ZIP contains web-extension source, not an installable Safari app. Safari requires Apple's packaging tools and an app wrapper. This Windows workspace cannot build, sign, or validate that app.

1. Run `npm run build`, then copy `dist/safari` to a Mac with Xcode installed (or extract `proxypaste-safari.zip` there).
2. Follow [Apple's Safari packaging guide](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari) to package that directory and create the containing app. The tool was previously named `safari-web-extension-converter`; use the tool and options supplied with your Xcode version. Review any compatibility warnings it reports.
3. Open the generated project in Xcode, configure its signing team, and build/run the macOS app target. For local development, enable Safari's extension development options and **Allow Unsigned Extensions** if required by your signing setup.
4. Enable ProxyPaste in **Safari > Settings > Extensions**, allow access to the console website when Safari asks, then open the console and use the toolbar popup.

Validate both send methods, popup reconnection, cancellation, and site permissions on Safari before distributing it. App Store distribution requires Apple's signing and submission process. iPhone and iPad support has not been validated.

### Firefox

Requires desktop Firefox 140 or later.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**, then select `extension/manifest.json` in this folder (or the packaged ZIP).
3. Open the remote console and click inside it. If it is embedded on another origin, open the console directly in its own tab.
4. Open ProxyPaste from Firefox's extensions menu, enter text, and choose **Type** or **Paste** as described above.
5. In Type mode, reopen the popup to view progress or stop. Typing continues while the popup is closed. Closing or navigating away from the console ends that page's job.

In Type mode, newlines send Enter and can execute commands immediately. Tabs send Tab. No extra Enter is appended. Paste mode preserves the original text, including line endings; the guest application determines what happens when you paste. Test with harmless text before sending commands.

Temporary installation ends when Firefox restarts. Permanent installation in standard Firefox requires a Mozilla-signed add-on; the included ZIP is an unsigned development package. See [Mozilla's installation documentation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Behavior and limits

- Detects accessible frames and prioritizes a running job, then the focused canvas, then a known noVNC canvas. With multiple consoles, open the intended console in its own tab.
- The current text box value is saved as one local draft in the popup's `localStorage`, replaced on every edit and removed when cleared or submitted successfully. No text history or other user data is saved, and text is not logged by ProxyPaste. Type mode holds submitted text in the content script until completion or cancellation. Paste mode places it in noVNC's clipboard field; noVNC and the guest may retain clipboard contents until replaced, and the console's own logging behavior applies. The console sends keystrokes or clipboard data to the remote machine.
- Requests `activeTab`, `scripting`, and `clipboardWrite`. Clipboard write access supports the explicit **Copy locally** action. It never reads your local system clipboard, requests blanket website access, or sends telemetry, and has no external dependencies. An extension update may require accepting the added clipboard-write permission.
- Type uses synthetic DOM keyboard events. It cannot create trusted operating-system keystrokes, bypass a console's event filtering, or type into browser UI. Typing progress counts dispatched characters, not acknowledged remote input. Paste requests transfer through the existing `#noVNC_clipboard_text` control and its `change` handler. Copy out reads that same field only on request and replaces the current text and draft, without including text in status polling. Copy locally writes the displayed text to your system clipboard, where it remains until replaced.
- Targets canvas consoles, not ordinary text fields or xterm.js terminals. Unicode support and keyboard layout behavior depend on the console and remote OS; punctuation assumes a US keyboard mapping. CRLF and CR become a single Enter; Unicode characters are kept intact.
- Browsers restrict injection on internal pages and certain protected websites. Cross-origin frames may need to be opened as their own tab to grant access via the toolbar action.

## Validation

Run `npm test` for typing-engine tests (key order, modifiers, line endings, Unicode, timing, cancellation, reinjection, disconnected canvases, and invalid input), clipboard transfer/read and unavailable-control checks, explicit local clipboard writing and manual-copy fallback, popup mode switching and failure handling using both API namespaces, single-draft recovery/clearing and storage errors, and browser build checks. These automated tests mock extension APIs; they do not replace browser integration tests.

For a browser smoke test, serve this folder (`python -m http.server 8765`), visit `http://localhost:8765/tests/console.html`, and send `Hello!`, punctuation, tabs, and multiline text. Start a longer typing job, close/reopen the popup, and stop it midway. Switch to Paste and verify a single clipboard request with the exact text and no additional keystrokes. Fill the fixture's mock clipboard field, choose Copy out, read it, and verify Copy locally by pasting into a local editor. Also test an empty field and rejected clipboard-write permission. Then test against your actual noVNC console and a guest with configured clipboard support; the fixture does not verify remote acceptance.

Package all four builds on Windows:

```powershell
npm.cmd run package
```

This writes `proxypaste-firefox.zip`, `proxypaste-chrome.zip`, `proxypaste-edge.zip`, and `proxypaste-safari.zip`. Extract Chrome/Edge ZIPs before using **Load unpacked**. The Safari ZIP is input for Apple's packaging tools. Load the Firefox ZIP with **Load Temporary Add-on** or submit it for Mozilla signing. These are development artifacts, not store-published releases. Packaging uses PowerShell's `Compress-Archive`; on other platforms use `npm run build` and ZIP the contents of each browser directory with `manifest.json` at the archive root.
