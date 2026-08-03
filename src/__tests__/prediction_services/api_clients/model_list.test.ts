import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {requestUrl} from "obsidian";

jest.mock("obsidian", () => ({
    requestUrl: jest.fn(),
}), {virtual: true});

import {
    fetchModelsForProvider,
    getAdvancedModelOptions,
    getQuickModels,
} from "../../../prediction_services/api_clients/model_list";
import {DEFAULT_SETTINGS} from "../../../settings/versions";
import {cloneDeep} from "../../../test_utils/clone";

const mockedRequestUrl = requestUrl as any;

describe("provider model recommendations", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });
    test.each(["openai", "anthropic", "gemini"] as const)(
        "returns only 3-5 quick models for %s",
        (provider) => {
            const models = getQuickModels(provider);

            expect(models.length).toBeGreaterThanOrEqual(3);
            expect(models.length).toBeLessThanOrEqual(5);
            expect(models.every((model) => model.provider === provider)).toEqual(true);
            expect(models.every((model) => model.quickVisible)).toEqual(true);
            expect(models.every((model) => model.lastVerified === "2026-05-30")).toEqual(true);
        }
    );

    test("sorts OpenAI quick models from fastest to quality-first", () => {
        const models = getQuickModels("openai");

        expect(models.map((model) => model.id)).toEqual([
            "gpt-5.4-nano",
            "gpt-5.4-mini",
            "gpt-5.4",
            "gpt-5.5",
        ]);
    });

    test("marks exactly one quick model as recommended per cloud provider", () => {
        for (const provider of ["openai", "anthropic", "gemini"] as const) {
            expect(getQuickModels(provider).filter((model) => model.recommended)).toHaveLength(1);
        }
    });

    test("preserves current custom model in advanced options", () => {
        const options = getAdvancedModelOptions(
            "openai",
            "custom-frontier-model",
            [{id: "gpt-5.4-mini", name: "GPT-5.4 mini"}]
        );

        expect(options[0]).toEqual({id: "custom-frontier-model", name: "custom-frontier-model"});
        expect(options[1]).toEqual({id: "gpt-5.4-mini", name: "GPT-5.4 mini"});
    });

    test("loads only OpenRouter models suitable for text autocomplete", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                data: [
                    {
                        id: "provider/text-model",
                        name: "Text Model",
                        architecture: {output_modalities: ["text"]},
                    },
                    {
                        id: "provider/audio-model",
                        name: "Audio Model",
                        architecture: {output_modalities: ["audio"]},
                    },
                    {
                        id: "provider/text-and-audio-model",
                        name: "Text and Audio Model",
                        architecture: {output_modalities: ["text", "audio"]},
                    },
                    {
                        id: "morph/morph-v3-large",
                        name: "Morph V3 Large",
                        architecture: {output_modalities: ["text"]},
                    },
                    {
                        id: "openai/gpt-oss-safeguard-20b",
                        name: "Safeguard",
                        architecture: {output_modalities: ["text"]},
                    },
                ],
            },
        });
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openrouter";
        settings.openRouterApiSettings.key = "openrouter-key";

        const result = await fetchModelsForProvider(settings);

        expect(result._unsafeUnwrap()).toEqual([
            {id: "provider/text-model", name: "Text Model"},
        ]);
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.headers.Authorization).toEqual("Bearer openrouter-key");
        expect(request.url).toEqual(
            "https://openrouter.ai/api/v1/models?output_modalities=text&limit=1000"
        );
    });

    test("does not load OpenRouter models through an unsafe endpoint", async () => {
        const settings = cloneDeep(DEFAULT_SETTINGS);
        settings.apiProvider = "openrouter";
        settings.openRouterApiSettings.key = "openrouter-key";
        settings.openRouterApiSettings.url = "http://169.254.169.254/api/v1/chat/completions";

        const result = await fetchModelsForProvider(settings);

        expect(result.isErr()).toEqual(true);
        expect(mockedRequestUrl).not.toHaveBeenCalled();
    });
});
