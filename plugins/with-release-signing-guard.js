const { withAppBuildGradle } = require('expo/config-plugins');

const VARIABLES_MARKER = '// ALARMPYO_RELEASE_SIGNING_GUARD_VARIABLES';
const SIGNING_MARKER = '// ALARMPYO_RELEASE_SIGNING_GUARD_CONFIG';
const RELEASE_MARKER = '// ALARMPYO_RELEASE_SIGNING_GUARD_RELEASE';

module.exports = function withReleaseSigningGuard(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('AlarmPyo Android release signing guard requires Groovy build.gradle.');
    }

    let source = mod.modResults.contents;
    if (!source.includes(VARIABLES_MARKER)) {
      const jscFlavorPattern = /^(def jscFlavor = [^\r\n]+[\r\n]+)/m;
      if (!jscFlavorPattern.test(source)) {
        throw new Error('AlarmPyo release signing variables could not be inserted.');
      }
      source = source.replace(
        jscFlavorPattern,
        `$1
${VARIABLES_MARKER}
ext.alarmpyoReleaseStoreFileValue = findProperty('ALARMPYO_UPLOAD_STORE_FILE') ?: System.getenv('ALARMPYO_UPLOAD_STORE_FILE')
ext.alarmpyoReleaseStorePasswordValue = findProperty('ALARMPYO_UPLOAD_STORE_PASSWORD') ?: System.getenv('ALARMPYO_UPLOAD_STORE_PASSWORD')
ext.alarmpyoReleaseKeyAliasValue = findProperty('ALARMPYO_UPLOAD_KEY_ALIAS') ?: System.getenv('ALARMPYO_UPLOAD_KEY_ALIAS')
ext.alarmpyoReleaseKeyPasswordValue = findProperty('ALARMPYO_UPLOAD_KEY_PASSWORD') ?: System.getenv('ALARMPYO_UPLOAD_KEY_PASSWORD')
ext.alarmpyoHasExplicitReleaseSigningValue = [
    project.ext.alarmpyoReleaseStoreFileValue,
    project.ext.alarmpyoReleaseStorePasswordValue,
    project.ext.alarmpyoReleaseKeyAliasValue,
    project.ext.alarmpyoReleaseKeyPasswordValue
].every { value -> value != null && !value.toString().trim().isEmpty() }
ext.alarmpyoHasInjectedReleaseSigningValue = [
    'android.injected.signing.store.file',
    'android.injected.signing.store.password',
    'android.injected.signing.key.alias',
    'android.injected.signing.key.password'
].every { key -> project.hasProperty(key) }
ext.alarmpyoEasBuildValue = System.getenv('EAS_BUILD') == 'true'
ext.alarmpyoReleaseTaskRequestedValue = gradle.startParameter.taskNames.any { taskName ->
    taskName.toLowerCase().contains('release')
}
`,
      );
    }

    if (!source.includes(SIGNING_MARKER)) {
      const signingPattern =
        /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n        \}\n)(    \})/;
      if (!signingPattern.test(source)) {
        throw new Error('AlarmPyo release signing config could not be inserted.');
      }
      source = source.replace(
        signingPattern,
        `$1        ${SIGNING_MARKER}
        if (project.ext.alarmpyoHasExplicitReleaseSigningValue) {
            alarmpyoRelease {
                storeFile file(project.ext.alarmpyoReleaseStoreFileValue)
                storePassword project.ext.alarmpyoReleaseStorePasswordValue
                keyAlias project.ext.alarmpyoReleaseKeyAliasValue
                keyPassword project.ext.alarmpyoReleaseKeyPasswordValue
            }
        }
$2`,
      );
    }

    if (!source.includes(RELEASE_MARKER)) {
      const releaseDebugSigningPattern =
        /(release\s*\{[\s\S]*?)\n\s*signingConfig signingConfigs\.debug/;
      if (!releaseDebugSigningPattern.test(source)) {
        throw new Error('AlarmPyo release debug signing fallback could not be removed.');
      }
      source = source.replace(
        releaseDebugSigningPattern,
        `$1
            ${RELEASE_MARKER}
            if (project.ext.alarmpyoHasExplicitReleaseSigningValue) {
                signingConfig signingConfigs.alarmpyoRelease
            } else if (
                project.ext.alarmpyoReleaseTaskRequestedValue &&
                !project.ext.alarmpyoHasInjectedReleaseSigningValue &&
                !project.ext.alarmpyoEasBuildValue
            ) {
                throw new GradleException(
                    'Release signing credentials are required. Debug signing is never allowed for AlarmPyo release builds.'
                )
            }`,
      );
    }

    mod.modResults.contents = source;
    return mod;
  });
};
