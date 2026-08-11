import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { parseAndroidManifestMetadata } from '../read-apk-metadata.mjs';

describe('APK 앱 정보 읽기', () => {
  it('일반 XML 매니페스트의 패키지와 버전을 읽어요', () => {
    const xml = Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
      <manifest xmlns:android="http://schemas.android.com/apk/res/android"
        package="com.personal.alarmpyo"
        android:versionCode="1"
        android:versionName="1.0.0">
      </manifest>`);
    expect(parseAndroidManifestMetadata(xml)).toEqual({
      packageName: 'com.personal.alarmpyo',
      versionCode: 1,
      versionName: '1.0.0',
    });
  });

  it('버전 코드가 숫자가 아니면 안전하게 거부할 수 있는 값으로 반환해요', () => {
    const xml = Buffer.from(
      '<manifest package="com.personal.alarmpyo" versionCode="잘못됨" versionName="1.0.0" />',
    );
    expect(parseAndroidManifestMetadata(xml).versionCode).toBeNull();
  });
});
