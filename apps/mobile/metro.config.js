const { getDefaultConfig } = require('expo/metro-config');
// Expo SDK 52+ auto-detects pnpm/npm workspaces; the shared packages ship TypeScript sources and are transpiled by Metro.
module.exports = getDefaultConfig(__dirname);
