```markdown
# GEMINI.md — `addons-linter` Workflow and Execution Protocol

## 1. Integration Benefits
Executing the Mozilla `addons-linter` and analyzing its output provides the following systemic advantages:
* **AMO Compliance Verification:** Prevents submission rejections by preemptively validating against Add-ons.mozilla.org (AMO) automated review policies.
* **Manifest V3 Transitioning:** Identifies deprecated APIs and structural incompatibilities between Manifest V2 and V3 (e.g., background scripts vs. service workers, `webRequest` blocking vs. `declarativeNetRequest`).
* **Security Auditing:** Detects unsafe practices such as `eval()`, unsafe `innerHTML` assignments, remote script injections, and missing Content Security Policy (CSP) headers.
* **Cross-Browser Standardization:** Flags Firefox-specific or Chrome-specific namespace issues (`browser.*` vs `chrome.*`) and missing polyfills.

## 2. Command Structure
Use the following commands to trigger specific AI analysis paths for the linter output. When generating output, the linter should ideally be executed with the `--output=json` flag to provide structured data.

* `/lint:summary [path_or_output]` — Parses the linter output and provides a high-level aggregate count of errors, warnings, and notices grouped by category (Security, Compatibility, Manifest).
* `/lint:remediate [path_or_output]` — Analyzes all errors and warnings, outputting direct, copy-pasteable code replacements or `manifest.json` patches to resolve each flagged issue.
* `/lint:mv3-audit [path_or_output]` — Filters the linter output strictly for Manifest V3 compliance issues and generates a step-by-step migration path for the flagged components.
* `/lint:ci-report [path_or_output]` — Formats the linter output into a markdown-based CI/CD compliance report suitable for GitHub Actions or GitLab CI pull request comments.

## 3. Post-Processing Directives (Data Handling)
Upon receiving `addons-linter` data, the AI must automatically execute the following data processing pipeline unless explicitly constrained by a command:

### Phase 1: Triage and Categorization
1.  **Isolate Blockers:** Extract all `errors` (which block AMO submission) and prioritize them over `warnings` and `notices`.
2.  **Contextualize:** Map each error/warning code (e.g., `MANIFEST_ERROR`, `UNSAFE_VAR_ASSIGNMENT`) to its specific file path, line number, and column.

### Phase 2: Root Cause and Resolution Generation
1.  **API Mapping:** If a deprecated API is flagged, provide the immediate modern equivalent (e.g., mapping `browser.browserAction` to `browser.action`).
2.  **Security Mitigation:** For dynamic execution or XSS warnings, rewrite the flagged code utilizing safe DOM manipulation (`textContent`, `DOMParser`, or sanitized HTML).
3.  **Permission Least-Privilege:** If the linter flags excessive permissions, analyze the codebase to determine the minimum required `permissions` and `host_permissions` arrays, and output the optimized `manifest.json` block.

### Phase 3: Artifact Generation
1.  **Provide Diff/Patch:** Generate unified diffs or isolated code blocks demonstrating the necessary changes.
2.  **Validation Instructions:** State the command required to re-verify the fixes (e.g., `npx addons-linter ./ext-dir`).
3.  **Flag Unstudied Unknowns:** If the linter throws an undocumented error code or flags a pattern that contradicts current MDN documentation, explicitly flag this as an anomaly requiring manual Mozilla developer documentation review.

```
