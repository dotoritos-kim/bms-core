/**
 * BMSObjects는 BMS 노트차트 내의 객체 모음을 보유합니다.
 */
export class BMSObjects {
    private _objects: BMSObject[];
    /**
     * 중복 검사 캐시: `"channel:measure:fraction"` → _objects 배열 인덱스
     * BGM 채널(01)은 중복 허용이므로 캐시하지 않습니다.
     * 성능: add 의 중복 탐색을 O(n) → O(1) 으로 개선 (M2)
     */
    private _dedup: Map<string, number>;

    constructor() {
        this._objects = [];
        this._dedup = new Map();
    }

    /**
     * 중복 검사 키 생성 (BGM 채널 제외)
     */
    private static _key(obj: BMSObject): string {
        return `${obj.channel}:${obj.measure}:${obj.fraction}`;
    }

    /**
     * 새 객체를 이 컬렉션에 추가합니다.
     * 동일한 채널과 위치에 객체가 이미 존재하는 경우,
     * 해당 객체는 교체됩니다 (자동 키사운드 트랙 제외).
     * @param object 추가할 객체
     */
    add(object: BMSObject) {
        if (object.channel !== '01') {
            const key = BMSObjects._key(object);
            const existingIndex = this._dedup.get(key);
            if (existingIndex !== undefined) {
                this._objects[existingIndex] = object;
                return;
            }
            this._dedup.set(key, this._objects.length);
        }
        this._objects.push(object);
    }

    /**
     * 모든 객체의 배열을 반환합니다.
     */
    all() {
        return this._objects.slice();
    }

    /**
     * 모든 객체의 정렬된 배열을 반환합니다.
     */
    allSorted() {
        const list = this.all();
        list.sort(function (a, b) {
            return a.measure + a.fraction - (b.measure + b.fraction);
        });
        return list;
    }
}

/** {BMSChart} 내의 객체 */
export interface BMSObject {
    /** 이 객체의 원시 두 문자 BMS 채널 */
    channel: string;

    /** 마디 번호, 0부터 시작 (`#000`에 해당) */
    measure: number;

    /**
     * 마디 내의 분수 위치로,
     * 0(포함)에서 1(미포함)까지의 범위를 가집니다.
     * 0은 객체가 마디의 시작에 있음을 의미하며,
     * 1은 객체가 마디의 끝에 있음을 의미합니다.
     */
    fraction: number;

    /** BMS 객체의 원시 값 */
    value: string;
}
