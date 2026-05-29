module.exports = {
  ignoreFiles: [
    "tests/**",
    "node_modules/**",
    ".git/**",
    ".github/**",
    ".vscode/**",
    "package.json",
    "package-lock.json",
    "jest.setup.js",
    ".gitignore",
    "README.md",
    "CHANGELOG.md",
    ".gemini/**",
    "nextdns-manager.skill",
    "**/*.test.js"
  ],
  build: {
    overwriteDest: true
  }
};
