/**
 * BMS 채널 매핑 모듈
 *
 * 이 파일은 외부 공개 API를 유지하는 thin re-export 레이어입니다.
 * 실제 전략 구현은 `src/parser/strategies/styleStrategy.ts` 에 있습니다.
 *
 * 아래의 named export 상수/함수는 기존 코드와 100% 호환됩니다.
 */

import {
  IIDX_STRATEGY,
  KEYBOARD_STRATEGY,
  PMS_STRATEGY,
  detectStyle,
} from '../../strategies/styleStrategy';

// ────────────────────────────────────────────────────────────
// Forward mapping 상수 (기존 export — 호환 유지)
// ────────────────────────────────────────────────────────────

const _iidxSP = IIDX_STRATEGY.buildMapping('sp');
const _iidxDP = IIDX_STRATEGY.buildMapping('dp');
const _kbSP   = KEYBOARD_STRATEGY.buildMapping('sp');
const _kbDP   = KEYBOARD_STRATEGY.buildMapping('dp');
const _pmsFw  = PMS_STRATEGY.buildMapping('sp');

// IIDX P1
export const IIDX_P1           = { '11':'1','12':'2','13':'3','14':'4','15':'5','16':'SC','17':'FZ','18':'6','19':'7' };
export const IIDX_DP           = Object.fromEntries(Object.entries(_iidxDP).filter(([k]) => k.charAt(0) !== '3' && k.charAt(0) !== '4' && k.charAt(0) !== '5' && k.charAt(0) !== '6' && k.charAt(0) !== 'D' && k.charAt(0) !== 'E'));
export const IIDX_P1_INVISIBLE = { '31':'1','32':'2','33':'3','34':'4','35':'5','36':'SC','37':'FZ','38':'6','39':'7' };
export const IIDX_DP_INVISIBLE = { '31':'1','32':'2','33':'3','34':'4','35':'5','36':'SC','37':'FZ','38':'6','39':'7','41':'8','42':'9','43':'10','44':'11','45':'12','46':'SC2','47':'FZ2','48':'13','49':'14' };
export const IIDX_P1_LANDMINE  = { D1:'1',D2:'2',D3:'3',D4:'4',D5:'5',D6:'SC',D7:'FZ',D8:'6',D9:'7' };
export const IIDX_DP_LANDMINE  = { D1:'1',D2:'2',D3:'3',D4:'4',D5:'5',D6:'SC',D7:'FZ',D8:'6',D9:'7',E1:'8',E2:'9',E3:'10',E4:'11',E5:'12',E6:'SC2',E7:'FZ2',E8:'13',E9:'14' };
export const IIDX_P1_LONGNOTE  = { '51':'1','52':'2','53':'3','54':'4','55':'5','56':'SC','57':'FZ','58':'6','59':'7' };
export const IIDX_DP_LONGNOTE  = { '51':'1','52':'2','53':'3','54':'4','55':'5','56':'SC','57':'FZ','58':'6','59':'7','61':'8','62':'9','63':'10','64':'11','65':'12','66':'SC2','67':'FZ2','68':'13','69':'14' };

export const PMS_9K          = { '11':'1','12':'2','13':'3','14':'4','15':'5','22':'6','23':'7','24':'8','25':'9' };
export const PMS_9K_INVISIBLE= { '31':'1','32':'2','33':'3','34':'4','35':'5','42':'6','43':'7','44':'8','45':'9' };
export const PMS_9K_LONGNOTE = { '51':'1','52':'2','53':'3','54':'4','55':'5','62':'6','63':'7','64':'8','65':'9' };
export const PMS_9K_LANDMINE = { D1:'1',D2:'2',D3:'3',D4:'4',D5:'5',E2:'6',E3:'7',E4:'8',E5:'9' };
export const PMS_5K          = { '13':'1','14':'2','15':'3','22':'4','23':'5' };

export const KEYBOARD_SP          = { '11':'1','12':'2','13':'3','14':'4','15':'5','16':'6','17':'7','18':'8','19':'9' };
export const KEYBOARD_DP          = Object.fromEntries(Object.entries(_kbDP).filter(([k]) => { const f = k.charAt(0); return f === '1' || f === '2'; }));
export const KEYBOARD_SP_INVISIBLE= { '31':'1','32':'2','33':'3','34':'4','35':'5','36':'6','37':'7','38':'8','39':'9' };
export const KEYBOARD_DP_INVISIBLE= { '31':'1','32':'2','33':'3','34':'4','35':'5','36':'6','37':'7','38':'8','39':'9','41':'10','42':'11','43':'12','44':'13','45':'14','46':'15','47':'16','48':'17','49':'18' };
export const KEYBOARD_SP_LONGNOTE = { '51':'1','52':'2','53':'3','54':'4','55':'5','56':'6','57':'7','58':'8','59':'9' };
export const KEYBOARD_DP_LONGNOTE = { '51':'1','52':'2','53':'3','54':'4','55':'5','56':'6','57':'7','58':'8','59':'9','61':'10','62':'11','63':'12','64':'13','65':'14','66':'15','67':'16','68':'17','69':'18' };
export const KEYBOARD_SP_LANDMINE = { D1:'1',D2:'2',D3:'3',D4:'4',D5:'5',D6:'6',D7:'7',D8:'8',D9:'9' };
export const KEYBOARD_DP_LANDMINE = { D1:'1',D2:'2',D3:'3',D4:'4',D5:'5',D6:'6',D7:'7',D8:'8',D9:'9',E1:'10',E2:'11',E3:'12',E4:'13',E5:'14',E6:'15',E7:'16',E8:'17',E9:'18' };

// ────────────────────────────────────────────────────────────
// 채널 유틸리티 함수 (기존 export — 호환 유지)
// ────────────────────────────────────────────────────────────

/**
 * 채널에서 노트 타입 결정
 */
export function getNoteTypeFromChannel(channel: string): 'playable' | 'invisible' | 'landmine' | 'bgm' {
  if (channel === '01') return 'bgm';
  const firstChar = channel.charAt(0).toUpperCase();
  if (firstChar === 'D' || firstChar === 'E') return 'landmine';
  if (firstChar === '3' || firstChar === '4') return 'invisible';
  return 'playable';
}

/**
 * 지뢰 노트 데미지 계산
 * @param value WAV 값 (hex string, 00-ZZ)
 * @returns 데미지 퍼센트 (0-100)
 */
export function calculateLandmineDamage(value: string): number {
  if (!value || value === '00') return 0;
  const upper = value.toUpperCase();
  if (upper === 'ZZ') return 100;
  const decimal = parseInt(upper, 36);
  if (decimal >= 255) return 100;
  return (decimal / 256) * 100;
}

/**
 * BMS 스타일 타입 (기존 호환)
 */
export type BMSStyle = 'iidx' | 'keyboard' | 'pms';

/**
 * 자동 키 모드 감지용 통합 매핑 생성 (기존 호환 API)
 * 내부적으로 Strategy.buildMapping 에 위임합니다.
 */
export function createCombinedMapping(
  style: BMSStyle = 'iidx',
  isDP: boolean = false
): { [channel: string]: string } {
  const mode = isDP ? 'dp' : 'sp';
  switch (style) {
    case 'keyboard': return { ..._kbSP, ...( isDP ? _kbDP : {} ) };
    case 'pms':      return { ..._pmsFw };
    case 'iidx':
    default:         return { ...( isDP ? _iidxDP : _iidxSP ) };
  }
}

/**
 * BMS 오브젝트에서 사용된 채널을 분석하여 스타일 자동 감지 (기존 호환 API)
 * 내부적으로 Strategy.detectStyle 에 위임합니다.
 */
export function detectBMSStyle(
  objects: Array<{ channel: string; value: string }>,
  playerHeader?: string
): { style: BMSStyle; isDP: boolean } {
  const { strategy, isDP } = detectStyle(objects, playerHeader);
  return { style: strategy.id as BMSStyle, isDP };
}

// suppress unused import warning — _iidxDP etc. are used above
void _iidxSP; void _iidxDP; void _kbSP; void _kbDP; void _pmsFw;
