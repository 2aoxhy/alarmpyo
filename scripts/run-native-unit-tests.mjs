import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const isWindows = process.platform === 'win32';
const shouldCreateNativeProject = process.argv.includes('--prebuild');
const toolEnvironment = { ...process.env };
const bundledNpmRoot = resolve(dirname(process.execPath), 'node_modules', 'npm');
const bundledNpmCli = resolve(bundledNpmRoot, 'bin', 'npm-cli.js');
const bundledNpxCli = resolve(bundledNpmRoot, 'bin', 'npx-cli.js');
const environmentPathKey =
  Object.keys(toolEnvironment).find((key) => key.toLowerCase() === 'path') ??
  'PATH';
const removeOptions = {
  recursive: true,
  force: true,
  maxRetries: 8,
  retryDelay: 250,
};

export function parseJavaMajor(versionOutput) {
  const legacyMatch = versionOutput.match(/version\s+"1\.(\d+)/iu);
  if (legacyMatch) return Number(legacyMatch[1]);
  const currentMatch = versionOutput.match(/version\s+"(\d+)/iu);
  return currentMatch ? Number(currentMatch[1]) : undefined;
}

function validateJavaEnvironment() {
  const javaExecutable = toolEnvironment.JAVA_HOME
    ? resolve(
        toolEnvironment.JAVA_HOME,
        'bin',
        isWindows ? 'java.exe' : 'java',
      )
    : 'java';

  if (toolEnvironment.JAVA_HOME && !existsSync(javaExecutable)) {
    throw new Error(
      `JAVA_HOME에서 Java 실행 파일을 찾지 못했어요: ${javaExecutable}`,
    );
  }

  const result = spawnSync(javaExecutable, ['-version'], {
    cwd: root,
    env: toolEnvironment,
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(
      'JDK 17을 찾지 못했어요. JAVA_HOME을 JDK 17 설치 경로로 설정해 주세요.',
      { cause: result.error },
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Java 버전을 확인하지 못했어요. JAVA_HOME을 확인해 주세요. (종료 코드 ${result.status ?? 1})`,
    );
  }

  const versionOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const major = parseJavaMajor(versionOutput);
  if (major !== 17) {
    throw new Error(
      `Android 네이티브 검사에는 JDK 17이 필요해요. 현재 확인된 버전은 ${major ?? '알 수 없음'}이에요.`,
    );
  }
  console.log('JDK 17 사전 점검을 통과했어요.');
}

function validateAndroidSdkEnvironment() {
  const sdkRoot = toolEnvironment.ANDROID_HOME || toolEnvironment.ANDROID_SDK_ROOT;
  if (!sdkRoot) {
    throw new Error(
      'Android SDK를 찾지 못했어요. ANDROID_HOME 또는 ANDROID_SDK_ROOT를 설정해 주세요.',
    );
  }
  if (!existsSync(sdkRoot)) {
    throw new Error(`Android SDK 경로가 존재하지 않아요: ${sdkRoot}`);
  }

  const missingDirectories = ['build-tools', 'platform-tools', 'platforms'].filter(
    (directory) => !existsSync(resolve(sdkRoot, directory)),
  );
  if (missingDirectories.length > 0) {
    throw new Error(
      `Android SDK 구성 요소가 부족해요: ${missingDirectories.join(', ')}. SDK Manager에서 설치해 주세요.`,
    );
  }

  toolEnvironment.ANDROID_HOME = sdkRoot;
  toolEnvironment.ANDROID_SDK_ROOT = sdkRoot;
  console.log(`Android SDK 사전 점검을 통과했어요: ${sdkRoot}`);
}

const fallbackSdk = resolve(tmpdir(), 'alarmpyo-android-sdk');
if (!toolEnvironment.ANDROID_HOME && existsSync(fallbackSdk)) {
  toolEnvironment.ANDROID_HOME = fallbackSdk;
  toolEnvironment.ANDROID_SDK_ROOT = fallbackSdk;
}

if (!toolEnvironment.JAVA_HOME) {
  const fallbackJdkRoot = resolve(tmpdir(), 'alarmpyo-temurin17');
  const installedJdkRoots = [
    fallbackJdkRoot,
    resolve(toolEnvironment.GRADLE_USER_HOME || resolve(homedir(), '.gradle'), 'jdks'),
    ...(isWindows
      ? [
          resolve(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
          resolve(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
        ]
      : []),
  ];
  const fallbackJavaHome = installedJdkRoots
    .flatMap((jdkRoot) => {
      if (!existsSync(jdkRoot)) return [];
      return [
        jdkRoot,
        ...readdirSync(jdkRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /(?:jdk|temurin|adoptium)?.*17/iu.test(entry.name))
          .map((entry) => resolve(jdkRoot, entry.name)),
      ];
    })
    .find((directory) =>
      existsSync(resolve(directory, 'bin', isWindows ? 'java.exe' : 'java')),
    );
  if (fallbackJavaHome) {
    toolEnvironment.JAVA_HOME = fallbackJavaHome;
    toolEnvironment[environmentPathKey] = [
      dirname(process.execPath),
      resolve(fallbackJavaHome, 'bin'),
      toolEnvironment[environmentPathKey] ?? '',
    ]
      .filter(Boolean)
      .join(delimiter);
  }
}

if (
  process.env.EAS_BUILD_PLATFORM &&
  process.env.EAS_BUILD_PLATFORM !== 'android'
) {
  console.log('Android가 아닌 빌드에서는 AlarmPyo 네이티브 검사를 건너뛰어요.');
  process.exit(0);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: toolEnvironment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} 실행에 실패했어요.`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

function runNpm(args, cwd) {
  if (isWindows && existsSync(bundledNpmCli)) {
    run(process.execPath, [bundledNpmCli, ...args], cwd);
    return;
  }
  run('npm', args, cwd);
}

function runNpx(args, cwd) {
  if (isWindows && existsSync(bundledNpxCli)) {
    run(process.execPath, [bundledNpxCli, ...args], cwd);
    return;
  }
  run('npx', args, cwd);
}

function runGradleWrapper(wrapper, args, cwd) {
  const cachedGradle = findCachedGradle(wrapper);
  if (cachedGradle) {
    console.log('캐시된 Gradle 배포 파일로 네이티브 검사를 실행해요.');
    runGradleExecutable(cachedGradle, args, cwd);
    return;
  }

  runGradleExecutable(wrapper, args, cwd);
}

function runGradleExecutable(executable, args, cwd) {
  if (isWindows) {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', executable, ...args], cwd);
    return;
  }
  run(executable, args, cwd);
}

function findCachedGradle(wrapper) {
  const wrapperProperties = resolve(
    dirname(wrapper),
    'gradle',
    'wrapper',
    'gradle-wrapper.properties',
  );
  if (!existsSync(wrapperProperties)) return undefined;

  const properties = readFileSync(wrapperProperties, 'utf8');
  const version = properties.match(/gradle-([0-9.]+)-(?:bin|all)\.zip/iu)?.[1];
  if (!version) return undefined;

  const gradleUserHome =
    toolEnvironment.GRADLE_USER_HOME || resolve(homedir(), '.gradle');
  const distributionRoot = resolve(
    gradleUserHome,
    'wrapper',
    'dists',
    `gradle-${version}-bin`,
  );
  if (!existsSync(distributionRoot)) return undefined;

  for (const entry of readdirSync(distributionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const hashRoot = resolve(distributionRoot, entry.name);
    const readyMarker = resolve(hashRoot, `gradle-${version}-bin.zip.ok`);
    const executable = resolve(
      hashRoot,
      `gradle-${version}`,
      'bin',
      isWindows ? 'gradle.bat' : 'gradle',
    );
    if (existsSync(readyMarker) && existsSync(executable)) return executable;
  }

  return undefined;
}

function findMergedAppManifests(directory, depth = 0) {
  if (!existsSync(directory) || depth > 8) return [];
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findMergedAppManifests(entryPath, depth + 1));
    } else if (
      entry.name === 'AndroidManifest.xml' &&
      /merged_manifest/iu.test(entryPath)
    ) {
      matches.push(entryPath);
    }
  }
  return matches;
}

function validateMergedLocationPermissions(androidProjectRoot) {
  const candidates = findMergedAppManifests(
    resolve(androidProjectRoot, 'app', 'build', 'intermediates'),
  );
  const appManifest = candidates
    .map((path) => ({ path, contents: readFileSync(path, 'utf8') }))
    .find(({ contents }) =>
      /(?:android:name="\.MainActivity"|com\.personal\.alarmpyo\.MainActivity)/u.test(
        contents,
      ),
    );
  if (!appManifest) {
    throw new Error('병합된 Android 앱 Manifest를 찾지 못했어요.');
  }
  if (!appManifest.contents.includes('android.permission.ACCESS_COARSE_LOCATION')) {
    throw new Error('병합된 Android Manifest에 대략적 위치 권한이 없습니다.');
  }
  const prohibitedPermissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
  ];
  const leakedPermission = prohibitedPermissions.find((permission) =>
    appManifest.contents.includes(permission),
  );
  if (leakedPermission) {
    throw new Error(
      `병합된 Android Manifest에 허용하지 않은 위치 권한이 남았습니다: ${leakedPermission}`,
    );
  }
  console.log('병합된 Android Manifest의 대략적 위치 전용 권한을 확인했어요.');
}

function copyManagedProject(sourceRoot, destinationRoot) {
  rmSync(destinationRoot, removeOptions);
  mkdirSync(destinationRoot, { recursive: true });

  const excludedRootDirectories = new Set([
    '.expo',
    '.git',
    'android',
    'ios',
    'node_modules',
  ]);

  cpSync(sourceRoot, destinationRoot, {
    recursive: true,
    filter(sourcePath) {
      const sourceRelativePath = relative(sourceRoot, sourcePath);
      if (!sourceRelativePath) return true;

      const [rootSegment] = sourceRelativePath.split(/[\\/]/u);
      if (excludedRootDirectories.has(rootSegment)) return false;
      if (/^public[\\/]downloads(?:[\\/]|$)/u.test(sourceRelativePath)) {
        return false;
      }
      return !sourcePath.toLowerCase().endsWith('.apk');
    },
  });
}

function cleanupDirectory(directory, successMessage) {
  try {
    rmSync(directory, {
      ...removeOptions,
      maxRetries: 20,
      retryDelay: 500,
    });
    console.log(successMessage);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `임시 검사 폴더를 바로 정리하지 못했어요. 다음 검사에서 다시 정리해요. (${detail})`,
    );
  }
}

const needsAsciiWorkspace =
  isWindows && shouldCreateNativeProject && /[^\x00-\x7f]/u.test(root);
let executionRoot = root;
let temporaryProjectRoot;
let androidRoot;
let androidRootExistedAtStart = false;
let createdNativeProject = false;

try {
  validateJavaEnvironment();
  validateAndroidSdkEnvironment();

  if (needsAsciiWorkspace) {
    temporaryProjectRoot = mkdtempSync(resolve(tmpdir(), 'alarmpyo-native-test-'));
    console.log('한글 경로와 Gradle의 충돌을 피하려고 임시 영문 경로에서 검사해요.');
    copyManagedProject(root, temporaryProjectRoot);
    executionRoot = temporaryProjectRoot;
    runNpm(['ci', '--ignore-scripts'], executionRoot);
  }

  androidRoot = resolve(executionRoot, 'android');
  androidRootExistedAtStart = existsSync(androidRoot);
  const wrapper = resolve(androidRoot, isWindows ? 'gradlew.bat' : 'gradlew');

  if (!existsSync(wrapper)) {
    if (!shouldCreateNativeProject) {
      throw new Error(
        'Android 프로젝트가 준비되지 않았어요. --prebuild로 검사해 주세요.',
      );
    }
    if (androidRootExistedAtStart) {
      throw new Error(
        '기존 Android 폴더에 Gradle 실행 파일이 없어요. 폴더를 확인한 뒤 다시 검사해 주세요.',
      );
    }

    createdNativeProject = true;
    runNpx(
      ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'],
      executionRoot,
    );
  }

  const readyWrapper = resolve(
    androidRoot,
    isWindows ? 'gradlew.bat' : 'gradlew',
  );
  const gradleArguments = [
    ':alarmpyo-alarm:testDebugUnitTest',
    ':app:processDebugMainManifest',
    '--no-daemon',
  ];
  if (toolEnvironment.ALARMPYO_GRADLE_OFFLINE === '1') {
    gradleArguments.push('--offline');
  }
  runGradleWrapper(readyWrapper, gradleArguments, androidRoot);
  validateMergedLocationPermissions(androidRoot);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode =
    error && typeof error === 'object' && 'exitCode' in error
      ? Number(error.exitCode) || 1
      : 1;
} finally {
  if (temporaryProjectRoot) {
    cleanupDirectory(
      temporaryProjectRoot,
      '네이티브 검사에 사용한 임시 프로젝트를 정리했어요.',
    );
  } else if (
    createdNativeProject &&
    !androidRootExistedAtStart &&
    androidRoot &&
    existsSync(androidRoot)
  ) {
    cleanupDirectory(androidRoot, '검사용 Android 프로젝트를 정리했어요.');
  }
}
