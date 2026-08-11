const { withGradleProperties } = require('expo/config-plugins');

const PROPERTY_KEY = 'AsyncStorage_db_size_in_MB';
const DATABASE_SIZE_MB = '24';

/**
 * 본문, 최근 정상본, 복원 전 백업을 함께 보관할 수 있도록 Android
 * AsyncStorage의 기본 6MB 한도를 안전한 범위에서 늘려요.
 */
module.exports = function withAsyncStorageDatabaseSize(config) {
  return withGradleProperties(config, (nextConfig) => {
    const existing = nextConfig.modResults.find(
      (entry) => entry.type === 'property' && entry.key === PROPERTY_KEY,
    );
    if (existing) {
      existing.value = DATABASE_SIZE_MB;
    } else {
      nextConfig.modResults.push({
        type: 'property',
        key: PROPERTY_KEY,
        value: DATABASE_SIZE_MB,
      });
    }
    return nextConfig;
  });
};
