import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V0,
    Settings as SettingsV0,
    settingsSchema as settingsSchemaV0,
    Trigger
} from "./v0/v0";
import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V1,
    Settings as SettingsV1,
    settingsSchema as settingsSchemaV1
} from "./v1/v1";
import {findEqualPaths, isRegexValid} from "../utils";

export function migrateFromV0ToV1(settings: SettingsV0): SettingsV1 {
    // eslint-disable  @typescript-eslint/no-explicit-any
    const updatedSettings: any = cloneJson(settings);
    migrateDefaultSettings(updatedSettings, DEFAULT_SETTINGS_V0, DEFAULT_SETTINGS_V1);

    updatedSettings.triggers.forEach((trigger: Trigger) => {
        // Check if the trigger type is 'regex' and if its value does not end with '$'
        if (trigger.type === 'regex' && !trigger.value.endsWith('$')) {
            // Append '$' to the trigger value
            trigger.value += '$';
        }
    });

    updatedSettings.triggers = updatedSettings
        .triggers
        .filter((trigger: Trigger) => trigger.value.length > 0)
        .filter((trigger: Trigger) => trigger.type !== 'regex' || isRegexValid(trigger.value));

    // Add the 'version' property with the value '1'
    updatedSettings.version = '1';

    if (!isRegexValid(updatedSettings.chainOfThoughRemovalRegex)) {
        updatedSettings.chainOfThoughRemovalRegex = DEFAULT_SETTINGS_V1.chainOfThoughRemovalRegex;
    }

    updatedSettings.ignoredFilePatterns = DEFAULT_SETTINGS_V1.ignoredFilePatterns;
    updatedSettings.ignoredTags = DEFAULT_SETTINGS_V1.ignoredTags;
    updatedSettings.cacheSuggestions = DEFAULT_SETTINGS_V1.cacheSuggestions;
    updatedSettings.ollamaApiSettings = DEFAULT_SETTINGS_V1.ollamaApiSettings;
    updatedSettings.anthropicApiSettings = DEFAULT_SETTINGS_V1.anthropicApiSettings;
    updatedSettings.geminiApiSettings = DEFAULT_SETTINGS_V1.geminiApiSettings;
    updatedSettings.debugMode = DEFAULT_SETTINGS_V1.debugMode;

    // Parsing the updated settings to ensure they match the SettingsV1 schema
    return settingsSchemaV1.parse(updatedSettings);
}


function migrateDefaultSettings(setting: any, previousDefault: any, currentDefault: any): any {
    const unchangedDefaultProperties = findEqualPaths(setting, previousDefault);
    for (const path of unchangedDefaultProperties) {
        if (hasPath(currentDefault, path)) {
            const newDefaultValue = getPath(currentDefault, path);
            setPath(setting, path, newDefaultValue);
        }
    }
}


export const isSettingsV0 = (settings: object): boolean => {
    const result = settingsSchemaV0.safeParse(settings);
    return result.success;
}


export const isSettingsV1 = (settings: object): boolean => {
    const result = settingsSchemaV1.safeParse(settings);
    return result.success;
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
