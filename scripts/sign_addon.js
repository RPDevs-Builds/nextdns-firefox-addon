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
    "web-ext-artifacts/**", "updates.json", "coverage/**", "coverage",
    ".amo-upload-uuid"
].map(p => `"${p}"`).join(' ');

const crypto = require('crypto');

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

    // Find newest signed xpi in web-ext-artifacts
    const artifactsDir = path.resolve(__dirname, '../web-ext-artifacts');
    if (fs.existsSync(artifactsDir)) {
        const xpis = fs.readdirSync(artifactsDir)
            .filter(f => f.endsWith('.xpi'))
            .map(f => ({ name: f, full: path.join(artifactsDir, f), mtime: fs.statSync(path.join(artifactsDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
            
        if (xpis.length > 0) {
            const signedFile = xpis[0].full;
            const fileBuf = fs.readFileSync(signedFile);
            const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
            console.log(`🔑 Signed Package: ${xpis[0].name}`);
            console.log(`🔐 SHA-256 Hash: sha256:${sha256}`);
            
            // Auto-update updates.json if present
            const updatesPath = path.resolve(__dirname, '../updates.json');
            const pkgPath = path.resolve(__dirname, '../package.json');
            if (fs.existsSync(updatesPath) && fs.existsSync(pkgPath)) {
                try {
                    const { version } = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    const updates = JSON.parse(fs.readFileSync(updatesPath, 'utf8'));
                    const addonId = '{56fda99b-4dd4-4a4a-a413-00ff1c2cffd8}';
                    if (updates.addons && updates.addons[addonId]) {
                        const target = updates.addons[addonId].updates.find(u => u.version === version);
                        if (target) {
                            target.update_hash = `sha256:${sha256}`;
                            fs.writeFileSync(updatesPath, JSON.stringify(updates, null, 2) + '\n');
                            console.log(`✅ updates.json updated with hash for v${version}`);
                        }
                    }
                } catch (e) {
                    console.warn("⚠️ Could not update updates.json with hash:", e.message);
                }
            }
        }
    }
} catch (err) {
    console.error("❌ Signing failed:", err.message);
    process.exit(err.status || 1);
}
