import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {requestUrl} from "obsidian";

import OpenRouterApiClient from "../../../prediction_services/api_clients/OpenRouterApiClient";
import {ModelOptions} from "../../../prediction_services/types";

jest.mock("obsidian", () => ({
    requestUrl: jest.fn(),
}), {virtual: true});

const mockedRequestUrl = requestUrl as any;

const modelOptions: ModelOptions = {
    temperature: 0.4,
    top_p: 0.8,
    frequency_penalty: 0.25,
    presence_penalty: 0.1,
    max_tokens: 256,
};

describe("OpenRouterApiClient", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    test("builds a chat completion request with attribution headers", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {choices: [{message: {content: "openrouter prediction"}}]},
        });
        const client = new OpenRouterApiClient(
            "openrouter-key",
            "https://openrouter.ai/api/v1/chat/completions",
            "anthropic/claude-test",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "system", content: "Follow the cursor."},
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("openrouter prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.headers.Authorization).toEqual("Bearer openrouter-key");
        expect(request.headers["HTTP-Referer"]).toEqual(
            "https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus"
        );
        expect(request.headers["X-OpenRouter-Title"]).toEqual("Copilot Auto Completion Plus");
        expect(JSON.parse(request.body)).toEqual({
            model: "anthropic/claude-test",
            messages: [
                {role: "system", content: "Follow the cursor."},
                {role: "user", content: "Hello <mask/>"},
            ],
            temperature: 0.4,
            top_p: 0.8,
            frequency_penalty: 0.25,
            presence_penalty: 0.1,
            max_tokens: 256,
        });
    });

    test("retries without parameters rejected by the selected model", async () => {
        mockedRequestUrl
            .mockResolvedValueOnce({
                status: 400,
                json: {error: {message: "temperature is not a supported parameter"}},
            })
            .mockResolvedValueOnce({
                status: 200,
                json: {choices: [{message: {content: "retry result"}}]},
            });
        const client = new OpenRouterApiClient(
            "openrouter-key",
            "https://openrouter.ai/api/v1/chat/completions",
            "provider/model",
            modelOptions
        );

        const result = await client.queryChatModel([{role: "user", content: "Hello"}]);

        expect(result._unsafeUnwrap()).toEqual("retry result");
        expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(mockedRequestUrl.mock.calls[0][0].body).temperature).toEqual(0.4);
        expect(JSON.parse(mockedRequestUrl.mock.calls[1][0].body).temperature).toBeUndefined();
    });

    test("maps insufficient credits to a quota error", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 402,
            json: {error: {message: "Insufficient credits"}},
        });
        const client = new OpenRouterApiClient(
            "openrouter-key",
            "https://openrouter.ai/api/v1/chat/completions",
            "provider/model",
            modelOptions
        );

        const result = await client.query([{role: "user", content: "Hello"}]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("quota_exceeded");
            expect(result.error.safeDiagnostics.provider).toEqual("openrouter");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("openrouter-key");
        }
    });

    test("loads only models that can return text", async () => {
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
                        id: "provider/image-model",
                        name: "Image Model",
                        architecture: {output_modalities: ["image"]},
                    },
                ],
            },
        });
        const client = new OpenRouterApiClient(
            "openrouter-key",
            "https://openrouter.ai/api/v1/chat/completions",
            "provider/text-model",
            modelOptions
        );

        const result = await client.listModels();

        expect(result._unsafeUnwrap()).toEqual([
            {id: "provider/text-model", name: "Text Model"},
        ]);
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.url).toEqual(
            "https://openrouter.ai/api/v1/models?output_modalities=text&limit=1000"
        );
    });

    test.each([
        "http://127.0.0.1/api/v1/chat/completions",
        "http://169.254.169.254/api/v1/chat/completions",
        "file:///tmp/openrouter",
        "https://example.com/api/v1/chat/completions",
        "https://user:password@openrouter.ai/api/v1/chat/completions",
    ])("does not send the API key or note context to unsafe URL %s", async (url) => {
        const client = new OpenRouterApiClient(
            "openrouter-key",
            url,
            "provider/model",
            modelOptions
        );

        const result = await client.query([
            {role: "user", content: "private note context"},
        ]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("not_configured");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("openrouter-key");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("private note context");
        }
        expect(mockedRequestUrl).not.toHaveBeenCalled();
    });
});
