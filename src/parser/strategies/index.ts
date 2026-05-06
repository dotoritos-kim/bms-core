/**
 * BMS Style Strategy 공개 re-export
 *
 * 외부(writer 등)에서 import 시 이 파일을 통해 접근합니다.
 */
export type { BMSStyleId, ChannelStats, ChannelStyleStrategy } from './styleStrategy';
export {
  IIDX_STRATEGY,
  KEYBOARD_STRATEGY,
  PMS_STRATEGY,
  STRATEGIES,
  computeChannelStats,
  detectStyle,
} from './styleStrategy';
