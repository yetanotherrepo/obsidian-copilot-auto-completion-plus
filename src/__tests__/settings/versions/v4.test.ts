import {describe, expect, test} from "@jest/globals";

import {DEFAULT_SETTINGS as DEFAULT_SETTINGS_V3} from "../../../settings/versions/v3/v3";
import {DEFAULT_SETTINGS, settingsSchema} from "../../../settings/versions/v4/v4";
import {isSettingsV4, migrateFromV3ToV4} from "../../../settings/versions/migration";
import {deserializeSettings} from "../../../settings/utils";
import {cloneDeep} from "../../../test_utils/clone";

describe("settings v4", () => {
    test("default settings include DeepSeek", () => {
        expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toEqual(true);
        expect(DEFAULT_SETTINGS.version).toEqual("4");
        expect(DEFAULT_SETTINGS.deepSeekApiSettings).toEqual({
            key: "",
            url: "https://api.deepseek.com/chat/completions",
            model: "deepseek-v4-flash",
        });
    });

    test("migrates v3 without changing existing provider settings", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS_V3);
        settings.apiProvider = "openrouter";
        settings.openRouterApiSettings.key = "existing-key";
        settings.openRouterApiSettings.model = "existing-model";

        const migrated = migrateFromV3ToV4(settings);

        expect(isSettingsV4(migrated)).toEqual(true);
        expect(migrated.version).toEqual("4");
        expect(migrated.apiProvider).toEqual("openrouter");
        expect(migrated.openRouterApiSettings.key).toEqual("existing-key");
        expect(migrated.openRouterApiSettings.model).toEqual("existing-model");
        expect(migrated.deepSeekApiSettings).toEqual(DEFAULT_SETTINGS.deepSeekApiSettings);
    });

    test("loads persisted v3 data as v4", () => {
        const result = deserializeSettings({settings: cloneDeep(DEFAULT_SETTINGS_V3)});

        expect(result.isOk()).toEqual(true);
        if (result.isOk()) {
            expect(result.value.version).toEqual("4");
            expect(result.value.deepSeekApiSettings).toEqual(DEFAULT_SETTINGS.deepSeekApiSettings);
        }
    });

    test.each([
        "http://api.deepseek.com/chat/completions",
        "http://127.0.0.1/chat/completions",
        "http://169.254.169.254/chat/completions",
        "file:///tmp/deepseek",
        "ftp://api.deepseek.com/chat/completions",
        "https://user:password@api.deepseek.com/chat/completions",
        "https://example.com/chat/completions",
        "https://api.deepseek.com/chat/completions?target=example.com",
    ])("rejects unsafe DeepSeek URL %s", (url) => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.deepSeekApiSettings.url = url;

        const result = settingsSchema.safeParse(settings);

        expect(result.success).toEqual(false);
    });
});
