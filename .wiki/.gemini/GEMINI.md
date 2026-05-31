# Wiki Maintenance

To keep the wiki synchronized with the main extension code:

1. **Update Content:** Regenerate documentation from source:
   ```bash
   node .tools/generate-wiki-content.js
   ```
2. **Build:** Test the build locally:
   ```bash
   cd .wiki/dns-forge.github.io
   npm install
   npm run build
   ```
3. **Deployment:** Push changes to `DNS-Forge/dns-forge.github.io`.
