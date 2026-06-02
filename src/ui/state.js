/**
 * DNS Forge - UI State Management
 */

export const state = {
    activeProfile: null,
    cachedLogs: [],
    autoRefreshInterval: null,
    cachedListItems: [],
    isAutoRefreshDefault: false,
    isTabTrackingPaused: false,
    listsSynced: false,
    currentAllowlist: new Set(),
    currentDenylist: new Set(),
    hostnameAliases: {},
    blocksMeta: {
        blocklists: [], 
        parental_services: [], 
        tlds: [], 
        categories: [] 
    },
    activeBlocksSort: 'popularity',
    activeBlocksSubTab: 'security',
    lastBlocksData: null,
    activeTab: 'dashboard',
    activeThemeId: 'default-dark',
    savedThemes: {},
    notifications: []
};

export const PRESET_THEMES = {
    "OLED Black": { "--bg-main": "#000000", "--bg-panel": "#0a0a0a", "--border-color": "#1a1a1a", "--hover-bg": "#111111", "--text-main": "#ffffff", "--text-muted": "#888888" },
    "Dracula": { "--bg-main": "#282a36", "--bg-panel": "#44475a", "--border-color": "#6272a4", "--hover-bg": "#50fa7b20", "--text-main": "#f8f8f2", "--text-muted": "#bfbfbf" },
    "Nord": { "--bg-main": "#2e3440", "--bg-panel": "#3b4252", "--border-color": "#4c566a", "--hover-bg": "#434c5e", "--text-main": "#eceff4", "--text-muted": "#d8dee9" },
    "Solarized Dark": { "--bg-main": "#002b36", "--bg-panel": "#073642", "--border-color": "#586e75", "--hover-bg": "#073642", "--text-main": "#eee8d5", "--text-muted": "#839496" },
    "Gruvbox": { "--bg-main": "#282828", "--bg-panel": "#3c3836", "--border-color": "#504945", "--hover-bg": "#504945", "--text-main": "#ebdbb2", "--text-muted": "#a89984" }
};

export const THEME_VARS = ['bg-main', 'bg-panel', 'border-color', 'text-main', 'text-muted', 'hover-bg'];

export const urlParams = new URLSearchParams(window.location.search);
export const isPopoutMode = urlParams.get('mode') === 'popout';
export const isSidebarMode = urlParams.get('mode') === 'sidebar';
