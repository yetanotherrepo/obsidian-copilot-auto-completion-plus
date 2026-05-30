import {DEFAULT_SETTINGS, PluginData, Settings, settingsSchema} from "./versions";
import {z, ZodError, ZodIssueCode, ZodType} from 'zod';
import {isSettingsV0, isSettingsV1, isSettingsV2, migrateFromV0ToV1, migrateFromV1ToV2} from "./versions/migration";
import {err, ok, Result} from "neverthrow";
import * as mm from "micromatch";


type JSONObject = Record<string, any>;

export function checkForErrors(settings: Settings) {
    const errors = new Map<string, string>();
    const parsingResult = parseWithSchema(settingsSchema, settings);

    if (parsingResult.isOk()) {
        return errors;
    }

    if (parsingResult.error instanceof ZodError) {
        for (const issue of parsingResult.error.issues) {
            errors.set(issue.path.join('.'), issue.message);
        }
    } else {
        throw parsingResult.error;
    }

    return errors;
}


export function fixStructureAndValueErrors<T extends ZodType>(
    schema: T,
    value: any | null | undefined,
    defaultValue: z.infer<T>,
): Result<ReturnType<T["parse"]>, Error> {
    if (value === null || value === undefined) {
        value = {};
    }
    let result = parseWithSchema(schema, value);

    if (result.isErr()) {
        value = addMissingKeys(value, result.error, defaultValue);
        value = removeUnrecognizedKeys(value, result.error);
        result = parseWithSchema(schema, value);
    }

    if (result.isErr() && value !== null && value !== undefined) {
        value = replaceValuesWithErrorsByDefaultValue(value, result.error, defaultValue);
        result = parseWithSchema(schema, value);
    }

    return result;
}

export function parseWithSchema<T extends ZodType>(
    schema: T,
    value: JSONObject | null | undefined
): Result<ReturnType<T["parse"]>, ZodError> {
    const parsingResult = schema.safeParse(value);
    return parsingResult.success ? ok(parsingResult.data) : err(parsingResult.error);
}

function addMissingKeys<T extends object>(value: JSONObject, error: ZodError, defaultValue: T): JSONObject {
    const invalidTypeIssues = error.issues.filter(issue => issue.code === ZodIssueCode.invalid_type);
    const errorPaths = invalidTypeIssues
        .map(issue => issue.path)
        .map(path => reduceArrayPathToFirstObjectPath(path))
        .map(path => path.join('.'));

    return replaceValueWithDefaultValue(value, errorPaths, defaultValue);
}

function replaceValueWithDefaultValue<V, T>(
    value: any,
    paths: string[],
    defaultValue: T,
): V {
    const result = cloneJson(value) as any;
    paths.forEach(path => {
        const originalValue = hasPath(defaultValue, path) ? getPath(defaultValue, path) : undefined;
        setPath(result, path, originalValue);
    });

    return result;
}


function removeUnrecognizedKeys(value: JSONObject | null | undefined, error: ZodError): JSONObject {
    if (typeof value !== 'object' || value === null || value === undefined) {
        return {};
    }
    // Zod unrecognized_keys issues consist of two parts:
    // - path to the nested object where the unrecognized key was found
    // - the key itself which is unrecognized
    const unrecognizedPaths = error.issues

        .filter(issue => issue.code === ZodIssueCode.unrecognized_keys)
        // Array path will be handled separately by the value replacement function
        .filter(issue => !isAnArrayPath(issue.path))
        .flatMap(issue => {
            // @ts-ignore
            const keys = issue.keys;
            return keys.map(key => [...issue.path, key].join('.'));
        });

    unrecognizedPaths.forEach(path => {
        unsetPath(value, path);
    });
    return value;
}


function replaceValuesWithErrorsByDefaultValue<T>(
    value: JSONObject,
    error: ZodError,
    defaultValue: T
): T {
    const errorPaths = error.issues
        .map(issue => issue.path)
        .map(path => reduceArrayPathToFirstObjectPath(path))
        .map(path => path.join('.'));

    return replaceValueWithDefaultValue(value, errorPaths, defaultValue);
}

function reduceArrayPathToFirstObjectPath(path: (string | number)[]): (string | number)[] {
    const result: (string | number)[] = [];
    for (const key of path) {
        if (typeof key === 'number') {
            break;
        }
        result.push(key);
    }

    return result;
}

function isAnArrayPath(path: (string | number)[]): boolean {
    return path.some(key => typeof key === 'number');
}

export function serializeSettings(settings: Settings): PluginData {
    return {settings: settings};
}

export function deserializeSettings(data: JSONObject | null | undefined): Result<Settings, Error> {
    let settings: any;
    if (data === null || data === undefined || !data.hasOwnProperty("settings")) {
        settings = {};
    } else {
        settings = data.settings;
    }

    if (isSettingsV0(settings)) {
        settings = migrateFromV0ToV1(settings);
    }
    if (isSettingsV1(settings)) {
        settings = migrateFromV1ToV2(settings);
    }
    if (!isSettingsV2(settings)) {
        return fixStructureAndValueErrors(settingsSchema, settings, DEFAULT_SETTINGS);
    }

    return parseWithSchema(settingsSchema, settings);
}

export function isRegexValid(value: string): boolean {
    try {
        const regex = new RegExp(value);
        regex.test("");
        return true;
    } catch (e) {
        return false;
    }
}

export function isValidIgnorePattern(value: string): boolean {
    try {
        mm.isMatch("", value);
        return true;
    } catch (e) {
        return false;
    }
}

export function findEqualPaths(obj1: any, obj2: any, basePath = ''): string[] {
    let paths: string[] = [];

    if (
        basePath === ''
        && (
            !isRecordLike(obj1)
            || !isRecordLike(obj2)
            || Array.isArray(obj1)
            || Array.isArray(obj2)
            || typeof obj1 === "number"
            || typeof obj2 === "number"
            || typeof obj1 === "string"
            || typeof obj2 === "string"
        )
    ) {
        return [];
    }

    function iterateKeys(value: any, key: string | number): void {
        const pathPart = typeof key === "number" ? `[${key}]` : key;
        const path = basePath ? `${basePath}.${pathPart}` : `${pathPart}`;
        const otherValue = obj2[key];
        if (isRecordLike(value) && isRecordLike(otherValue)) {
            paths = paths.concat(findEqualPaths(value, otherValue, path));
        } else if (typeof value !== "function" && areEqual(value, otherValue)) {
            paths.push(path);
        }
    }

    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        obj1.forEach((value, index) => iterateKeys(value, index));
    } else {
        Object.entries(obj1).forEach(([key, value]) => iterateKeys(value, key));
    }

    return paths;
}

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function pathSegments(path: string): (string | number)[] {
    return path
        .split(".")
        .filter(segment => segment.length > 0)
        .map(segment => {
            const arrayIndexMatch = segment.match(/^\[(\d+)]$/);
            return arrayIndexMatch ? Number(arrayIndexMatch[1]) : segment;
        });
}

function hasPath(value: any, path: string): boolean {
    let current = value;
    for (const segment of pathSegments(path)) {
        if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, segment)) {
            return false;
        }
        current = current[segment];
    }
    return true;
}

function getPath(value: any, path: string): any {
    let current = value;
    for (const segment of pathSegments(path)) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[segment];
    }
    return current;
}

function setPath(value: any, path: string, newValue: any): void {
    const segments = pathSegments(path);
    let current = value;
    segments.forEach((segment, index) => {
        if (index === segments.length - 1) {
            current[segment] = newValue;
            return;
        }
        if (current[segment] === null || current[segment] === undefined) {
            current[segment] = typeof segments[index + 1] === "number" ? [] : {};
        }
        current = current[segment];
    });
}

function unsetPath(value: any, path: string): void {
    const segments = pathSegments(path);
    let current = value;
    for (let index = 0; index < segments.length - 1; index++) {
        current = current[segments[index]];
        if (current === null || current === undefined) {
            return;
        }
    }
    delete current[segments[segments.length - 1]];
}

function isRecordLike(value: any): boolean {
    return typeof value === "object" && value !== null;
}

function areEqual(value1: any, value2: any): boolean {
    if (value1 === value2) {
        return true;
    }
    if (!isRecordLike(value1) || !isRecordLike(value2)) {
        return false;
    }
    try {
        return JSON.stringify(value1) === JSON.stringify(value2);
    } catch {
        return false;
    }
}
