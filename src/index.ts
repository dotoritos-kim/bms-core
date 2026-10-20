/**
 * @rhythm-archive/bms-core
 *
 * BMS (Be-Music Script) parser and writer library.
 * Supports BMS/BME/BML/PMS/BMSON format parsing and serialization.
 */

// Parser
export { BMSParser } from './parser';
export {
    Reader,
    Compiler,
    KeySounds,
    Timing,
    SongInfo,
    Positioning,
    Spacing,
    BMSChart,
    Notes,
    TimeSignatures,
} from './parser';

export type {
    ReaderOptions,
    BMSNote,
    NoteType,
    TimingAction,
    BaseTimingAction,
    BPMTimingAction,
    StopTimingAction,
    ISongInfoData,
    PositioningSegment,
    SpacingSegment,
} from './parser';

// Spec defaults / constants
export { DEFAULT_BPM } from './parser/modules/timing';
export { LANDMINE_INSTANT_GAMEOVER, calculateLandmineDamage } from './parser/modules/notes/channels';

// Writer
export {
    BMSWriter,
    writeHeaders,
    createEmptyHeaders,
    parseHeadersToData,
    writeChannels,
    IIDX_SP_REVERSE,
    IIDX_DP_REVERSE,
    styleForKeyMode,
    resolveReverseMapping,
} from './writer';
export type {
    BMSWriterOptions,
    EditableChartStyle,
    EditableBMSChart,
    EditableBMSNote,
    BMSHeaderData,
    BMSBpmChange,
    BMSStopEvent,
    BMSBgaEvent,
    BMSExtraObject,
    ReverseChannelMapping,
    ChartDiff,
} from './writer';

// Object IDs (#BASE 36 / #BASE 62)
export {
    BASE36_DIGITS,
    BASE62_DIGITS,
    isBase62Value,
    isBase62Headers,
    canonicalObjectId,
    keysoundKey,
    maxObjectIds,
    objectIdIndex,
    objectIdAt,
    allocateObjectIds,
} from './utils/objectId';
