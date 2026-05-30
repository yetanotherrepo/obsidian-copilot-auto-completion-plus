import {describe, expect, test} from "@jest/globals";

import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V1,
    Settings as SettingsV1,
} from "../../../settings/versions/v1/v1";
import {
    DEFAULT_SETTINGS,
    settingsSchema,
} from "../../../settings/versions/v2/v2";
import {isSettingsV2, migrateFromV1ToV2} from "../../../settings/versions/migration";
import {cloneDeep} from "../../../test_utils/clone";

describe("settings v2", () => {
    test("default settings are valid", () => {
        expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toEqual(true);
        expect(DEFAULT_SETTINGS.version).toEqual("2");
        expect(DEFAULT_SETTINGS.promptBundleVersion).toEqual("answer_only_v2");
        expect(DEFAULT_SETTINGS.chainOfThoughRemovalRegex).toEqual("");
        expect(DEFAULT_SETTINGS.openAIApiSettings.model).toEqual("gpt-5.4-mini");
    });

    test("migrates untouched default prompt bundle to answer-only v2", () => {
        const migrated = migrateFromV1ToV2(cloneDeep(DEFAULT_SETTINGS_V1));

        expect(isSettingsV2(migrated)).toEqual(true);
        expect(migrated.version).toEqual("2");
        expect(migrated.promptBundleVersion).toEqual("answer_only_v2");
        expect(migrated.systemMessage).toEqual(DEFAULT_SETTINGS.systemMessage);
        expect(migrated.openAIApiSettings.model).toEqual(DEFAULT_SETTINGS.openAIApiSettings.model);
        expect(migrated.chainOfThoughRemovalRegex).toEqual("");
        expect(migrated.fewShotExamples[0].answer).not.toContain("THOUGHT:");
        expect(migrated.fewShotExamples[0].answer).not.toContain("ANSWER:");
    });

    test("preserves customized legacy prompt bundle during migration", () => {
        const settings: SettingsV1 = {
            ...cloneDeep(DEFAULT_SETTINGS_V1),
            systemMessage: "Custom system message",
        };

        const migrated = migrateFromV1ToV2(settings);

        expect(migrated.promptBundleVersion).toEqual("thought_answer_v1");
        expect(migrated.systemMessage).toEqual("Custom system message");
        expect(migrated.chainOfThoughRemovalRegex).toEqual(DEFAULT_SETTINGS_V1.chainOfThoughRemovalRegex);
    });

    test("preserves existing selected OpenAI model during migration", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS_V1);
        settings.openAIApiSettings.model = "gpt-5.5";

        const migrated = migrateFromV1ToV2(settings);

        expect(migrated.openAIApiSettings.model).toEqual("gpt-5.5");
    });
});
