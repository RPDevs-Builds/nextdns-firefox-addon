const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
if (!version || !SEMVER_REGEX.test(version)) {
    console.error("Usage: node scripts/bump_version.js <valid-semver> (e.g. 1.5.1)");
    process.exit(1);
}

const files = [
    { name: 'package.json', path: path.resolve(__dirname, '../package.json') },
    { name: 'manifest.json', path: path.resolve(__dirname, '../manifest.json') }
];

files.forEach(file => {
    try {
        const content = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        const oldVersion = content.version;
        content.version = version;
        fs.writeFileSync(file.path, JSON.stringify(content, null, 2) + '\n');
        console.log(`✅ ${file.name}: ${oldVersion} -> ${version}`);
    } catch (e) {
        console.error(`❌ Error updating ${file.name}:`, e.message);
        process.exit(1);
    }
});

// Update package-lock.json
const lockPath = path.resolve(__dirname, '../package-lock.json');
try {
    if (fs.existsSync(lockPath)) {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const oldLockVer = lock.version;
        lock.version = version;
        if (lock.packages && lock.packages['']) {
            lock.packages[''].version = version;
        }
        fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
        console.log(`✅ package-lock.json: ${oldLockVer} -> ${version}`);
    }
} catch (e) {
    console.error("❌ Error updating package-lock.json:", e.message);
    process.exit(1);
}

// Update CHANGELOG.md
const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');
try {
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    if (!changelog.includes(`## [${version}]`)) {
        const date = new Date().toISOString().split('T')[0];
        const newEntry = `## [${version}] - ${date}\n\n### Added\n- New version ${version}\n\n`;
        
        // Find the first occurrence of "## [" to insert before it
        const index = changelog.indexOf('## [');
        if (index !== -1) {
            changelog = changelog.slice(0, index) + newEntry + changelog.slice(index);
            fs.writeFileSync(changelogPath, changelog);
            console.log(`✅ CHANGELOG.md: Added entry for ${version}`);
        }
    } else {
        console.log(`ℹ️ CHANGELOG.md: Entry for ${version} already present.`);
    }
} catch (e) {
    console.warn("⚠️ Could not update CHANGELOG.md automatically.");
}

