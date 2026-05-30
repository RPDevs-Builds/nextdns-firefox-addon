const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
    console.error("Usage: node scripts/bump_version.js <version>");
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
    }
});

// Update CHANGELOG.md
const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');
try {
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    const date = new Date().toISOString().split('T')[0];
    const newEntry = `## [${version}] - ${date}\n\n### Added\n- New version ${version}\n\n`;
    
    // Find the first occurrence of "## [" to insert before it
    const index = changelog.indexOf('## [');
    if (index !== -1) {
        changelog = changelog.slice(0, index) + newEntry + changelog.slice(index);
        fs.writeFileSync(changelogPath, changelog);
        console.log(`✅ CHANGELOG.md: Added entry for ${version}`);
    }
} catch (e) {
    console.warn("⚠️ Could not update CHANGELOG.md automatically.");
}
