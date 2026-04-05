// Keysounds를 노출하는 모듈
/* module */

import { uniq, values } from '../../utils/lodash';
import { BMSChart } from '../../bms/chart';

/**
 * 키사운드 ID와 파일 이름 간의 간단한 매핑.
 *
 * 이를 Compiler를 사용해 BMSChart로 파싱한 후,
 * `fromBMSChart()`를 사용하여 Keysounds를 생성할 수 있습니다:
 *
 * 그런 다음 `.get()`을 사용해 파일 이름을 가져올 수 있습니다:
 *
 */
export class KeySounds {
    _map: { [id: string]: string };
    _volumeMap: { [id: string]: number };
    constructor(map: { [id: string]: string }, volumeMap?: { [id: string]: number }) {
        this._map = map;
        this._volumeMap = volumeMap ?? {};
    }

    /**
     * 지정된 ID의 키사운드 파일을 반환합니다.
     * @param id 두 문자로 된 키사운드 ID
     * @returns 사운드 파일 이름
     */
    get(id: string): string | undefined {
        return this._map[id.toLowerCase()];
    }

    /**
     * 지정된 ID의 키사운드 볼륨을 반환합니다 (0-100, 기본값 100).
     * BMS #VOLWAVxx 헤더에서 파싱됩니다.
     * @param id 두 문자로 된 키사운드 ID
     * @returns 볼륨 (0-100)
     */
    getVolume(id: string): number {
        return this._volumeMap[id.toLowerCase()] ?? 100;
    }

    /**
     * 이 Keysounds 객체에 있는 고유한 파일 이름 배열을 반환합니다.
     * @returns 파일 이름 배열
     */
    files(): string[] {
        return uniq(values(this._map));
    }

    /**
     * 키사운드 ID에서 키사운드 파일 이름으로의 매핑을 반환합니다.
     *
     * **주의:** 해당 메서드는 이 Keysounds 객체에 사용되는 내부 데이터 구조를 반환합니다. 변형하지 마십시오!
     */
    all() {
        return this._map;
    }

    /**
     * 키사운드 ID에서 볼륨으로의 매핑을 반환합니다.
     */
    allVolumes() {
        return this._volumeMap;
    }

    /**
     * BMSChart에서 새로운 Keysounds 객체를 생성합니다.
     * @param chart
     */
    static fromBMSChart(chart: BMSChart) {
        void BMSChart;
        const map: { [id: string]: string } = {};
        const volumeMap: { [id: string]: number } = {};
        chart.headers.each(function (name, value) {
            const wavMatch = name.match(/^wav(\S\S)$/i);
            if (wavMatch) {
                map[wavMatch[1].toLowerCase()] = value;
                return;
            }
            // #VOLWAVxx yy — 키음별 볼륨 (0-100)
            const volMatch = name.match(/^volwav(\S\S)$/i);
            if (volMatch) {
                const vol = parseInt(value, 10);
                if (!isNaN(vol)) {
                    volumeMap[volMatch[1].toLowerCase()] = Math.max(0, Math.min(100, vol));
                }
            }
        });
        return new KeySounds(map, volumeMap);
    }
}
