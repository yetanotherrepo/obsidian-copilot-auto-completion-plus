import {beforeAll, describe, expect, jest, test} from "@jest/globals";
import * as React from "react";
import {TextDecoder, TextEncoder} from "util";

import SettingsView from "../../settings/SettingsView";
import {DEFAULT_SETTINGS, Settings} from "../../settings/versions";
import {cloneDeep} from "../../test_utils/clone";

jest.mock("obsidian", () => ({
    Notice: jest.fn(),
    requestUrl: jest.fn(),
}), {virtual: true});

const testGlobal = globalThis as typeof globalThis & {
    TextEncoder: typeof globalThis.TextEncoder;
    TextDecoder: typeof globalThis.TextDecoder;
};
testGlobal.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
testGlobal.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;

let renderToStaticMarkup: typeof import("react-dom/server").renderToStaticMarkup;

beforeAll(async () => {
    ({renderToStaticMarkup} = await import("react-dom/server"));
});

function renderSettings(settings: Settings): string {
    return renderToStaticMarkup(
        React.createElement(SettingsView, {
            settings,
            pluginVersion: "1.0.0",
            onSettingsChanged: jest.fn(),
        })
    );
}

describe("SettingsView quick setup", () => {
    test("shows a compact OpenAI-first quick setup by default", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.advancedMode = false;

        const html = renderSettings(settings);

        expect(html).toContain("Quick Setup");
        expect(html).toContain("OpenAI API Key");
        expect(html).toContain("GPT-5.4 mini");
        expect(html).toContain("Test Connection");
        expect(html).not.toContain("Cache Completions");
        expect(html).not.toContain("Debug Mode");
        expect(html).not.toContain("Model Options");
        expect(html).not.toContain("Trigger Words");
        expect(html).not.toContain("Prompt Engineering");
    });

    test("shows current non-OpenAI provider without exposing provider switching", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "anthropic";
        settings.advancedMode = false;

        const html = renderSettings(settings);

        expect(html).toContain("Anthropic API Key");
        expect(html).toContain("Claude Sonnet 4.6");
        expect(html).toContain("This vault is already configured to use this provider");
        expect(html).not.toContain("API Provider");
    });

    test("reveals advanced settings behind the Advanced Settings toggle", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.advancedMode = true;

        const html = renderSettings(settings);

        expect(html).toContain("Advanced Settings");
        expect(html).toContain("Cache Completions");
        expect(html).toContain("Debug Mode");
        expect(html).toContain("Provider &amp; Endpoints");
        expect(html).toContain("Model Options");
        expect(html).toContain("Trigger Words");
        expect(html).toContain("Prompt Engineering");
    });

    test("shows OpenRouter settings for an OpenRouter vault", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openrouter";
        settings.openRouterApiSettings.model = "anthropic/claude-test";

        const html = renderSettings(settings);

        expect(html).toContain("OpenRouter API Key");
        expect(html).toContain("anthropic/claude-test");
        expect(html).toContain("Unverified");
        expect(html).toContain("Test Connection");
    });

    test("shows DeepSeek settings and current recommended models", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "deepseek";

        const html = renderSettings(settings);

        expect(html).toContain("DeepSeek API Key");
        expect(html).toContain("DeepSeek V4 Flash");
        expect(html).toContain("DeepSeek V4 Pro");
        expect(html).toContain("Test Connection");
    });

    test("marks unsupported OpenRouter models in the model selector", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openrouter";
        settings.openRouterApiSettings.model = "morph/morph-v3-fast";

        const html = renderSettings(settings);

        expect(html).toContain("Unsupported");
        expect(html).toContain("Choose another model");
    });
});
