import {UnknownRecord, isRecord} from "./unknown";

type Container = UnknownRecord | unknown[];
type PathSegment = string | number;

export function cloneJson<T>(value: T): T {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
        return value;
    }
    const parsed: unknown = JSON.parse(serialized);
    return parsed as T;
}

export function findEqualPaths(left: unknown, right: unknown, basePath = ""): string[] {
    if (
        basePath === ""
        && (!isContainer(left) || !isContainer(right) || Array.isArray(left) || Array.isArray(right))
    ) {
        return [];
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.flatMap((value, index) => equalPathsForEntry(value, right[index], index, basePath));
    }
    if (isRecord(left) && isRecord(right)) {
        return Object.entries(left)
            .flatMap(([key, value]) => equalPathsForEntry(value, right[key], key, basePath));
    }
    return [];
}

export function hasPath(value: unknown, path: string): boolean {
    let current: unknown = value;
    for (const segment of pathSegments(path)) {
        if (!hasContainerKey(current, segment)) {
            return false;
        }
        current = readContainerValue(current, segment);
    }
    return true;
}

export function getPath(value: unknown, path: string): unknown {
    let current: unknown = value;
    for (const segment of pathSegments(path)) {
        if (!hasContainerKey(current, segment)) {
            return undefined;
        }
        current = readContainerValue(current, segment);
    }
    return current;
}

export function setPath(value: Container, path: string, newValue: unknown): void {
    const segments = pathSegments(path);
    let current = value;
    segments.forEach((segment, index) => {
        if (index === segments.length - 1) {
            writeContainerValue(current, segment, newValue);
            return;
        }
        const child = readContainerValue(current, segment);
        const nextChild: Container = isContainer(child)
            ? child
            : typeof segments[index + 1] === "number" ? [] : {};
        if (!isContainer(child)) {
            writeContainerValue(current, segment, nextChild);
        }
        current = nextChild;
    });
}

export function unsetPath(value: Container, path: string): void {
    const segments = pathSegments(path);
    let current: unknown = value;
    for (let index = 0; index < segments.length - 1; index++) {
        current = readContainerValue(current, segments[index]);
        if (!isContainer(current)) {
            return;
        }
    }
    if (!isContainer(current) || segments.length === 0) {
        return;
    }
    const finalSegment = segments[segments.length - 1];
    if (Array.isArray(current) && typeof finalSegment === "number") {
        current.splice(finalSegment, 1);
    } else if (
        isRecord(current)
        && typeof finalSegment === "string"
        && isSafeRecordKey(finalSegment)
    ) {
        delete current[finalSegment];
    }
}

export function areEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true;
    }
    if (!isContainer(left) || !isContainer(right)) {
        return false;
    }
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function equalPathsForEntry(
    value: unknown,
    otherValue: unknown,
    key: PathSegment,
    basePath: string
): string[] {
    if (typeof value === "function" || typeof otherValue === "function") {
        return [];
    }
    const pathPart = typeof key === "number" ? `[${String(key)}]` : key;
    const path = basePath ? `${basePath}.${pathPart}` : pathPart;
    if (isContainer(value) && isContainer(otherValue)) {
        return findEqualPaths(value, otherValue, path);
    }
    return areEqual(value, otherValue) ? [path] : [];
}

function pathSegments(path: string): PathSegment[] {
    return path
        .split(".")
        .filter((segment) => segment.length > 0)
        .map((segment) => {
            const arrayIndexMatch = segment.match(/^\[(\d+)]$/);
            return arrayIndexMatch ? Number(arrayIndexMatch[1]) : segment;
        });
}

function isContainer(value: unknown): value is Container {
    return Array.isArray(value) || isRecord(value);
}

function hasContainerKey(value: unknown, segment: PathSegment): value is Container {
    if (Array.isArray(value) && typeof segment === "number") {
        return segment >= 0 && segment < value.length;
    }
    return isRecord(value)
        && typeof segment === "string"
        && isSafeRecordKey(segment)
        && Object.getOwnPropertyDescriptor(value, segment) !== undefined;
}

function readContainerValue(value: unknown, segment: PathSegment): unknown {
    if (Array.isArray(value) && typeof segment === "number") {
        return value[segment];
    }
    if (isRecord(value) && typeof segment === "string" && isSafeRecordKey(segment)) {
        return value[segment];
    }
    return undefined;
}

function writeContainerValue(container: Container, segment: PathSegment, value: unknown): void {
    if (Array.isArray(container) && typeof segment === "number") {
        container[segment] = value;
    } else if (isRecord(container) && typeof segment === "string" && isSafeRecordKey(segment)) {
        container[segment] = value;
    }
}

function isSafeRecordKey(key: string): boolean {
    return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}
