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

// Writer
export {
    BMSWriter,
    writeHeaders,
    createEmptyHeaders,
    parseHeadersToData,
    writeChannels,
    IIDX_SP_REVERSE,
    IIDX_DP_REVERSE,
} from './writer';
export type {
    BMSWriterOptions,
    EditableBMSChart,
    EditableBMSNote,
    BMSHeaderData,
    BMSBpmChange,
    BMSStopEvent,
    BMSBgaEvent,
    ReverseChannelMapping,
    ChartDiff,
} from './writer';
