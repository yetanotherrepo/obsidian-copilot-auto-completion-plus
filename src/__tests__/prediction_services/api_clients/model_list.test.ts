import {describe, expect, jest, test} from "@jest/globals";

jest.mock("obsidian", () => ({
    requestUrl: jest.fn(),
}), {virtual: true});

import {
    getAdvancedModelOptions,
    getQuickModels,
} from "../../../prediction_services/api_clients/model_list";

describe("provider model recommendations", () => {
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
});
