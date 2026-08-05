import {
    areEqual,
    cloneJson,
    findEqualPaths,
    getPath,
    hasPath,
    setPath,
} from "../../json";
import {UnknownRecord} from "../../unknown";
import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V0,
    Settings as SettingsV0,
    settingsSchema as settingsSchemaV0,
} from "./v0/v0";
import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V1,
    Settings as SettingsV1,
    settingsSchema as settingsSchemaV1,
} from "./v1/v1";
import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V2,
    Settings as SettingsV2,
    settingsSchema as settingsSchemaV2,
} from "./v2/v2";
import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V3,
    Settings as SettingsV3,
    settingsSchema as settingsSchemaV3,
} from "./v3/v3";
import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V4,
    Settings as SettingsV4,
    settingsSchema as settingsSchemaV4,
} from "./v4/v4";

export function migrateFromV0ToV1(settings: SettingsV0): SettingsV1 {
    const updatedSettings: UnknownRecord = {...cloneJson(settings)};
    migrateDefaultSettings(updatedSettings, DEFAULT_SETTINGS_V0, DEFAULT_SETTINGS_V1);
    const migratedDefaults = settingsSchemaV0.parse(updatedSettings);

    const triggers = migratedDefaults.triggers
        .map((trigger) => ({
            ...trigger,
            value: trigger.type === "regex" && !trigger.value.endsWith("$")
                ? `${trigger.value}$`
                : trigger.value,
        }))
        .filter((trigger) => trigger.value.length > 0)
        .filter((trigger) => trigger.type !== "regex" || isRegexValid(trigger.value));

    const chainOfThoughRemovalRegex = isRegexValid(migratedDefaults.chainOfThoughRemovalRegex)
        ? migratedDefaults.chainOfThoughRemovalRegex
        : DEFAULT_SETTINGS_V1.chainOfThoughRemovalRegex;

    return settingsSchemaV1.parse({
        ...migratedDefaults,
        version: "1",
        triggers,
        chainOfThoughRemovalRegex,
        ignoredFilePatterns: DEFAULT_SETTINGS_V1.ignoredFilePatterns,
        ignoredTags: DEFAULT_SETTINGS_V1.ignoredTags,
        cacheSuggestions: DEFAULT_SETTINGS_V1.cacheSuggestions,
        ollamaApiSettings: cloneJson(DEFAULT_SETTINGS_V1.ollamaApiSettings),
        anthropicApiSettings: cloneJson(DEFAULT_SETTINGS_V1.anthropicApiSettings),
        geminiApiSettings: cloneJson(DEFAULT_SETTINGS_V1.geminiApiSettings),
        debugMode: DEFAULT_SETTINGS_V1.debugMode,
    });
}

export function migrateFromV1ToV2(settings: SettingsV1): SettingsV2 {
    const updatedSettings = cloneJson(settings);
    const promptBundleWasDefault =
        areEqual(updatedSettings.systemMessage, DEFAULT_SETTINGS_V1.systemMessage)
        && areEqual(updatedSettings.userMessageTemplate, DEFAULT_SETTINGS_V1.userMessageTemplate)
        && areEqual(updatedSettings.chainOfThoughRemovalRegex, DEFAULT_SETTINGS_V1.chainOfThoughRemovalRegex)
        && areEqual(updatedSettings.fewShotExamples, DEFAULT_SETTINGS_V1.fewShotExamples);

    return settingsSchemaV2.parse({
        ...updatedSettings,
        version: "2",
        redactSensitiveData: DEFAULT_SETTINGS_V2.redactSensitiveData,
        systemMessage: promptBundleWasDefault
            ? DEFAULT_SETTINGS_V2.systemMessage
            : updatedSettings.systemMessage,
        fewShotExamples: promptBundleWasDefault
            ? cloneJson(DEFAULT_SETTINGS_V2.fewShotExamples)
            : updatedSettings.fewShotExamples,
        chainOfThoughRemovalRegex: promptBundleWasDefault
            ? DEFAULT_SETTINGS_V2.chainOfThoughRemovalRegex
            : updatedSettings.chainOfThoughRemovalRegex,
        promptBundleVersion: promptBundleWasDefault
            ? DEFAULT_SETTINGS_V2.promptBundleVersion
            : "thought_answer_v1",
    });
}

export function migrateFromV2ToV3(settings: SettingsV2): SettingsV3 {
    return settingsSchemaV3.parse({
        ...cloneJson(settings),
        version: "3",
        openRouterApiSettings: cloneJson(DEFAULT_SETTINGS_V3.openRouterApiSettings),
    });
}

export function migrateFromV3ToV4(settings: SettingsV3): SettingsV4 {
    return settingsSchemaV4.parse({
        ...cloneJson(settings),
        version: "4",
        deepSeekApiSettings: cloneJson(DEFAULT_SETTINGS_V4.deepSeekApiSettings),
    });
}

export function isSettingsV0(settings: unknown): settings is SettingsV0 {
    return settingsSchemaV0.safeParse(settings).success;
}

export function isSettingsV1(settings: unknown): settings is SettingsV1 {
    return settingsSchemaV1.safeParse(settings).success;
}

export function isSettingsV2(settings: unknown): settings is SettingsV2 {
    return settingsSchemaV2.safeParse(settings).success;
}

export function isSettingsV3(settings: unknown): settings is SettingsV3 {
    return settingsSchemaV3.safeParse(settings).success;
}

export function isSettingsV4(settings: unknown): settings is SettingsV4 {
    return settingsSchemaV4.safeParse(settings).success;
}

function migrateDefaultSettings(
    settings: UnknownRecord,
    previousDefault: unknown,
    currentDefault: unknown
): void {
    for (const path of findEqualPaths(settings, previousDefault)) {
        if (hasPath(currentDefault, path)) {
            setPath(settings, path, cloneJson(getPath(currentDefault, path)));
        }
    }
}

function isRegexValid(value: string): boolean {
    try {
        const regex = new RegExp(value);
        regex.test("");
        return true;
    } catch {
        return false;
    }
}
