import { isBase62Value, keysoundKey } from '../../../utils/objectId';
import { assertBMSNote, BMSNote, NoteType } from './note';
import { invariant } from '@epic-web/invariant';
import * as ChannelMapping from './channels';
import { calculateLandmineDamage, detectBMSStyle, createCombinedMapping } from './channels';
import { BMSChart } from '../../bms/chart';
import { BMSObject } from '../../bms/objects';

export type { BMSNote, NoteType };
export { calculateLandmineDamage, detectBMSStyle };

/**
 * Notes holds the in-game Note objects.
 * A Note object may or may not be playable.
 *
 * After parsing into a BMSChart with the Compiler, a Notes
 * object can be created with `fromBMSChart()`:
 *
 * Then the `.all()` method can be used to get every note.
 *
 */
export class Notes {
    _notes: BMSNote[];
    static CHANNEL_MAPPING = ChannelMapping;

    /**
     * @param {BMSNote[]} notes an array of Note objects
     */
    constructor(notes: BMSNote[]) {
        notes.forEach(assertBMSNote);
        this._notes = notes;
    }

    /**
     * Returns the number of notes in this object,
     * counting both playable and non-playable notes.
     */
    count() {
        return this._notes.length;
    }

    /**
     * Returns an array of all notes.
     */
    all() {
        return this._notes.slice();
    }

    /**
     * Creates a Notes object from a BMSChart.
     * @param chart the chart to process
     * @param options options
     */
    static fromBMSChart(chart: BMSChart, options?: BMSChartOptions) {
        void BMSChart;
        options = options || {};

        let mapping = options.mapping;

        if (!mapping) {
            // Auto-detect BMS style (IIDX, Keyboard, PMS) based on channel usage
            const objects = chart.objects.allSorted();
            // Pass the #PLAYER header to improve DP detection accuracy
            const playerHeader = chart.headers.get('player');
            const { style, isDP } = detectBMSStyle(objects, playerHeader);
            mapping = createCombinedMapping(style, isDP);
        }

        const builder = new BMSNoteBuilder(chart, { mapping: mapping });
        return builder.build();
    }
}

class BMSNoteBuilder {
    _chart: BMSChart;
    _mapping: { [channel: string]: string };
    _notes: BMSNote[];
    _activeLN: { [channel: string]: BMSNote };
    _lastNote: { [channel: string]: BMSNote };
    _lnObj: string;
    _base62 = false;
    _channelMapping: { [channel: string]: string };
    _objects: BMSObject[];
    constructor(chart: BMSChart, options: { mapping: BMSChannelNoteMapping }) {
        this._chart = chart;
        invariant(options.mapping, 'Expected options.mapping');
        invariant(typeof options.mapping === 'object', 'options.mapping must be object');
        this._mapping = options.mapping;
        this._notes = [];
        this._activeLN = {};
        this._lastNote = {};
        // #BASE 62 IDs are case-sensitive; base36 IDs are compared lower-case.
        this._base62 = isBase62Value(this._chart.headers.get('base'));
        this._lnObj = keysoundKey(this._chart.headers.get('lnobj') || '', this._base62);
        this._channelMapping = this._mapping;
        this._objects = this._chart.objects.allSorted();
    }

    build() {
        this._objects.forEach((object) => {
            this._handle(object);
        });
        // BUG-P1: recover unmatched long notes as normal notes (LNs with a start but no end)
        for (const channel of Object.keys(this._activeLN)) {
            const orphan = this._activeLN[channel];
            delete orphan.endBeat;
            this._notes.push(orphan);
        }
        this._activeLN = {};
        return new Notes(this._notes);
    }

    _handle(object: BMSObject) {
        if (object.channel === '01') {
            this._handleBgmNote(object);
        } else {
            switch (object.channel.charAt(0).toUpperCase()) {
                case '1':
                case '2':
                    this._handleNormalNote(object, 'playable');
                    break;
                case '3':
                case '4':
                    this._handleNormalNote(object, 'invisible');
                    break;
                case 'D':
                case 'E':
                    this._handleNormalNote(object, 'landmine');
                    break;
                case '5':
                case '6':
                    this._handleLongNote(object);
                    break;
            }
        }
    }

    _handleBgmNote(object: BMSObject) {
        const beat = this._getBeat(object);
        const note: BMSNote = {
            beat: beat,
            keysound: object.value,
            noteType: 'bgm',
            channel: object.channel,
        };
        this._notes.push(note);
    }

    _handleNormalNote(object: BMSObject, noteType: 'playable' | 'invisible' | 'landmine') {
        const channel = this._normalizeChannel(object.channel);
        const beat = this._getBeat(object);
        // BUG-P2: LNOBJ applies only to playable notes (excludes invisible/landmine)
        if (this._lnObj && noteType === 'playable' && keysoundKey(object.value, this._base62) === this._lnObj) {
            const head = this._lastNote[channel];
            if (head) {
                head.endBeat = beat;
                head.endMeasure = object.measure;
                head.endFraction = object.fraction;
                delete this._lastNote[channel];
            }
        } else {
            const note: BMSNote = {
                beat: beat,
                endBeat: undefined,
                keysound: object.value,
                column: this._getColumn(channel),
                noteType: noteType,
                channel: object.channel,
                measure: object.measure,
                fraction: object.fraction,
            };

            // Calculate damage for landmine notes
            if (noteType === 'landmine') {
                note.damage = calculateLandmineDamage(object.value);
            }

            // Only playable notes can be the head of an LNOBJ long note: an
            // invisible (3x/4x) note on the same lane must not be paired, or it
            // turns into a long note and is written back on the playable channel.
            if (noteType === 'playable') this._lastNote[channel] = note;
            this._notes.push(note);
        }
    }

    _handleLongNote(object: BMSObject) {
        const channel = this._normalizeChannel(object.channel);
        const beat = this._getBeat(object);
        if (this._activeLN[channel]) {
            const note = this._activeLN[channel];
            note.endBeat = beat;
            note.endMeasure = object.measure;
            note.endFraction = object.fraction;
            this._notes.push(note);
            delete this._activeLN[channel];
        } else {
            this._activeLN[channel] = {
                beat: beat,
                keysound: object.value,
                column: this._getColumn(channel),
                noteType: 'playable',
                channel: object.channel,
                measure: object.measure,
                fraction: object.fraction,
            };
        }
    }

    _getBeat(object: BMSObject) {
        return this._chart.measureToBeat(object.measure, object.fraction);
    }

    _getColumn(channel: string) {
        return this._channelMapping[channel];
    }

    _normalizeChannel(channel: string) {
        // Normalize long-note channels (5x -> 1x, 6x -> 2x)
        // Normalize ghost/invisible channels (3x -> 1x, 4x -> 2x)
        // Normalize landmine channels (Dx -> 1x, Ex -> 2x)
        const firstChar = channel.charAt(0).toUpperCase();

        switch (firstChar) {
            case '3':
            case '5':
            case 'D':
                return '1' + channel.slice(1);
            case '4':
            case '6':
            case 'E':
                return '2' + channel.slice(1);
            default:
                return channel;
        }
    }
}

interface BMSChartOptions {
    /**
     * Mapping from BMS channels to game channels.
     * When omitted, the BMS style (IIDX, Keyboard, PMS) is auto-detected.
     */
    mapping?: BMSChannelNoteMapping;
}

type BMSChannelNoteMapping = { [channel: string]: string };
