import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {requestUrl} from "obsidian";

import AnthropicApiClient from "../../../prediction_services/api_clients/AnthropicApiClient";
import AzureOAIClient from "../../../prediction_services/api_clients/AzureOAIClient";
import GeminiApiClient from "../../../prediction_services/api_clients/GeminiApiClient";
import OllamaApiClient from "../../../prediction_services/api_clients/OllamaApiClient";
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

describe("provider API clients", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    test("Anthropic builds a messages request and parses text blocks", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                content: [
                    {type: "text", text: "anthropic prediction"},
                ],
            },
        });

        const client = new AnthropicApiClient(
            "anthropic-key",
            "https://api.anthropic.com/v1/messages",
            "claude-test",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "system", content: "Follow the cursor."},
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("anthropic prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.headers["x-api-key"]).toEqual("anthropic-key");
        expect(JSON.parse(request.body)).toEqual({
            model: "claude-test",
            max_tokens: 256,
            system: "Follow the cursor.",
            messages: [
                {role: "user", content: "Hello <mask/>"},
            ],
        });
    });

    test("Gemini builds a generateContent request and parses candidate parts", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                candidates: [
                    {content: {parts: [{text: "gemini prediction"}]}},
                ],
            },
        });

        const client = new GeminiApiClient(
            "gemini-key",
            "https://generativelanguage.googleapis.com/v1beta",
            "models/gemini-test",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "system", content: "Follow the cursor."},
            {role: "assistant", content: "Example answer"},
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("gemini prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.url).toContain("/models/gemini-test:generateContent");
        expect(request.url).toContain("key=gemini-key");
        expect(JSON.parse(request.body)).toEqual({
            system_instruction: {parts: [{text: "Follow the cursor."}]},
            contents: [
                {role: "model", parts: [{text: "Example answer"}]},
                {role: "user", parts: [{text: "Hello <mask/>"}]},
            ],
            generationConfig: {
                temperature: 0.4,
                topP: 0.8,
                maxOutputTokens: 256,
                frequencyPenalty: 0.25,
                presencePenalty: 0.1,
            },
        });
    });

    test("Azure builds an OpenAI-compatible chat request and parses choices", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                choices: [
                    {message: {content: "azure prediction"}},
                ],
            },
        });

        const client = new AzureOAIClient(
            "azure-key",
            "https://example.openai.azure.com/openai/deployments/gpt-test/chat/completions",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("azure prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.headers["api-key"]).toEqual("azure-key");
        expect(JSON.parse(request.body)).toEqual({
            messages: [
                {role: "user", content: "Hello <mask/>"},
            ],
            temperature: 0.4,
            top_p: 0.8,
            frequency_penalty: 0.25,
            presence_penalty: 0.1,
            max_tokens: 256,
        });
    });

    test("Ollama builds a local chat request and parses message content", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                message: {content: "ollama prediction"},
            },
        });

        const client = new OllamaApiClient(
            "http://localhost:11434/api/chat",
            "llama-test",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("ollama prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(JSON.parse(request.body)).toEqual({
            messages: [
                {role: "user", content: "Hello <mask/>"},
            ],
            stream: false,
            model: "llama-test",
            options: {
                temperature: 0.4,
                top_p: 0.8,
            },
        });
    });

    test("normalizes provider errors with safe diagnostics", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 401,
            json: {
                error: {
                    message: "Invalid API key",
                },
            },
        });

        const client = new AnthropicApiClient(
            "bad-key",
            "https://api.anthropic.com/v1/messages",
            "claude-test",
            modelOptions
        );

        const result = await client.query([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("invalid_key");
            expect(result.error.safeDiagnostics.provider).toEqual("anthropic");
            expect(result.error.safeDiagnostics.requestCharCount).toEqual("Hello <mask/>".length);
        }
    });
});
