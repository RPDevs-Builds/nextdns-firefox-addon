const fs = require('fs');
const path = require('path');
const jsdoc2md = require('jsdoc-to-markdown');

const ROOT_DIR = path.resolve(__dirname, '..');
const WIKI_DOCS_DIR = path.resolve(__dirname, '../.wiki/dns-forge.github.io/wiki/docs');

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Task A: Manifest Processing
console.log("📦 Processing manifest.json...");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
let manifestMd = `# Extension Architecture: Manifest

The \`manifest.json\` defines the core configuration, permissions, and background processes of DNS Forge.

## Core Metadata
| Property | Value |
| --- | --- |
| **Name** | ${manifest.name} |
| **Version** | ${manifest.version} |
| **Manifest Version** | ${manifest.manifest_version} |

## Security Permissions
The following permissions are required for the extension to operate correctly.

| Permission | Description |
| --- | --- |
${(manifest.permissions || []).map(p => `| \`${p}\` | Access required for core functionality. |`).join('\n')}
${(manifest.host_permissions || []).map(p => `| \`${p}\` | Host access for NextDNS API. |`).join('\n')}

## Background & Content Scripts
- **Background Scripts:** ${manifest.background?.scripts?.map(s => `\`${s}\``).join(', ') || 'None'}
- **Content Scripts:** ${manifest.content_scripts?.map(cs => cs.matches.join(', ')).join('; ') || 'None'}
`;

ensureDir(path.join(WIKI_DOCS_DIR, 'architecture'));
fs.writeFileSync(path.join(WIKI_DOCS_DIR, 'architecture/manifest.md'), manifestMd);

// Task B: Technical Reference Extraction
console.log("🔍 Extracting Technical Reference...");
const getFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .map(f => path.join(dir, f))
        .filter(f => fs.lstatSync(f).isFile() && f.endsWith('.js'));
};

const srcFiles = [
    ...getFiles(path.join(ROOT_DIR, 'src/background')),
    ...getFiles(path.join(ROOT_DIR, 'src/ui')),
    ...getFiles(path.join(ROOT_DIR, 'src/content')),
    ...getFiles(path.join(ROOT_DIR, 'src'))
];

srcFiles.forEach(fullPath => {
    const relativePath = path.relative(ROOT_DIR, fullPath);
    const fileName = path.basename(fullPath, '.js');
    
    // Skip if it's a directory or not a js file (already filtered but safe)
    if (!fullPath.endsWith('.js')) return;

    let doc = "";
    try {
        doc = jsdoc2md.renderSync({ files: fullPath });
    } catch (e) {
        console.error(`❌ Error parsing ${relativePath}:`, e.message);
    }

    const targetSubDir = path.dirname(relativePath.replace('src/', ''));
    const targetPath = path.join(WIKI_DOCS_DIR, 'reference', targetSubDir, `${fileName}.md`);
    
    ensureDir(path.dirname(targetPath));

    const frontmatter = `---
title: ${fileName}
description: Technical reference for ${relativePath}
---

`;

    if (!doc.trim()) {
        const placeholder = `# ${fileName}\n\nDocumentation for \`${relativePath}\` is generated automatically from source code. Currently, no JSDoc comments were found in this file.\n\n### Source Location\n\`${relativePath}\``;
        fs.writeFileSync(targetPath, frontmatter + placeholder);
    } else {
        fs.writeFileSync(targetPath, frontmatter + doc);
    }
});

console.log("✅ Wiki content generation complete.");
