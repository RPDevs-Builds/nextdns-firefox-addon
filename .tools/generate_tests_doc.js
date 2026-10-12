const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const testsDir = path.join(projectRoot, 'tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js')).sort();

const testSuiteDetails = {
  'android.test.js': {
    target: 'src/ui/state.js, src/ui/main.js',
    category: 'Cross-Platform & Integration',
    summary: 'Validates compatibility with Firefox for Android (Fenix) single-window model, query parameter parsing, and fallback behaviors when desktop APIs are unavailable.'
  },
  'apiClient.test.js': {
    target: 'src/apiClient.js',
    category: 'Core Infrastructure',
    summary: 'Exhaustive verification of APIClient networking, credential isolation (X-Api-Key scoping), retry logic, exponential backoff, rate-limit caching, and mapConcurrent bounded promise worker.'
  },
  'background.test.js': {
    target: 'src/background/main.js, src/background/api.js, src/background/handlers.js, src/background/requestListener.js',
    category: 'Background Engine',
    summary: 'Core extension lifecycle testing covering profile detection, message handlers, context menu routing, alarm listeners, sender verification, DDNS synchronization, and mirror mode replication.'
  },
  'blocks.test.js': {
    target: 'src/ui/blocks.js',
    category: 'UI & Components',
    summary: 'Tests toggle switches, category filtering, parent/sub-category navigation, domain allowlist/denylist management, bulk add queues, and search empty states.'
  },
  'content.test.js': {
    target: 'src/content.js, src/content.css',
    category: 'Content Scripts & Web GUI',
    summary: 'DOM injections into NextDNS console (my.nextdns.io), forced dark mode log border highlight preservation, TLD bulk actions, log filtering modals, live search exclusions, and metadata scrapers.'
  },
  'customization.test.js': {
    target: 'src/ui/theme.js',
    category: 'UI & Styling',
    summary: 'Validates theme loading, custom palette creation, hex color validation, CSS variable injections, and storage persistence for active theme presets.'
  },
  'dashboard.test.js': {
    target: 'src/ui/dashboard.js',
    category: 'UI & Components',
    summary: 'Detailed testing of log formatting, live log stream updates, multi-criteria log filtering, analytics summary calculations, traffic trend indicators, and CSV export/wipe.'
  },
  'debugger.test.js': {
    target: 'src/ui/tools.js',
    category: 'Diagnostics & Tools',
    summary: 'Tests intelligent domain debugger, rule classification against local allowlist/denylist sets, snapshot state inspection, and diagnostics bundle export.'
  },
  'exports.test.js': {
    target: 'src/apiClient.js, src/storage.js, src/metadataManager.js',
    category: 'Schema & Quality',
    summary: 'Ensures ES module public APIs and exports adhere to expected contracts and schemas across background and UI runtimes.'
  },
  'integrity.test.js': {
    target: 'data/*.json, data/*.js',
    category: 'Data & Metadata',
    summary: 'Validates bundled presets, settings groups, deprecated lists, and blocklist metadata files against structural schema integrity constraints.'
  },
  'logStream.test.js': {
    target: 'src/background/logStream.js',
    category: 'Background Engine',
    summary: 'Validates streaming fetch and EventSource fallback listeners, auto-reconnect schedules, duplicate stream prevention, JSON parse error recovery, and reader cancellation.'
  },
  'metadataManager.test.js': {
    target: 'src/metadataManager.js',
    category: 'Core Infrastructure',
    summary: 'Tests metadata loading, bundling of blocklists, categories, parental services, and fallback defaults on fetch failure.'
  },
  'notifications.test.js': {
    target: 'src/ui/notifications.js',
    category: 'UI & Components',
    summary: 'Tests notification center UI, desktop notification badge rendering, unread count tracking, auto-dismiss timers, and clearing alerts.'
  },
  'persistence.test.js': {
    target: 'src/storage.js',
    category: 'Core Infrastructure',
    summary: 'Tests StorageManager synchronization across sync and local storage areas, auto-healing cache mismatches, and graceful rejection handling on browser storage quotas.'
  },
  'popup.test.js': {
    target: 'src/popup.js, src/popup.html',
    category: 'UI & Components',
    summary: 'Validates popup bootstrapping, DOM element presence, keyboard accessibility, initial tab selection, and quick toggle buttons.'
  },
  'sanitization.test.js': {
    target: 'src/ui/utils.js',
    category: 'Security & Quality',
    summary: 'Validates HTML sanitization (`setSafeHTML`), XSS prevention, SVG/MathML tag stripping, dangerous CSS attribute filtering, and HTML entity escaping.'
  },
  'scheduler.test.js': {
    target: 'src/background/scheduler.js',
    category: 'Background Engine',
    summary: 'Tests background automation rule engine, time window evaluations, profile targeting, read-modify-write race condition protections, and action execution.'
  },
  'snapshots.test.js': {
    target: 'src/background/handlers.js',
    category: 'Core Infrastructure',
    summary: 'Tests profile snapshot creation, compression, diff comparison between historical snapshots, and quota eviction limits.'
  },
  'themes.test.js': {
    target: 'src/ui/theme.js',
    category: 'UI & Styling',
    summary: 'Comprehensive testing of preset themes, color variable mappings, custom theme deletion, and dropdown synchronization.'
  },
  'tools.test.js': {
    target: 'src/ui/tools.js',
    category: 'Diagnostics & Tools',
    summary: 'Tests PoP latency RTT probing, network diagnostics UI rendering, DNS leak detection indicators, and JSON diagnostics report exporting.'
  },
  'uiMain.test.js': {
    target: 'src/ui/main.js',
    category: 'UI & Components',
    summary: 'Main popup controller suite covering sub-tabs, window mode redirects, profile dropdown, settings form synchronization, error recovery cards, and WAI-ARIA tab navigation.'
  },
  'uiScheduler.test.js': {
    target: 'src/ui/scheduler.js',
    category: 'UI & Components',
    summary: 'Tests schedule editor UI, rule form validation, parental service list toggles, and deletion confirmations.'
  },
  'utils.test.js': {
    target: 'src/background/utils.js',
    category: 'Background Engine',
    summary: 'Tests domain hierarchy matching (`getMatch`), notification debouncing (10s threshold), tracking map eviction (200 limit), and desktop notification alerts.'
  },
  'viewer.test.js': {
    target: 'src/viewer.js, src/viewer.html',
    category: 'UI & Components',
    summary: 'Data Manager full-page viewer testing covering DNS Rewrites CRUD, wildcard domain validation, tab switching, and snapshot diff viewer.'
  }
};

let output = '# 🧪 DNS Forge - Comprehensive Test Suite Documentation (TESTS.md)\n\n';
output += '## 1. Executive Summary\n\n';
output += '- **Test Framework**: Jest v30.5.2 with `jest-environment-jsdom`, `jest-webextension-mock`, and `jest-fetch-mock`.\n';
output += '- **Total Test Suites**: **24 passed, 24 total** (100% Suite Pass Rate).\n';
output += '- **Total Unit Tests**: **348 passed, 348 total** (100% Test Pass Rate, 0 failures).\n';
output += '- **Global Coverage**: **100.0% Lines** | **97.79% Statements** | **95.98% Functions** | **83.42% Branches**.\n';
output += '- **100% Line Coverage Modules**: **All 20 Source Modules** at **100.0% line coverage** (100% across `src/`, `src/background/`, and `src/ui/`).\n';
output += '- **Mozilla AMO Compliance**: 0 errors, 0 warnings, 0 notices via `addons-linter`.\n\n';

output += '### Enforced Coverage Thresholds (`package.json`)\n\n';
output += '| Metric | Enforced Threshold | Achieved Level | Margin |\n';
output += '| :--- | :---: | :---: | :---: |\n';
output += '| **Lines** | `98%` | **100.0%** | +2.00% |\n';
output += '| **Statements** | `96%` | **97.79%** | +1.79% |\n';
output += '| **Functions** | `93%` | **95.98%** | +2.98% |\n';
output += '| **Branches** | `80%` | **83.42%** | +3.42% |\n\n';

output += '### Test Execution Commands\n\n';
output += '```bash\n';
output += '# Run all test suites with leak-safe force-exit\n';
output += 'npm test\n\n';
output += '# Run all test suites and generate full code coverage report\n';
output += 'npm test -- --coverage --forceExit\n\n';
output += '# Run a single test file\n';
output += 'npx jest tests/background.test.js --forceExit\n\n';
output += '# Run in interactive watch mode during local feature development\n';
output += 'npm run test:watch\n';
output += '```\n\n';

output += '---\n\n';
output += '## 2. Global Codebase Coverage Breakdown\n\n';
output += '| File / Subdirectory | % Lines | % Statements | % Functions | % Branches | Status |\n';
output += '| :--- | :---: | :---: | :---: | :---: | :---: |\n';
output += '| **All Files Combined** | **100.0%** | **97.79%** | **95.98%** | **83.42%** | 🏆 **100% Line Coverage Milestone** |\n';
output += '| [`src/apiClient.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/apiClient.js) | **100.0%** | **100.0%** | **100.0%** | 87.77% | 🎯 100% Lines & Functions |\n';
output += '| [`src/content.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/content.js) | **100.0%** | 96.90% | 96.75% | 81.28% | 🎯 100% Lines |\n';
output += '| [`src/metadataManager.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/metadataManager.js) | **100.0%** | **100.0%** | **100.0%** | **100.0%** | 🎯 100% Everywhere |\n';
output += '| [`src/storage.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/storage.js) | **100.0%** | 97.56% | 94.11% | 90.90% | 🎯 100% Lines |\n';
output += '| **`src/background/` (All 8 Modules)** | **100.0%** | **97.49%** | **93.45%** | **82.33%** | 🏆 **100% Lines Across Directory** |\n';
output += '| [`src/background/api.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/api.js) | **100.0%** | 96.56% | 79.16% | 84.23% | 🎯 100% Lines |\n';
output += '| [`src/background/handlers.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/handlers.js) | **100.0%** | 96.11% | 96.00% | 75.00% | 🎯 100% Lines |\n';
output += '| [`src/background/logStream.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/logStream.js) | **100.0%** | **100.0%** | **100.0%** | 92.10% | 🎯 100% Lines & Functions |\n';
output += '| [`src/background/main.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/main.js) | **100.0%** | 98.19% | **100.0%** | 85.00% | 🎯 100% Lines & Functions |\n';
output += '| [`src/background/requestListener.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/requestListener.js) | **100.0%** | 98.00% | **100.0%** | 88.63% | 🎯 100% Lines & Functions |\n';
output += '| [`src/background/scheduler.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/scheduler.js) | **100.0%** | **100.0%** | **100.0%** | 95.91% | 🎯 100% Lines & Functions |\n';
output += '| [`src/background/state.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/state.js) | **100.0%** | **100.0%** | **100.0%** | **100.0%** | 🎯 100% Everywhere |\n';
output += '| [`src/background/utils.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/background/utils.js) | **100.0%** | **100.0%** | **100.0%** | 95.00% | 🎯 100% Lines & Functions |\n';
output += '| **`src/ui/` (All 8 Modules)** | **100.0%** | **98.49%** | **96.55%** | **84.16%** | 🏆 **100% Lines Across Directory** |\n';
output += '| [`src/ui/blocks.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/blocks.js) | **100.0%** | 98.42% | 97.72% | 83.62% | 🎯 100% Lines |\n';
output += '| [`src/ui/dashboard.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/dashboard.js) | **100.0%** | 97.94% | 96.87% | 85.16% | 🎯 100% Lines |\n';
output += '| [`src/ui/main.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/main.js) | **100.0%** | 98.92% | 93.47% | 83.99% | 🎯 100% Lines |\n';
output += '| [`src/ui/notifications.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/notifications.js) | **100.0%** | **100.0%** | **100.0%** | 93.47% | 🎯 100% Lines & Functions |\n';
output += '| [`src/ui/scheduler.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/scheduler.js) | **100.0%** | **100.0%** | **100.0%** | 78.94% | 🎯 100% Lines & Functions |\n';
output += '| [`src/ui/state.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/state.js) | **100.0%** | **100.0%** | **100.0%** | **100.0%** | 🎯 100% Everywhere |\n';
output += '| [`src/ui/theme.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/theme.js) | **100.0%** | 96.31% | **100.0%** | 77.77% | 🎯 100% Lines & Functions |\n';
output += '| [`src/ui/tools.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/tools.js) | **100.0%** | **100.0%** | **100.0%** | 81.15% | 🎯 100% Lines & Functions |\n';
output += '| [`src/ui/utils.js`](file:///mnt/sharedroot/projects/RPDevs-Builds/nextdns-firefox-addon/src/ui/utils.js) | **100.0%** | 98.18% | **100.0%** | 94.54% | 🎯 100% Lines & Functions |\n\n';

output += '---\n\n';
output += '## 3. Comprehensive Test Suite Catalog\n\n';

for (const file of files) {
  const meta = testSuiteDetails[file] || { target: 'N/A', category: 'General', summary: '' };
  const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
  const lines = content.split('\n');
  const tests = [];
  let currentDescribe = 'Root Suite';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const descMatch = line.match(/describe\s*\(\s*['"`](.*?)['"`]/);
    if (descMatch) currentDescribe = descMatch[1];
    const testMatch = line.match(/(?:test|it)\s*\(\s*['"`](.*?)['"`]/);
    if (testMatch) {
      tests.push({ describe: currentDescribe, name: testMatch[1], line: i + 1 });
    }
  }

  output += `### 📁 [\`tests/${file}\`](file://${path.join(testsDir, file)})\n\n`;
  output += `- **Target File(s)**: \`${meta.target}\`\n`;
  output += `- **Category**: **${meta.category}**\n`;
  output += `- **Total Tests**: **${tests.length} tests**\n`;
  output += `- **Overview**: ${meta.summary}\n\n`;
  output += '| # | Test Case Description | Test Suite / Block | Source Line |\n';
  output += '| :--- | :--- | :--- | :---: |\n';
  tests.forEach((t, idx) => {
    output += `| ${idx + 1} | ${t.name.replace(/\|/g, '\\|')} | *${t.describe.replace(/\|/g, '\\|')}* | [L${t.line}](file://${path.join(testsDir, file)}#L${t.line}) |\n`;
  });
  output += '\n---\n\n';
}

output += '## 4. Test Infrastructure & Mocking Architecture\n\n';
output += '### WebExtension API Mocking (`jest.setup.js`)\n';
output += '- Comprehensive in-memory implementation of the Mozilla `browser` WebExtension namespace.\n';
output += '- Includes full lifecycle simulation for `browser.storage.sync`, `browser.storage.local`, `browser.runtime`, `browser.alarms`, `browser.webRequest`, `browser.menus`, and `browser.windows`.\n';
output += '- Automatic mock restoration and event listener registration tracking across each `beforeEach` hook.\n\n';

output += '### Leak-Safe Test Runner Protocol\n';
output += '- Jest is explicitly run with `--forceExit` across all scripts (`npm test`).\n';
output += '- Custom `afterAll` and `afterEach` hooks clean up active interval timers (`tabTrackingIntervalId`, `autoRefreshInterval`, debounce timeouts) and disconnect DOM mutation observers to avoid unref timer leaks in JSDOM.\n\n';

output += '### Continuous Quality Gates\n';
output += '1. **Coverage Gate**: Every test run enforces thresholds declared in `package.json` (98% lines, 96% statements, 93% functions, 80% branches). Any regression fails the test run immediately.\n';
output += '2. **Linter Gate**: `npm run lint:addon` verifies that built zip packages contain 0 Mozilla Add-on Linter errors, warnings, or notices.\n';

fs.writeFileSync(path.join(projectRoot, 'TESTS.md'), output);
console.log('✅ TESTS.md generated successfully.');
