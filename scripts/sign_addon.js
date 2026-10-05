const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Simple .env parser for local execution
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
        const match = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    });
}

const apiKey = process.env.AMO_JWT_ISSUER;
const apiSecret = process.env.AMO_JWT_SECRET;

if (!apiKey || !apiSecret) {
    console.error("❌ Missing AMO_JWT_ISSUER or AMO_JWT_SECRET. Set them in environment or .env file.");
    process.exit(1);
}

const ignorePatterns = [
    "tests/**", "tests", "scripts/**", "scripts", "node_modules/**",
    ".git/**", ".github/**", ".vscode/**", ".staging/**", ".staging",
    ".tools/**", ".tools", "package.json", "package-lock.json",
    "jest.setup.js", ".gitignore", "README.md", "CHANGELOG.md",
    "LICENSE", "AGENTS.md", "babel.config.json", ".gemini/**",
    "*.skill", "**/*.test.js", "*-results.json", "reports/**",
    "web-ext-artifacts/**", "updates.json"
].map(p => `"${p}"`).join(' ');

console.log("🚀 Submitting extension to Mozilla for automated signing (unlisted)...");

try {
    execSync(`npx web-ext sign --channel=unlisted --api-key="${apiKey}" --api-secret="${apiSecret}" --ignore-files ${ignorePatterns}`, {
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_OPTIONS: '--max-old-space-size=4096'
        }
    });
    console.log("✅ Successfully signed by Mozilla! Signed package is in web-ext-artifacts/");
} catch (err) {
    console.error("❌ Signing failed:", err.message);
    process.exit(err.status || 1);
}
