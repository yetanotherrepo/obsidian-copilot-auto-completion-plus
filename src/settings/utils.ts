import {err, ok, Result} from "neverthrow";
import * as mm from "micromatch";
import {ZodError, ZodIssueCode, ZodType} from "zod";

import {
    cloneJson,
    findEqualPaths,
    getPath,
    hasPath,
    setPath,
    unsetPath,
} from "../json";
import {UnknownRecord, isRecord} from "../unknown";
import {DEFAULT_SETTINGS, PluginData, Settings, settingsSchema} from "./versions";
import {
    isSettingsV0,
    isSettingsV1,
    isSettingsV2,
    isSettingsV3,
    isSettingsV4,
    migrateFromV0ToV1,
    migrateFromV1ToV2,
    migrateFromV2ToV3,
    migrateFromV3ToV4,
} from "./versions/migration";

export {findEqualPaths};

export function checkForErrors(settings: Settings): Map<string, string> {
    const errors = new Map<string, string>();
    const parsingResult = parseWithSchema(settingsSchema, settings);
    if (parsingResult.isOk()) {
        return errors;
    }
    for (const issue of parsingResult.error.issues) {
        errors.set(issue.path.join("."), issue.message);
    }
    return errors;
}

export function fixStructureAndValueErrors<Output>(
    schema: ZodType<Output>,
    value: unknown,
    defaultValue: Output,
): Result<Output, Error> {
    let workingValue: unknown = cloneJson(value ?? {});
    let result = parseWithSchema(schema, workingValue);

    if (result.isErr()) {
        workingValue = addMissingKeys(workingValue, result.error, defaultValue);
        workingValue = removeUnrecognizedKeys(workingValue, result.error);
        result = parseWithSchema(schema, workingValue);
    }

    if (result.isErr()) {
        workingValue = replaceValuesWithErrorsByDefaultValue(
            workingValue,
            result.error,
            defaultValue
        );
        result = parseWithSchema(schema, workingValue);
    }

    return result;
}

export function parseWithSchema<Output>(
    schema: ZodType<Output>,
    value: unknown
): Result<Output, ZodError> {
    const parsingResult = schema.safeParse(value);
    return parsingResult.success ? ok(parsingResult.data) : err(parsingResult.error);
}

function addMissingKeys<Output>(value: unknown, error: ZodError, defaultValue: Output): unknown {
    const errorPaths = error.issues
        .filter((issue) => issue.code === ZodIssueCode.invalid_type)
        .map((issue) => reduceArrayPathToFirstObjectPath(issue.path))
        .map((path) => path.join("."));
    return replaceValueWithDefaultValue(value, errorPaths, defaultValue);
}

function replaceValueWithDefaultValue<Output>(
    value: unknown,
    paths: string[],
    defaultValue: Output,
): unknown {
    const cloned = cloneJson(value);
    const result: UnknownRecord | unknown[] = isRecord(cloned) || Array.isArray(cloned)
        ? cloned
        : {};
    for (const path of paths) {
        const originalValue = hasPath(defaultValue, path) ? getPath(defaultValue, path) : undefined;
        setPath(result, path, cloneJson(originalValue));
    }
    return result;
}

function removeUnrecognizedKeys(value: unknown, error: ZodError): unknown {
    if (!isRecord(value)) {
        return {};
    }
    const unrecognizedPaths = error.issues
        .filter((issue) => issue.code === ZodIssueCode.unrecognized_keys)
        .filter((issue) => !isAnArrayPath(issue.path))
        .flatMap((issue) => issue.keys.map((key) => [...issue.path, key].join(".")));

    for (const path of unrecognizedPaths) {
        unsetPath(value, path);
    }
    return value;
}

function replaceValuesWithErrorsByDefaultValue<Output>(
    value: unknown,
    error: ZodError,
    defaultValue: Output
): unknown {
    const errorPaths = error.issues
        .map((issue) => reduceArrayPathToFirstObjectPath(issue.path))
        .map((path) => path.join("."));
    return replaceValueWithDefaultValue(value, errorPaths, defaultValue);
}

function reduceArrayPathToFirstObjectPath(path: Array<string | number>): Array<string | number> {
    const result: Array<string | number> = [];
    for (const key of path) {
        if (typeof key === "number") {
            break;
        }
        result.push(key);
    }
    return result;
}

function isAnArrayPath(path: Array<string | number>): boolean {
    return path.some((key) => typeof key === "number");
}

export function serializeSettings(settings: Settings): PluginData {
    return {settings};
}

export function deserializeSettings(data: unknown): Result<Settings, Error> {
    const record = isRecord(data) ? data : undefined;
    let settings: unknown = record?.settings ?? {};

    if (isSettingsV0(settings)) {
        settings = migrateFromV0ToV1(settings);
    }
    if (isSettingsV1(settings)) {
        settings = migrateFromV1ToV2(settings);
    }
    if (isSettingsV2(settings)) {
        settings = migrateFromV2ToV3(settings);
    }
    if (isSettingsV3(settings)) {
        settings = migrateFromV3ToV4(settings);
    }
    if (!isSettingsV4(settings)) {
        return fixStructureAndValueErrors(settingsSchema, settings, DEFAULT_SETTINGS);
    }
    return parseWithSchema(settingsSchema, settings);
}

export function isRegexValid(value: string): boolean {
    try {
        const regex = new RegExp(value);
        regex.test("");
        return true;
    } catch {
        return false;
    }
}

export function isValidIgnorePattern(value: string): boolean {
    try {
        mm.isMatch("", value);
        return true;
    } catch {
        return false;
    }
}
