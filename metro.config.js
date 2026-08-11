const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('node:path');

const config = getDefaultConfig(__dirname);
const distribution =
  process.env.ALARMPYO_DISTRIBUTION === 'play' ? 'play' : 'direct';
const updateScreenAlias = '@/distribution/app-update-screen';
const playUpdateScreen = resolve(
  __dirname,
  'src/features/update/play-app-update-screen.tsx',
);

if (distribution === 'play') {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === updateScreenAlias) {
      return { filePath: playUpdateScreen, type: 'sourceFile' };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
