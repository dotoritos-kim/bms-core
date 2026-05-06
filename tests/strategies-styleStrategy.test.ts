/**
 * Strategy 패턴 — 스타일 감지 단위 테스트
 * REFACTOR-PLAN PR-4 / P1
 */
import { describe, it, expect } from 'vitest';
import {
  IIDX_STRATEGY,
  KEYBOARD_STRATEGY,
  PMS_STRATEGY,
  STRATEGIES,
  detectStyle,
  computeChannelStats,
} from '../src/parser/strategies/styleStrategy';

// 채널 배열 생성 헬퍼
function objs(channels: string[]) {
  return channels.map(ch => ({ channel: ch }));
}

describe('computeChannelStats', () => {
  it('비 노트 채널은 무시', () => {
    const stats = computeChannelStats(objs(['02', '03', '08', '09', '04']));
    expect(Object.keys(stats.counts)).toHaveLength(0);
    expect(stats.has2P).toBe(false);
  });

  it('2P 채널(2x, 4x, 6x, Ex)이 있으면 has2P=true', () => {
    const stats = computeChannelStats(objs(['11', '21']));
    expect(stats.has2P).toBe(true);
  });

  it('1P만 있으면 has2P=false', () => {
    const stats = computeChannelStats(objs(['11', '12', '13']));
    expect(stats.has2P).toBe(false);
  });
});

describe('IIDX_STRATEGY.score', () => {
  it('채널 18/19가 있고 17이 없으면 최고점(100)', () => {
    const stats = computeChannelStats(objs(['11','12','13','14','15','16','18','19']));
    expect(IIDX_STRATEGY.score(stats)).toBe(100);
  });

  it('채널 18/19도 없고 17도 없으면 기본점(50)', () => {
    const stats = computeChannelStats(objs(['11','12','13','14','15','16']));
    expect(IIDX_STRATEGY.score(stats)).toBe(50);
  });

  it('채널 18이 있고 17도 있으면 점수 낮음', () => {
    const stats = computeChannelStats(objs(['11','17','18']));
    expect(IIDX_STRATEGY.score(stats)).toBeLessThan(100);
  });
});

describe('KEYBOARD_STRATEGY.score', () => {
  it('ch17이 평균의 50% 이상이면 최고점(100)', () => {
    // 11~15 각 10개, 17도 10개 → avg=10, ch17=10 > 5
    const many = (ch: string, n: number) => Array(n).fill(ch);
    const channels = [
      ...many('11',10),...many('12',10),...many('13',10),...many('14',10),...many('15',10),
      ...many('17',10),
    ];
    const stats = computeChannelStats(objs(channels));
    expect(KEYBOARD_STRATEGY.score(stats)).toBe(100);
  });

  it('ch17이 없으면 0점', () => {
    const stats = computeChannelStats(objs(['11','12','13','14','15','18','19']));
    expect(KEYBOARD_STRATEGY.score(stats)).toBe(0);
  });
});

describe('PMS_STRATEGY.score', () => {
  it('채널 22-25가 있고 16-19, 21, 26-29 없으면 최고점(100)', () => {
    const stats = computeChannelStats(objs(['11','12','13','14','15','22','23','24','25']));
    expect(PMS_STRATEGY.score(stats)).toBe(100);
  });

  it('채널 22-25가 있어도 21이 있으면 0점', () => {
    const stats = computeChannelStats(objs(['11','12','13','14','15','22','23','24','25','21']));
    expect(PMS_STRATEGY.score(stats)).toBe(0);
  });

  it('채널 16-19가 있으면 0점', () => {
    const stats = computeChannelStats(objs(['11','12','13','14','15','22','23','16']));
    expect(PMS_STRATEGY.score(stats)).toBe(0);
  });
});

describe('detectStyle — IIDX SP 차트', () => {
  it('IIDX 7K SP 차트를 iidx + SP 로 감지', () => {
    const { strategy, isDP } = detectStyle(
      objs(['11','12','13','14','15','16','18','19']),
    );
    expect(strategy.id).toBe('iidx');
    expect(isDP).toBe(false);
  });

  it('#PLAYER 3이면 isDP=true', () => {
    const { isDP } = detectStyle(objs(['11','12']), '3');
    expect(isDP).toBe(true);
  });
});

describe('detectStyle — PMS 9K 차트', () => {
  it('PMS 9K 채널 패턴을 pms 로 감지', () => {
    const { strategy } = detectStyle(
      objs(['11','12','13','14','15','22','23','24','25']),
    );
    expect(strategy.id).toBe('pms');
  });
});

describe('detectStyle — Keyboard 차트', () => {
  it('ch17이 일반 키처럼 사용되면 keyboard 로 감지', () => {
    const many = (ch: string, n: number) => Array(n).fill(ch);
    const channels = [
      ...many('11',10),...many('12',10),...many('13',10),...many('14',10),...many('15',10),
      ...many('17',10),
    ];
    const { strategy } = detectStyle(objs(channels));
    expect(strategy.id).toBe('keyboard');
  });
});

describe('ChannelStyleStrategy.buildMapping', () => {
  it('IIDX SP forward mapping: 채널 11 → 컬럼 1', () => {
    const mapping = IIDX_STRATEGY.buildMapping('sp');
    expect(mapping['11']).toBe('1');
    expect(mapping['16']).toBe('SC');
  });

  it('IIDX DP forward mapping: 채널 21 → 컬럼 8', () => {
    const mapping = IIDX_STRATEGY.buildMapping('dp');
    expect(mapping['21']).toBe('8');
  });

  it('Keyboard SP: 채널 17 → 컬럼 7 (일반 키)', () => {
    const mapping = KEYBOARD_STRATEGY.buildMapping('sp');
    expect(mapping['17']).toBe('7');
  });

  it('PMS: 채널 22 → 컬럼 6', () => {
    const mapping = PMS_STRATEGY.buildMapping('sp');
    expect(mapping['22']).toBe('6');
  });
});

describe('ChannelStyleStrategy.buildReverseMapping', () => {
  it('IIDX SP reverse: 컬럼 1 → playable 채널 11', () => {
    const rev = IIDX_STRATEGY.buildReverseMapping('sp');
    expect(rev.playable.get('1')).toBe('11');
    expect(rev.longNote.get('SC')).toBe('56');
  });

  it('PMS reverse: 컬럼 6 → playable 채널 22', () => {
    const rev = PMS_STRATEGY.buildReverseMapping('sp');
    expect(rev.playable.get('6')).toBe('22');
  });
});

describe('STRATEGIES 배열 순서', () => {
  it('PMS, KEYBOARD, IIDX 순서로 등록됨', () => {
    const ids = STRATEGIES.map(s => s.id);
    expect(ids).toEqual(['pms', 'keyboard', 'iidx']);
  });
});
