// 1P Visible Playable Notes (채널 11-19)
// 채널 17은 구버전 BMS에서 페달/free zone으로 사용됨
export const IIDX_P1 = {
  '11': '1',
  '12': '2',
  '13': '3',
  '14': '4',
  '15': '5',
  '16': 'SC',
  '17': 'FZ',  // Free Zone / Pedal
  '18': '6',
  '19': '7',
}

// DP Visible Playable Notes (채널 11-19, 21-29)
// 채널 17/27은 구버전 BMS에서 페달/free zone으로 사용됨
export const IIDX_DP = {
  '11': '1',
  '12': '2',
  '13': '3',
  '14': '4',
  '15': '5',
  '16': 'SC',
  '17': 'FZ',   // Free Zone / Pedal (1P)
  '18': '6',
  '19': '7',

  '21': '8',
  '22': '9',
  '23': '10',
  '24': '11',
  '25': '12',
  '26': 'SC2',
  '27': 'FZ2',  // Free Zone / Pedal (2P)
  '28': '13',
  '29': '14',
}

// 1P Invisible/Ghost Notes (채널 31-39)
// 키음은 재생되지만 판정되지 않는 노트
export const IIDX_P1_INVISIBLE = {
  '31': '1',
  '32': '2',
  '33': '3',
  '34': '4',
  '35': '5',
  '36': 'SC',
  '37': 'FZ',   // Free Zone (invisible)
  '38': '6',
  '39': '7',
}

// DP Invisible/Ghost Notes (채널 31-39, 41-49)
export const IIDX_DP_INVISIBLE = {
  '31': '1',
  '32': '2',
  '33': '3',
  '34': '4',
  '35': '5',
  '36': 'SC',
  '37': 'FZ',
  '38': '6',
  '39': '7',

  '41': '8',
  '42': '9',
  '43': '10',
  '44': '11',
  '45': '12',
  '46': 'SC2',
  '47': 'FZ2',
  '48': '13',
  '49': '14',
}

// 1P Landmine Notes (채널 D1-D9)
// 지뢰 노트: 터치 시 게이지가 감소하는 노트
// WAV 정의 값이 데미지 (1-255 = 0.39%~100%, ZZ = 즉사)
export const IIDX_P1_LANDMINE = {
  D1: '1',
  D2: '2',
  D3: '3',
  D4: '4',
  D5: '5',
  D6: 'SC',
  D7: 'FZ',   // Free Zone landmine
  D8: '6',
  D9: '7',
}

// DP Landmine Notes (채널 D1-D9, E1-E9)
export const IIDX_DP_LANDMINE = {
  D1: '1',
  D2: '2',
  D3: '3',
  D4: '4',
  D5: '5',
  D6: 'SC',
  D7: 'FZ',
  D8: '6',
  D9: '7',

  E1: '8',
  E2: '9',
  E3: '10',
  E4: '11',
  E5: '12',
  E6: 'SC2',
  E7: 'FZ2',
  E8: '13',
  E9: '14',
}

// 1P Long Notes (채널 51-59)
// #LNTYPE 1 방식의 롱노트 채널
export const IIDX_P1_LONGNOTE = {
  '51': '1',
  '52': '2',
  '53': '3',
  '54': '4',
  '55': '5',
  '56': 'SC',
  '57': 'FZ',
  '58': '6',
  '59': '7',
}

// DP Long Notes (채널 51-59, 61-69)
export const IIDX_DP_LONGNOTE = {
  '51': '1',
  '52': '2',
  '53': '3',
  '54': '4',
  '55': '5',
  '56': 'SC',
  '57': 'FZ',
  '58': '6',
  '59': '7',

  '61': '8',
  '62': '9',
  '63': '10',
  '64': '11',
  '65': '12',
  '66': 'SC2',
  '67': 'FZ2',
  '68': '13',
  '69': '14',
}

// PMS (Pop'n Music Style) 9K
// 채널 11-15, 22-25를 사용하는 9버튼 모드
export const PMS_9K = {
  '11': '1',
  '12': '2',
  '13': '3',
  '14': '4',
  '15': '5',
  '22': '6',
  '23': '7',
  '24': '8',
  '25': '9',
}

// PMS 9K Invisible (채널 31-35, 42-45)
export const PMS_9K_INVISIBLE = {
  '31': '1',
  '32': '2',
  '33': '3',
  '34': '4',
  '35': '5',
  '42': '6',
  '43': '7',
  '44': '8',
  '45': '9',
}

// PMS 9K LongNote (채널 51-55, 62-65)
export const PMS_9K_LONGNOTE = {
  '51': '1',
  '52': '2',
  '53': '3',
  '54': '4',
  '55': '5',
  '62': '6',
  '63': '7',
  '64': '8',
  '65': '9',
}

// PMS 9K Landmine (채널 D1-D5, E2-E5)
export const PMS_9K_LANDMINE = {
  'D1': '1',
  'D2': '2',
  'D3': '3',
  'D4': '4',
  'D5': '5',
  'E2': '6',
  'E3': '7',
  'E4': '8',
  'E5': '9',
}

// PMS 5K (O2Jam 스타일)
export const PMS_5K = {
  '13': '1',
  '14': '2',
  '15': '3',
  '22': '4',
  '23': '5',
}

// ============================================
// Keyboard Style Mappings (유이팩, 키보드 BMS)
// 스크래치 없이 모든 채널을 일반 키로 사용
// ============================================

// Keyboard SP (1-9 keys, no scratch)
// 채널 16, 17을 스크래치/페달이 아닌 일반 키로 취급
export const KEYBOARD_SP = {
  '11': '1',
  '12': '2',
  '13': '3',
  '14': '4',
  '15': '5',
  '16': '6',  // Regular key (not scratch)
  '17': '7',  // Regular key (not footpedal)
  '18': '8',
  '19': '9',
}

// Keyboard DP (1-18 keys, no scratch)
export const KEYBOARD_DP = {
  '11': '1',
  '12': '2',
  '13': '3',
  '14': '4',
  '15': '5',
  '16': '6',
  '17': '7',
  '18': '8',
  '19': '9',
  '21': '10',
  '22': '11',
  '23': '12',
  '24': '13',
  '25': '14',
  '26': '15',
  '27': '16',
  '28': '17',
  '29': '18',
}

// Keyboard Invisible (SP)
export const KEYBOARD_SP_INVISIBLE = {
  '31': '1',
  '32': '2',
  '33': '3',
  '34': '4',
  '35': '5',
  '36': '6',
  '37': '7',
  '38': '8',
  '39': '9',
}

// Keyboard Invisible (DP)
export const KEYBOARD_DP_INVISIBLE = {
  '31': '1',
  '32': '2',
  '33': '3',
  '34': '4',
  '35': '5',
  '36': '6',
  '37': '7',
  '38': '8',
  '39': '9',
  '41': '10',
  '42': '11',
  '43': '12',
  '44': '13',
  '45': '14',
  '46': '15',
  '47': '16',
  '48': '17',
  '49': '18',
}

// Keyboard Long Notes (SP)
export const KEYBOARD_SP_LONGNOTE = {
  '51': '1',
  '52': '2',
  '53': '3',
  '54': '4',
  '55': '5',
  '56': '6',
  '57': '7',
  '58': '8',
  '59': '9',
}

// Keyboard Long Notes (DP)
export const KEYBOARD_DP_LONGNOTE = {
  '51': '1',
  '52': '2',
  '53': '3',
  '54': '4',
  '55': '5',
  '56': '6',
  '57': '7',
  '58': '8',
  '59': '9',
  '61': '10',
  '62': '11',
  '63': '12',
  '64': '13',
  '65': '14',
  '66': '15',
  '67': '16',
  '68': '17',
  '69': '18',
}

// Keyboard Landmine (SP)
export const KEYBOARD_SP_LANDMINE = {
  D1: '1',
  D2: '2',
  D3: '3',
  D4: '4',
  D5: '5',
  D6: '6',
  D7: '7',
  D8: '8',
  D9: '9',
}

// Keyboard Landmine (DP)
export const KEYBOARD_DP_LANDMINE = {
  D1: '1',
  D2: '2',
  D3: '3',
  D4: '4',
  D5: '5',
  D6: '6',
  D7: '7',
  D8: '8',
  D9: '9',
  E1: '10',
  E2: '11',
  E3: '12',
  E4: '13',
  E5: '14',
  E6: '15',
  E7: '16',
  E8: '17',
  E9: '18',
}

/**
 * 채널에서 노트 타입 결정
 */
export function getNoteTypeFromChannel(channel: string): 'playable' | 'invisible' | 'landmine' | 'bgm' {
  if (channel === '01') return 'bgm';

  const firstChar = channel.charAt(0).toUpperCase();

  // Landmine channels (D1-D9, E1-E9)
  if (firstChar === 'D' || firstChar === 'E') return 'landmine';

  // Invisible/Ghost channels (31-39, 41-49)
  if (firstChar === '3' || firstChar === '4') return 'invisible';

  // Visible playable (11-19, 21-29, 51-59, 61-69 for LN)
  return 'playable';
}

/**
 * 지뢰 노트 데미지 계산
 * BMS에서 지뢰 노트의 WAV 값이 데미지 퍼센트를 나타냄
 * 01-FE: 데미지 (01 = 0.39%, FE = 99.6%)
 * FF 또는 ZZ: 즉사 (100%)
 * @param value WAV 값 (hex string, 00-ZZ)
 * @returns 데미지 퍼센트 (0-100)
 */
export function calculateLandmineDamage(value: string): number {
  if (!value || value === '00') return 0;

  const upper = value.toUpperCase();

  // ZZ는 즉사
  if (upper === 'ZZ') return 100;

  // 16진수로 변환
  const decimal = parseInt(upper, 36);

  // FF(255)도 즉사
  if (decimal >= 255) return 100;

  // 1-254 범위에서 0.39% ~ 99.6% 매핑
  // 공식: damage% = value / 256 * 100
  return (decimal / 256) * 100;
}

/**
 * BMS 스타일 타입
 */
export type BMSStyle = 'iidx' | 'keyboard' | 'pms';

/**
 * 자동 키 모드 감지용 통합 매핑 생성
 * 모든 채널 타입을 합쳐서 반환
 * @param style BMS 스타일 ('iidx' | 'keyboard' | 'pms')
 * @param isDP DP 모드 여부
 */
export function createCombinedMapping(style: BMSStyle = 'iidx', isDP: boolean = false): { [channel: string]: string } {
  switch (style) {
    case 'keyboard':
      if (isDP) {
        return {
          ...KEYBOARD_DP,
          ...KEYBOARD_DP_INVISIBLE,
          ...KEYBOARD_DP_LANDMINE,
          ...KEYBOARD_DP_LONGNOTE,
        };
      }
      return {
        ...KEYBOARD_SP,
        ...KEYBOARD_SP_INVISIBLE,
        ...KEYBOARD_SP_LANDMINE,
        ...KEYBOARD_SP_LONGNOTE,
      };

    case 'pms':
      return {
        ...PMS_9K,
        ...PMS_9K_INVISIBLE,
        ...PMS_9K_LANDMINE,
        ...PMS_9K_LONGNOTE,
      };

    case 'iidx':
    default:
      if (isDP) {
        return {
          ...IIDX_DP,
          ...IIDX_DP_INVISIBLE,
          ...IIDX_DP_LANDMINE,
          ...IIDX_DP_LONGNOTE,
        };
      }
      return {
        ...IIDX_P1,
        ...IIDX_P1_INVISIBLE,
        ...IIDX_P1_LANDMINE,
        ...IIDX_P1_LONGNOTE,
      };
  }
}

/**
 * BMS 오브젝트에서 사용된 채널을 분석하여 스타일 자동 감지
 * @param objects BMS 오브젝트 배열 (channel, value 포함)
 * @param playerHeader #PLAYER 헤더 값 (1=SP, 2=2P, 3=DP)
 * @returns 감지된 BMS 스타일과 DP 여부
 */
export function detectBMSStyle(objects: Array<{ channel: string; value: string }>, playerHeader?: string): { style: BMSStyle; isDP: boolean } {
  const channelCounts: { [channel: string]: number } = {};

  // 노트 채널만 카운트 (11-19, 21-29, 31-39, 41-49, 51-59, 61-69, D1-D9, E1-E9)
  for (const obj of objects) {
    const ch = obj.channel.toUpperCase();
    const firstChar = ch.charAt(0);

    // 노트 채널인지 확인
    if (['1', '2', '3', '4', '5', '6', 'D', 'E'].includes(firstChar)) {
      const secondChar = ch.charAt(1);
      if (secondChar >= '1' && secondChar <= '9') {
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
      }
    }
  }

  // 채널 사용량 분석
  const ch16Count = (channelCounts['16'] || 0) + (channelCounts['36'] || 0) + (channelCounts['56'] || 0);
  const ch17Count = (channelCounts['17'] || 0) + (channelCounts['37'] || 0) + (channelCounts['57'] || 0);
  const ch18Count = (channelCounts['18'] || 0) + (channelCounts['38'] || 0) + (channelCounts['58'] || 0);
  const ch19Count = (channelCounts['19'] || 0) + (channelCounts['39'] || 0) + (channelCounts['59'] || 0);
  const ch16_19Count = ch16Count + ch17Count + ch18Count + ch19Count;

  // PMS 감지 (2P 판별보다 먼저 수행!)
  // PMS 9K는 채널 11-15 + 22-25를 사용하며, 채널 16-19는 사용하지 않음
  // 채널 22-25가 2P 채널과 겹치므로 PMS를 먼저 감지해야 함
  const ch22_25Count = (channelCounts['22'] || 0) + (channelCounts['23'] || 0) +
                       (channelCounts['24'] || 0) + (channelCounts['25'] || 0);

  if (ch22_25Count > 0 && ch16_19Count === 0) {
    // 채널 21, 26-29가 사용되면 진짜 2P (DP)일 수 있음
    const has2PNonPMS = !!(channelCounts['21'] || channelCounts['26'] || channelCounts['27'] ||
                          channelCounts['28'] || channelCounts['29'] ||
                          channelCounts['41'] || channelCounts['46'] || channelCounts['47'] ||
                          channelCounts['48'] || channelCounts['49'] ||
                          channelCounts['61'] || channelCounts['66'] || channelCounts['67'] ||
                          channelCounts['68'] || channelCounts['69']);
    if (!has2PNonPMS) {
      return { style: 'pms', isDP: false };
    }
  }

  // 2P 채널 사용 여부 확인 (21-29, 41-49, 61-69, E1-E9)
  const has2P = Object.keys(channelCounts).some(ch => {
    const firstChar = ch.charAt(0).toUpperCase();
    return ['2', '4', '6', 'E'].includes(firstChar);
  });

  // #PLAYER 헤더로 DP 여부 확인 (PLAYER 3 = DP)
  const isDP = has2P || playerHeader === '3';

  // IIDX 7키 감지: 채널 18, 19 (6, 7키)가 사용되면 IIDX 스타일
  // IIDX에서 채널 18, 19는 6, 7번 키로 매핑됨
  // Keyboard에서는 채널 18, 19가 8, 9번 키로 매핑됨
  // 따라서 채널 18, 19가 사용되고 채널 17 (FZ/pedal)이 거의 없으면 IIDX로 판단
  if (ch18Count > 0 || ch19Count > 0) {
    // 채널 17 (FZ/pedal)이 전혀 또는 거의 사용되지 않으면 IIDX 스타일
    // (키보드 스타일에서는 채널 17이 일반 키로 사용됨)
    if (ch17Count === 0) {
      return { style: 'iidx', isDP };
    }
  }

  // Keyboard 감지:
  // - 채널 17이 일반 키처럼 많이 사용됨 (IIDX에서는 FZ로 거의 안 씀)
  // - 채널 16, 17 모두 사용량이 다른 키와 비슷하면 키보드 스타일
  const ch11_15Count = (channelCounts['11'] || 0) + (channelCounts['12'] || 0) +
                       (channelCounts['13'] || 0) + (channelCounts['14'] || 0) +
                       (channelCounts['15'] || 0);
  const avgKeyCount = ch11_15Count / 5;

  // 키보드 스타일 조건:
  // 1. 채널 17이 평균 키 사용량의 50% 이상 (IIDX에서는 FZ를 거의 안 씀)
  // 2. 또는 채널 16, 17 모두 평균의 50% 이상이고 채널 18, 19가 없음
  const ch17IsKey = ch17Count > avgKeyCount * 0.5 && ch11_15Count > 0;
  const ch16_17AreKeys = ch16Count > avgKeyCount * 0.5 && ch17Count > avgKeyCount * 0.5 &&
                         ch18Count === 0 && ch19Count === 0;

  if (ch17IsKey || ch16_17AreKeys) {
    return { style: 'keyboard', isDP };
  }

  return { style: 'iidx', isDP };
}
