param(
  [switch]$CreateNativeProject
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$androidRoot = Join-Path $projectRoot 'android'
$gradleWrapper = Join-Path $androidRoot 'gradlew.bat'

if (-not (Test-Path -LiteralPath $gradleWrapper)) {
  if (-not $CreateNativeProject) {
    throw 'android/gradlew.bat가 없어요. -CreateNativeProject를 붙이면 Expo 네이티브 프로젝트를 만든 뒤 검사해요.'
  }
  Push-Location $projectRoot
  try {
    & npx.cmd expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw '안드로이드 네이티브 프로젝트를 만들지 못했어요.' }
  } finally {
    Pop-Location
  }
}

Push-Location $androidRoot
try {
  & $gradleWrapper ':alarmpyo-alarm:testDebugUnitTest' '--no-daemon'
  if ($LASTEXITCODE -ne 0) { throw 'AlarmPyo 알람 네이티브 단위 검사가 실패했어요.' }
} finally {
  Pop-Location
}
