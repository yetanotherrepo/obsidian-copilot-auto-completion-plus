export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readArray(value: unknown, key: string): unknown[] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const field = value[key];
    return Array.isArray(field) ? field : undefined;
}

export function readRecord(value: unknown, key: string): UnknownRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const field = value[key];
    return isRecord(field) ? field : undefined;
}

export function readString(value: unknown, key: string): string | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const field = value[key];
    return typeof field === "string" ? field : undefined;
}

export function readNumber(value: unknown, key: string): number | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const field = value[key];
    return typeof field === "number" ? field : undefined;
}
