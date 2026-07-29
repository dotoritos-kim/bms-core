import { match } from '../../utils/match';
import { assign } from '../../utils/lodash';
import { BMSChart } from '../../bms/chart';

export interface ISongInfoData {
    title: string;
    artist: string;
    genre: string;
    subtitles: string[];
    subartists: string[];
    difficulty: number;
    level: number;
}

/**
 * SongInfo represents song information (e.g. title, artist, genre).
 *
 * ## Example
 *
 * Suppose we have a BMS like this:
 *
 * ```
 * #TITLE Exargon [HYPER]
 * ```
 *
 * After parsing it into a BMSChart using the Compiler,
 * a SongInfo can be created with `fromBMSChart()`:
 *
 * The song information can then be queried through its properties.
 *
 */
export class SongInfo implements ISongInfoData {
    title: string;
    artist: string;
    genre: string;
    subtitles: string[];
    subartists: string[];
    difficulty: number;
    level: number;
    /**
     * Creates a SongInfo from the given data.
     * @param info the properties to set on this instance
     */
    constructor(info: Record<string, unknown>) {
        /** Song title */
        this.title = 'NO TITLE';
        /** Song artist */
        this.artist = 'NO ARTIST';
        /** Song genre */
        this.genre = 'NO GENRE';
        /**
         * The song's subtitles, one line per element.
         * Subtitles can be used to indicate the difficulty name,
         * such as NORMAL, HYPER, ANOTHER.
         * @type {string[]}
         */
        this.subtitles = [];
        /**
         * The song's other artists, one artist per element.
         * @type {string[]}
         */
        this.subartists = [];
        /**
         * The difficulty.
         * The meaning of the number is the same as BMS's
         * [`#DIFFICULTY`](http:*hitkey.nekokan.dyndns.info/cmds.htm#DIFFICULTY) header.
         *
         * | Difficulty | Meaning  |
         * | ----------:|:--------:|
         * |          1 | BEGINNER |
         * |          2 | NORMAL   |
         * |          3 | HYPER    |
         * |          4 | ANOTHER  |
         * |          5 | INSANE   |
         */
        this.difficulty = 0;
        /**
         * The song's level.
         * When converted from a BMS chart, this is the value of the `#PLAYLEVEL` header.
         */
        this.level = 0;
        if (info) assign(this, info);
    }

    /**
     * Creates a new {SongInfo} object from a {BMSChart}.
     * @param chart the {BMSChart} to create the {SongInfo} from
     */
    static fromBMSChart(chart: BMSChart) {
        void BMSChart;
        const info: Partial<ISongInfoData> = {};
        let title = chart.headers.get('title');
        const artist = chart.headers.get('artist');
        const genre = chart.headers.get('genre');
        const difficulty = +chart.headers.get('difficulty')! || 0;
        const level = +chart.headers.get('playlevel')! || 0;
        let subtitles = chart.headers.getAll('subtitle');
        const subartists = chart.headers.getAll('subartist');
        if (typeof title === 'string' && !subtitles) {
            const extractSubtitle = function (m: string[]) {
                title = m[1];
                subtitles = [m[2]];
            };
            match(title)
                .when(/^(.*\S)\s*-(.+?)-$/, extractSubtitle)
                .when(/^(.*\S)\s*～(.+?)～$/, extractSubtitle)
                .when(/^(.*\S)\s*\((.+?)\)$/, extractSubtitle)
                .when(/^(.*\S)\s*\[(.+?)\]$/, extractSubtitle)
                .when(/^(.*\S)\s*<(.+?)>$/, extractSubtitle);
        }
        if (title) info.title = title;
        if (artist) info.artist = artist;
        if (genre) info.genre = genre;
        if (subtitles) info.subtitles = subtitles;
        if (subartists) info.subartists = subartists;
        if (difficulty) info.difficulty = difficulty;
        if (level) info.level = level;
        return new SongInfo(info);
    }
}
