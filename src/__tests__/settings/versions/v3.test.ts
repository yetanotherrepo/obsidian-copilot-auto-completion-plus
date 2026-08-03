import {describe, expect, test} from "@jest/globals";

import {DEFAULT_SETTINGS as DEFAULT_SETTINGS_V2} from "../../../settings/versions/v2/v2";
import {DEFAULT_SETTINGS, settingsSchema} from "../../../settings/versions/v3/v3";
import {isSettingsV3, migrateFromV2ToV3} from "../../../settings/versions/migration";
import {deserializeSettings} from "../../../settings/utils";
import {cloneDeep} from "../../../test_utils/clone";

describe("settings v3", () => {
    test("default settings include OpenRouter", () => {
        expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toEqual(true);
        expect(DEFAULT_SETTINGS.version).toEqual("3");
        expect(DEFAULT_SETTINGS.openRouterApiSettings).toEqual({
            key: "",
            url: "https://openrouter.ai/api/v1/chat/completions",
            model: "",
        });
    });

    test("migrates v2 without changing existing provider settings", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS_V2);
        settings.apiProvider = "anthropic";
        settings.anthropicApiSettings.key = "existing-key";
        settings.anthropicApiSettings.model = "existing-model";

        const migrated = migrateFromV2ToV3(settings);

        expect(isSettingsV3(migrated)).toEqual(true);
        expect(migrated.version).toEqual("3");
        expect(migrated.apiProvider).toEqual("anthropic");
        expect(migrated.anthropicApiSettings.key).toEqual("existing-key");
        expect(migrated.anthropicApiSettings.model).toEqual("existing-model");
        expect(migrated.openRouterApiSettings).toEqual(DEFAULT_SETTINGS.openRouterApiSettings);
    });

    test("loads persisted v2 data as v3", () => {
        const result = deserializeSettings({settings: cloneDeep(DEFAULT_SETTINGS_V2)});

        expect(result.isOk()).toEqual(true);
        if (result.isOk()) {
            expect(result.value.version).toEqual("3");
            expect(result.value.openRouterApiSettings).toEqual(DEFAULT_SETTINGS.openRouterApiSettings);
        }
    });

    test.each([
        "http://openrouter.ai/api/v1/chat/completions",
        "http://127.0.0.1/api/v1/chat/completions",
        "http://169.254.169.254/api/v1/chat/completions",
        "file:///tmp/openrouter",
        "ftp://openrouter.ai/api/v1/chat/completions",
        "https://user:password@openrouter.ai/api/v1/chat/completions",
        "https://example.com/api/v1/chat/completions",
        "https://openrouter.ai/api/v1/chat/completions?target=example.com",
    ])("rejects unsafe OpenRouter URL %s", (url) => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.openRouterApiSettings.url = url;

        const result = settingsSchema.safeParse(settings);

        expect(result.success).toEqual(false);
    });
});
