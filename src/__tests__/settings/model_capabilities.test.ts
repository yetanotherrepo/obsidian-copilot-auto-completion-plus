import {describe, expect, test} from "@jest/globals";

import {capabilitiesForSettings} from "../../settings/model_capabilities";
import {DEFAULT_SETTINGS} from "../../settings/versions";
import {cloneDeep} from "../../test_utils/clone";

describe("settings model capabilities", () => {
    test("hides sampling controls for OpenAI reasoning models", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openai";
        settings.openAIApiSettings.model = "gpt-5.5";

        const capabilities = capabilitiesForSettings(settings);

        expect(capabilities.isReasoningModel).toEqual(true);
        expect(capabilities.supportsTemperature).toEqual(false);
        expect(capabilities.supportsTopP).toEqual(false);
    });

    test("keeps sampling controls for OpenAI chat-compatible non-reasoning models", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openai";
        settings.openAIApiSettings.model = "gpt-4.1";
        settings.openAIApiSettings.url = "https://api.openai.com/v1/chat/completions";

        const capabilities = capabilitiesForSettings(settings);

        expect(capabilities.isReasoningModel).toEqual(false);
        expect(capabilities.supportsTemperature).toEqual(true);
        expect(capabilities.supportsTopP).toEqual(true);
        expect(capabilities.supportsFrequencyPenalty).toEqual(true);
        expect(capabilities.supportsPresencePenalty).toEqual(true);
    });

    test("uses OpenRouter chat capabilities for regular models", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openrouter";
        settings.openRouterApiSettings.model = "anthropic/claude-test";

        const capabilities = capabilitiesForSettings(settings);

        expect(capabilities.supportsTemperature).toEqual(true);
        expect(capabilities.supportsTopP).toEqual(true);
        expect(capabilities.supportsFrequencyPenalty).toEqual(true);
        expect(capabilities.supportsPresencePenalty).toEqual(true);
        expect(capabilities.supportsMaxTokens).toEqual(true);
        expect(capabilities.supportsModelListing).toEqual(true);
    });

    test("uses only documented DeepSeek sampling controls", () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "deepseek";

        const capabilities = capabilitiesForSettings(settings);

        expect(capabilities.supportsTemperature).toEqual(true);
        expect(capabilities.supportsTopP).toEqual(true);
        expect(capabilities.supportsFrequencyPenalty).toEqual(false);
        expect(capabilities.supportsPresencePenalty).toEqual(false);
        expect(capabilities.supportsMaxTokens).toEqual(true);
        expect(capabilities.supportsModelListing).toEqual(true);
    });
});
