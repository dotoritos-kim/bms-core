/**
 * BMS 스타일 Strategy 패턴
 *
 * 채널 매핑과 스타일 감지를 Strategy 객체로 캡슐화합니다.
 * - forward mapping (채널 → 컬럼): 파서/Notes 에서 사용
 * - reverse mapping (컬럼 → 채널): Writer 에서 사용
 * - score 함수: detectStyle 에서 스타일 자동 감지에 사용
 */

import type { ReverseChannelMapping } from '../../writer/types';

/** BMS 스타일 타입 (기존 BMSStyle 과 동일, 호환 유지) */
export type BMSStyleId = 'iidx' | 'keyboard' | 'pms';

/** 채널 통계 — 스타일 감지 점수 계산용 */
export interface ChannelStats {
  counts: Readonly<Record<string, number>>;
  has2P: boolean;
}

/**
 * 채널 스타일 Strategy 인터페이스
 *
 * 각 구현체(IIDX_STRATEGY, KEYBOARD_STRATEGY, PMS_STRATEGY)는
 * 이 인터페이스를 만족하며, detectStyle 에서 점수 기반으로 선택됩니다.
 */
export interface ChannelStyleStrategy {
  readonly id: BMSStyleId;
  /**
   * 이 전략이 주어진 채널 통계와 얼마나 부합하는지 점수(높을수록 우선)를 반환합니다.
   */
  readonly score: (stats: ChannelStats, playerHeader?: string) => number;
  /**
   * forward mapping: BMS 채널 문자열 → 컬럼 문자열
   * (파서/Notes 에서 사용)
   */
  readonly buildMapping: (mode: 'sp' | 'dp') => Readonly<Record<string, string>>;
  /**
   * reverse mapping: 컬럼 문자열 → BMS 채널 문자열
   * (Writer 에서 사용)
   */
  readonly buildReverseMapping: (mode: 'sp' | 'dp') => ReverseChannelMapping;
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼: 배열 쌍에서 Map<string,string> 생성
// ──────────────────────────────────────────────────────────────────────────────

function pairsToMap(pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

// ──────────────────────────────────────────────────────────────────────────────
// IIDX Strategy
// ──────────────────────────────────────────────────────────────────────────────

const IIDX_SP_PAIRS: [string, string][] = [
  ['11','1'],['12','2'],['13','3'],['14','4'],['15','5'],['16','SC'],['17','FZ'],['18','6'],['19','7'],
];
const IIDX_DP_EXTRA_PAIRS: [string, string][] = [
  ['21','8'],['22','9'],['23','10'],['24','11'],['25','12'],['26','SC2'],['27','FZ2'],['28','13'],['29','14'],
];

function buildIidxForward(mode: 'sp' | 'dp'): Readonly<Record<string, string>> {
  const sp: [string, string][] = [
    ...IIDX_SP_PAIRS,
    // invisible
    ['31','1'],['32','2'],['33','3'],['34','4'],['35','5'],['36','SC'],['37','FZ'],['38','6'],['39','7'],
    // landmine
    ['D1','1'],['D2','2'],['D3','3'],['D4','4'],['D5','5'],['D6','SC'],['D7','FZ'],['D8','6'],['D9','7'],
    // longnote
    ['51','1'],['52','2'],['53','3'],['54','4'],['55','5'],['56','SC'],['57','FZ'],['58','6'],['59','7'],
  ];
  if (mode === 'dp') {
    const dp2P: [string, string][] = [
      ...IIDX_DP_EXTRA_PAIRS,
      ['41','8'],['42','9'],['43','10'],['44','11'],['45','12'],['46','SC2'],['47','FZ2'],['48','13'],['49','14'],
      ['E1','8'],['E2','9'],['E3','10'],['E4','11'],['E5','12'],['E6','SC2'],['E7','FZ2'],['E8','13'],['E9','14'],
      ['61','8'],['62','9'],['63','10'],['64','11'],['65','12'],['66','SC2'],['67','FZ2'],['68','13'],['69','14'],
    ];
    return Object.fromEntries([...sp, ...dp2P]);
  }
  return Object.fromEntries(sp);
}

function buildIidxReverse(mode: 'sp' | 'dp'): ReverseChannelMapping {
  const spPlayable: [string, string][] = [
    ['1','11'],['2','12'],['3','13'],['4','14'],['5','15'],['SC','16'],['FZ','17'],['6','18'],['7','19'],
  ];
  const spInvisible: [string, string][] = [
    ['1','31'],['2','32'],['3','33'],['4','34'],['5','35'],['SC','36'],['FZ','37'],['6','38'],['7','39'],
  ];
  const spLandmine: [string, string][] = [
    ['1','D1'],['2','D2'],['3','D3'],['4','D4'],['5','D5'],['SC','D6'],['FZ','D7'],['6','D8'],['7','D9'],
  ];
  const spLongNote: [string, string][] = [
    ['1','51'],['2','52'],['3','53'],['4','54'],['5','55'],['SC','56'],['FZ','57'],['6','58'],['7','59'],
  ];

  if (mode === 'dp') {
    const dp2P: [string, string][] = [
      ['8','21'],['9','22'],['10','23'],['11','24'],['12','25'],['SC2','26'],['FZ2','27'],['13','28'],['14','29'],
    ];
    const dpInv2P: [string, string][] = [
      ['8','41'],['9','42'],['10','43'],['11','44'],['12','45'],['SC2','46'],['FZ2','47'],['13','48'],['14','49'],
    ];
    const dpLm2P: [string, string][] = [
      ['8','E1'],['9','E2'],['10','E3'],['11','E4'],['12','E5'],['SC2','E6'],['FZ2','E7'],['13','E8'],['14','E9'],
    ];
    const dpLn2P: [string, string][] = [
      ['8','61'],['9','62'],['10','63'],['11','64'],['12','65'],['SC2','66'],['FZ2','67'],['13','68'],['14','69'],
    ];
    return {
      playable: pairsToMap([...spPlayable, ...dp2P]),
      invisible: pairsToMap([...spInvisible, ...dpInv2P]),
      landmine: pairsToMap([...spLandmine, ...dpLm2P]),
      longNote: pairsToMap([...spLongNote, ...dpLn2P]),
    };
  }
  return {
    playable: pairsToMap(spPlayable),
    invisible: pairsToMap(spInvisible),
    landmine: pairsToMap(spLandmine),
    longNote: pairsToMap(spLongNote),
  };
}

export const IIDX_STRATEGY: ChannelStyleStrategy = {
  id: 'iidx',
  score(stats, playerHeader) {
    const { counts } = stats;
    const ch18 = (counts['18'] || 0) + (counts['38'] || 0) + (counts['58'] || 0);
    const ch19 = (counts['19'] || 0) + (counts['39'] || 0) + (counts['59'] || 0);
    const ch17 = (counts['17'] || 0) + (counts['37'] || 0) + (counts['57'] || 0);
    // 채널 18/19가 있고 17이 없으면 IIDX 고점수
    if ((ch18 > 0 || ch19 > 0) && ch17 === 0) return 100;
    // 채널 18/19도 없고 17도 없으면 IIDX 기본
    if (ch18 === 0 && ch19 === 0 && ch17 === 0) return 50;
    return 10;
  },
  buildMapping: buildIidxForward,
  buildReverseMapping: buildIidxReverse,
};

// ──────────────────────────────────────────────────────────────────────────────
// Keyboard Strategy
// ──────────────────────────────────────────────────────────────────────────────

function buildKeyboardForward(mode: 'sp' | 'dp'): Readonly<Record<string, string>> {
  const sp: [string, string][] = [
    ['11','1'],['12','2'],['13','3'],['14','4'],['15','5'],['16','6'],['17','7'],['18','8'],['19','9'],
    ['31','1'],['32','2'],['33','3'],['34','4'],['35','5'],['36','6'],['37','7'],['38','8'],['39','9'],
    ['D1','1'],['D2','2'],['D3','3'],['D4','4'],['D5','5'],['D6','6'],['D7','7'],['D8','8'],['D9','9'],
    ['51','1'],['52','2'],['53','3'],['54','4'],['55','5'],['56','6'],['57','7'],['58','8'],['59','9'],
  ];
  if (mode === 'dp') {
    const dp2P: [string, string][] = [
      ['21','10'],['22','11'],['23','12'],['24','13'],['25','14'],['26','15'],['27','16'],['28','17'],['29','18'],
      ['41','10'],['42','11'],['43','12'],['44','13'],['45','14'],['46','15'],['47','16'],['48','17'],['49','18'],
      ['E1','10'],['E2','11'],['E3','12'],['E4','13'],['E5','14'],['E6','15'],['E7','16'],['E8','17'],['E9','18'],
      ['61','10'],['62','11'],['63','12'],['64','13'],['65','14'],['66','15'],['67','16'],['68','17'],['69','18'],
    ];
    return Object.fromEntries([...sp, ...dp2P]);
  }
  return Object.fromEntries(sp);
}

function buildKeyboardReverse(mode: 'sp' | 'dp'): ReverseChannelMapping {
  const spP: [string, string][] = [
    ['1','11'],['2','12'],['3','13'],['4','14'],['5','15'],['6','16'],['7','17'],['8','18'],['9','19'],
  ];
  const spI: [string, string][] = [
    ['1','31'],['2','32'],['3','33'],['4','34'],['5','35'],['6','36'],['7','37'],['8','38'],['9','39'],
  ];
  const spL: [string, string][] = [
    ['1','D1'],['2','D2'],['3','D3'],['4','D4'],['5','D5'],['6','D6'],['7','D7'],['8','D8'],['9','D9'],
  ];
  const spLn: [string, string][] = [
    ['1','51'],['2','52'],['3','53'],['4','54'],['5','55'],['6','56'],['7','57'],['8','58'],['9','59'],
  ];
  if (mode === 'dp') {
    const dpP2: [string, string][] = [
      ['10','21'],['11','22'],['12','23'],['13','24'],['14','25'],['15','26'],['16','27'],['17','28'],['18','29'],
    ];
    const dpI2: [string, string][] = [
      ['10','41'],['11','42'],['12','43'],['13','44'],['14','45'],['15','46'],['16','47'],['17','48'],['18','49'],
    ];
    const dpL2: [string, string][] = [
      ['10','E1'],['11','E2'],['12','E3'],['13','E4'],['14','E5'],['15','E6'],['16','E7'],['17','E8'],['18','E9'],
    ];
    const dpLn2: [string, string][] = [
      ['10','61'],['11','62'],['12','63'],['13','64'],['14','65'],['15','66'],['16','67'],['17','68'],['18','69'],
    ];
    return {
      playable: pairsToMap([...spP, ...dpP2]),
      invisible: pairsToMap([...spI, ...dpI2]),
      landmine: pairsToMap([...spL, ...dpL2]),
      longNote: pairsToMap([...spLn, ...dpLn2]),
    };
  }
  return {
    playable: pairsToMap(spP),
    invisible: pairsToMap(spI),
    landmine: pairsToMap(spL),
    longNote: pairsToMap(spLn),
  };
}

export const KEYBOARD_STRATEGY: ChannelStyleStrategy = {
  id: 'keyboard',
  score(stats) {
    const { counts } = stats;
    const ch17 = (counts['17'] || 0) + (counts['37'] || 0) + (counts['57'] || 0);
    const ch16 = (counts['16'] || 0) + (counts['36'] || 0) + (counts['56'] || 0);
    const ch18 = (counts['18'] || 0) + (counts['38'] || 0) + (counts['58'] || 0);
    const ch19 = (counts['19'] || 0) + (counts['39'] || 0) + (counts['59'] || 0);
    const ch11_15 =
      (counts['11'] || 0) + (counts['12'] || 0) + (counts['13'] || 0) +
      (counts['14'] || 0) + (counts['15'] || 0);
    const avg = ch11_15 / 5;
    const ch17IsKey = ch17 > avg * 0.5 && ch11_15 > 0;
    const ch16_17AreKeys = ch16 > avg * 0.5 && ch17 > avg * 0.5 && ch18 === 0 && ch19 === 0;
    if (ch17IsKey || ch16_17AreKeys) return 100;
    return 0;
  },
  buildMapping: buildKeyboardForward,
  buildReverseMapping: buildKeyboardReverse,
};

// ──────────────────────────────────────────────────────────────────────────────
// PMS Strategy
// ──────────────────────────────────────────────────────────────────────────────

function buildPmsForward(_mode: 'sp' | 'dp'): Readonly<Record<string, string>> {
  // PMS는 항상 9K SP
  return Object.fromEntries([
    ['11','1'],['12','2'],['13','3'],['14','4'],['15','5'],['22','6'],['23','7'],['24','8'],['25','9'],
    ['31','1'],['32','2'],['33','3'],['34','4'],['35','5'],['42','6'],['43','7'],['44','8'],['45','9'],
    ['D1','1'],['D2','2'],['D3','3'],['D4','4'],['D5','5'],['E2','6'],['E3','7'],['E4','8'],['E5','9'],
    ['51','1'],['52','2'],['53','3'],['54','4'],['55','5'],['62','6'],['63','7'],['64','8'],['65','9'],
  ]);
}

function buildPmsReverse(_mode: 'sp' | 'dp'): ReverseChannelMapping {
  return {
    playable: pairsToMap([
      ['1','11'],['2','12'],['3','13'],['4','14'],['5','15'],['6','22'],['7','23'],['8','24'],['9','25'],
    ]),
    invisible: pairsToMap([
      ['1','31'],['2','32'],['3','33'],['4','34'],['5','35'],['6','42'],['7','43'],['8','44'],['9','45'],
    ]),
    landmine: pairsToMap([
      ['1','D1'],['2','D2'],['3','D3'],['4','D4'],['5','D5'],['6','E2'],['7','E3'],['8','E4'],['9','E5'],
    ]),
    longNote: pairsToMap([
      ['1','51'],['2','52'],['3','53'],['4','54'],['5','55'],['6','62'],['7','63'],['8','64'],['9','65'],
    ]),
  };
}

export const PMS_STRATEGY: ChannelStyleStrategy = {
  id: 'pms',
  score(stats) {
    const { counts } = stats;
    const ch22_25 =
      (counts['22'] || 0) + (counts['23'] || 0) +
      (counts['24'] || 0) + (counts['25'] || 0);
    const ch16_19 =
      (counts['16'] || 0) + (counts['17'] || 0) +
      (counts['18'] || 0) + (counts['19'] || 0);
    const has2PNonPMS = !!(
      counts['21'] || counts['26'] || counts['27'] || counts['28'] || counts['29'] ||
      counts['41'] || counts['46'] || counts['47'] || counts['48'] || counts['49'] ||
      counts['61'] || counts['66'] || counts['67'] || counts['68'] || counts['69']
    );
    if (ch22_25 > 0 && ch16_19 === 0 && !has2PNonPMS) return 100;
    return 0;
  },
  buildMapping: buildPmsForward,
  buildReverseMapping: buildPmsReverse,
};

// ──────────────────────────────────────────────────────────────────────────────
// 전략 레지스트리 + detectStyle
// ──────────────────────────────────────────────────────────────────────────────

/** 등록된 모든 Strategy (점수 경쟁에 참여) */
export const STRATEGIES: readonly ChannelStyleStrategy[] = [
  PMS_STRATEGY,
  KEYBOARD_STRATEGY,
  IIDX_STRATEGY,
];

/**
 * BMSObject 배열에서 채널 통계를 집계합니다.
 */
export function computeChannelStats(
  objects: ReadonlyArray<{ channel: string }>
): ChannelStats {
  const counts: Record<string, number> = {};
  for (const obj of objects) {
    const ch = obj.channel.toUpperCase();
    const first = ch.charAt(0);
    if (['1','2','3','4','5','6','D','E'].includes(first)) {
      const second = ch.charAt(1);
      if (second >= '1' && second <= '9') {
        counts[ch] = (counts[ch] || 0) + 1;
      }
    }
  }
  const has2P = Object.keys(counts).some(ch => {
    const f = ch.charAt(0).toUpperCase();
    return ['2','4','6','E'].includes(f);
  });
  return { counts, has2P };
}

/**
 * BMSObject 배열에서 가장 적합한 Strategy와 DP 여부를 자동 감지합니다.
 *
 * 기존 detectBMSStyle 과 동일한 로직이지만 Strategy 객체를 반환합니다.
 */
export function detectStyle(
  objects: ReadonlyArray<{ channel: string }>,
  playerHeader?: string
): { strategy: ChannelStyleStrategy; isDP: boolean } {
  const stats = computeChannelStats(objects);
  const ranked = STRATEGIES
    .map(s => ({ s, score: s.score(stats, playerHeader) }))
    .sort((a, b) => b.score - a.score);
  const strategy = ranked[0].s;
  const isDP = stats.has2P || playerHeader === '3';
  return { strategy, isDP };
}
