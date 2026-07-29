/**
 * Public re-exports for the BMS Style Strategy
 *
 * External consumers (writer, etc.) access it through this file.
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
