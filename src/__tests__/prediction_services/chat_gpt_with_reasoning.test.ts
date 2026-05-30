import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {requestUrl} from "obsidian";

import ChatGPTWithReasoning from "../../prediction_services/chat_gpt_with_reasoning";
import {DEFAULT_SETTINGS, Settings} from "../../settings/versions";
import {cloneDeep} from "../../test_utils/clone";

jest.mock("obsidian", () => ({
    requestUrl: jest.fn(),
}), {virtual: true});

const mockedRequestUrl = requestUrl as any;

describe("ChatGPTWithReasoning prediction pipeline", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    test("accepts answer-only prompt responses without extraction regex", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {output_text: "predicted text"},
        });

        const service = ChatGPTWithReasoning.fromSettings(testSettings());
        const result = await service.fetchPredictions("Hello ", "");

        expect(result._unsafeUnwrap()).toEqual("predicted text");
    });

    test("redacts sensitive data before sending provider request", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {output_text: "safe prediction"},
        });

        const service = ChatGPTWithReasoning.fromSettings(testSettings({
            redactSensitiveData: true,
        }));
        await service.fetchPredictions(
            "Email alice@example.com and use Bearer secret-token-value-1234567890 ",
            ""
        );

        const request = JSON.parse(mockedRequestUrl.mock.calls[0][0].body);
        const serializedRequest = JSON.stringify(request);
        expect(serializedRequest).not.toContain("alice@example.com");
        expect(serializedRequest).not.toContain("secret-token-value-1234567890");
        expect(serializedRequest).toContain("[redacted-email]");
        expect(serializedRequest).toContain("Bearer [redacted-token]");
    });

    test("removes dataview blocks before building the provider request", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {output_text: "after dataview"},
        });

        const service = ChatGPTWithReasoning.fromSettings(testSettings({
            dontIncludeDataviews: true,
        }));
        await service.fetchPredictions(
            "```dataview\nTABLE file.name\n```\nActual note ",
            ""
        );

        const request = JSON.parse(mockedRequestUrl.mock.calls[0][0].body);
        expect(JSON.stringify(request)).not.toContain("TABLE file.name");
        expect(JSON.stringify(request)).toContain("Actual note");
    });

    test("keeps compatibility with legacy ANSWER extraction prompts", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                output_text: "THOUGHT: brief\nLANGUAGE: English\nANSWER: legacy prediction",
            },
        });

        const service = ChatGPTWithReasoning.fromSettings(testSettings({
            promptBundleVersion: "thought_answer_v1",
            chainOfThoughRemovalRegex: "(.|\\n)*ANSWER:",
        }));
        const result = await service.fetchPredictions("Hello ", "");

        expect(result._unsafeUnwrap()).toEqual("legacy prediction");
    });
});

function testSettings(overrides: Partial<Settings> = {}): Settings {
    const settings = cloneDeep(DEFAULT_SETTINGS);
    return {
        ...settings,
        openAIApiSettings: {
            ...settings.openAIApiSettings,
            key: "test-key",
            model: "gpt-4.1",
            url: "https://api.openai.com/v1/responses",
        },
        fewShotExamples: [],
        ...overrides,
    };
}
