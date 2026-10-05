const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const artifactsDir = path.resolve(__dirname, '../web-ext-artifacts');
if (!fs.existsSync(artifactsDir)) {
    console.error(`❌ Artifacts directory not found: ${artifactsDir}. Run 'npm run build' first.`);
    process.exit(1);
}

const xpiFiles = fs.readdirSync(artifactsDir)
    .filter(f => f.endsWith('.xpi'))
    .map(f => ({
        name: f,
        path: path.join(artifactsDir, f),
        mtime: fs.statSync(path.join(artifactsDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

if (xpiFiles.length === 0) {
    console.error(`❌ No .xpi files found in ${artifactsDir}. Run 'npm run build' first.`);
    process.exit(1);
}

const targetXpi = xpiFiles[0].path;
console.log(`🔍 Linting latest built addon package: ${xpiFiles[0].name}`);

try {
    execSync(`npx web-ext lint --self-hosted -s "${targetXpi}"`, {
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_OPTIONS: '--max-old-space-size=4096'
        }
    });
} catch (err) {
    process.exit(err.status || 1);
}
