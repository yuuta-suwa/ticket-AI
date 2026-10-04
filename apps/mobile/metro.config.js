const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ auto-detects pnpm/npm workspaces; the shared packages ship TypeScript sources and are transpiled by Metro.
const config = getDefaultConfig(__dirname);

// Web export is used only to render demo-data store-screenshot candidates; swap native-only modules for inert stubs there.
const WEB_STUBS = {
  'react-native-purchases': 'empty.js',
  'react-native-google-mobile-ads': 'empty.js',
  '@react-native-community/datetimepicker': 'datetimepicker.js',
};
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (platform === 'web' && WEB_STUBS[name]) return { type: 'sourceFile', filePath: path.join(__dirname, 'web-stubs', WEB_STUBS[name]) };
  return (upstream ?? ctx.resolveRequest)(ctx, name, platform);
};
module.exports = config;
