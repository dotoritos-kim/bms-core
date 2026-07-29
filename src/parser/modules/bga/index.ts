/**
 * BGA (Background Animation) module
 *
 * Parses #BGAxx commands and manages BMP references, crop coordinates, and offsets.
 *
 * Format: #BGAxx yy x1 y1 x2 y2 [dx dy]
 * - xx: BGA index (Base36)
 * - yy: BMP index (referenced image)
 * - x1, y1, x2, y2: crop area (pixel coordinates)
 * - dx, dy: display offset (optional)
 */

import type { BMSChart } from '../../bms/chart';

export interface BGADefinition {
    /** BGA index (Base36) */
    id: string;
    /** Referenced BMP index */
    bmpId: string;
    /** Crop area */
    crop: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    };
    /** Display offset (optional) */
    offset?: {
        dx: number;
        dy: number;
    };
}

export class BGA {
    private _map: Map<string, BGADefinition> = new Map();

    /**
     * Extracts BGA definitions from a BMSChart.
     */
    static fromBMSChart(chart: BMSChart): BGA {
        const bga = new BGA();

        // Scan every header looking for #BGAxx
        chart.headers.each((name: string, value: string) => {
            const bgaMatch = name.match(/^BGA([0-9A-Z]{2})$/i);
            if (bgaMatch && value) {
                const bgaId = bgaMatch[1].toUpperCase();
                const parsed = bga.parseBGAValue(value);
                if (parsed) {
                    bga._map.set(bgaId, {
                        id: bgaId,
                        ...parsed,
                    });
                }
            }
        });

        return bga;
    }

    /**
     * Parses a #BGAxx value.
     * Format: yy x1 y1 x2 y2 [dx dy]
     */
    private parseBGAValue(value: string): Omit<BGADefinition, 'id'> | null {
        // Split on whitespace
        const parts = value.trim().split(/\s+/);

        if (parts.length < 5) {
            return null;
        }

        const bmpId = parts[0].toUpperCase();
        const x1 = parseInt(parts[1], 10);
        const y1 = parseInt(parts[2], 10);
        const x2 = parseInt(parts[3], 10);
        const y2 = parseInt(parts[4], 10);

        // Validate crop coordinates
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
            return null;
        }

        const result: Omit<BGADefinition, 'id'> = {
            bmpId,
            crop: { x1, y1, x2, y2 },
        };

        // Offset present (7 parameters)
        if (parts.length >= 7) {
            const dx = parseInt(parts[5], 10);
            const dy = parseInt(parts[6], 10);
            if (!isNaN(dx) && !isNaN(dy)) {
                result.offset = { dx, dy };
            }
        }

        return result;
    }

    /**
     * Looks up a BGA definition.
     */
    get(id: string): BGADefinition | undefined {
        return this._map.get(id.toUpperCase());
    }

    /**
     * Returns every BGA definition.
     */
    all(): Record<string, BGADefinition> {
        const result: Record<string, BGADefinition> = {};
        this._map.forEach((def, id) => {
            result[id] = def;
        });
        return result;
    }

    /**
     * Number of BGA definitions.
     */
    count(): number {
        return this._map.size;
    }

    /**
     * Checks whether a BGA definition exists.
     */
    has(id: string): boolean {
        return this._map.has(id.toUpperCase());
    }
}
