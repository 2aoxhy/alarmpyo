import officialPatternManifest from '../../official-patterns/manifest.json';
import type { PatternShiftCode } from '../models/app-data';
import {
  isOfficialPatternId,
  type OfficialPatternId,
} from './official-pattern-ids';

export type OfficialPatternDefinition = {
  id: OfficialPatternId;
  fileName: string;
  name: string;
  author: string;
  sourceVersion: number;
  anchorDate: string;
  shiftCodes: PatternShiftCode[];
  createdAt: string;
};

export type OfficialPatternContractCandidate = {
  id: OfficialPatternId;
  name: string;
  author: string | null;
  sourceVersion: number;
  anchorDate: string;
  shiftCodes: PatternShiftCode[];
};

function buildDefinitions(): ReadonlyMap<OfficialPatternId, OfficialPatternDefinition> {
  if (
    officialPatternManifest.schemaVersion !== 1 ||
    officialPatternManifest.formatVersion !== 1 ||
    officialPatternManifest.keyId !== 'alarmpyo-official-patterns-v1' ||
    officialPatternManifest.patterns.length !== 3
  ) {
    throw new Error('공식 근무 패턴 manifest 계약이 올바르지 않습니다.');
  }
  const definitions = new Map<OfficialPatternId, OfficialPatternDefinition>();
  for (const raw of officialPatternManifest.patterns) {
    if (!isOfficialPatternId(raw.id) || definitions.has(raw.id)) {
      throw new Error('공식 근무 패턴 manifest의 ID가 올바르지 않습니다.');
    }
    definitions.set(raw.id, {
      ...raw,
      id: raw.id,
      shiftCodes: raw.shiftCodes as PatternShiftCode[],
    });
  }
  return definitions;
}

export const OFFICIAL_PATTERN_KEY_ID = officialPatternManifest.keyId;
export const OFFICIAL_PATTERN_DEFINITIONS = buildDefinitions();

/**
 * 서명 검증 뒤 저장한 공식 descriptor를 백업에서 다시 읽을 때 고정된 공개
 * 계약과 같은지 확인합니다. 이 함수는 새 파일의 서명 검증을 대신하지 않습니다.
 */
export function matchesOfficialPatternContract(
  candidate: OfficialPatternContractCandidate,
): boolean {
  const expected = OFFICIAL_PATTERN_DEFINITIONS.get(candidate.id);
  return Boolean(
    expected &&
      candidate.name.normalize('NFC') === expected.name &&
      candidate.author?.normalize('NFC') === expected.author &&
      candidate.sourceVersion === expected.sourceVersion &&
      candidate.anchorDate === expected.anchorDate &&
      candidate.shiftCodes.length === expected.shiftCodes.length &&
      candidate.shiftCodes.every((code, index) => code === expected.shiftCodes[index]),
  );
}
