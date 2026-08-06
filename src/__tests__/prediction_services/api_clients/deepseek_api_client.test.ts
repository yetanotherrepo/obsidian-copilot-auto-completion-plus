import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {requestUrl} from "obsidian";

import DeepSeekApiClient from "../../../prediction_services/api_clients/DeepSeekApiClient";
import {
    clearRequestDiagnostics,
    getLastRequestDiagnostics,
} from "../../../prediction_services/diagnostics";
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

describe("DeepSeekApiClient", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
        clearRequestDiagnostics();
    });

    test("builds a documented chat completion request", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {choices: [{message: {content: "deepseek prediction"}}]},
        });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "system", content: "Follow the cursor."},
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("deepseek prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.url).toEqual("https://api.deepseek.com/chat/completions");
        expect(request.headers.Authorization).toEqual("Bearer deepseek-key");
        expect(JSON.parse(request.body)).toEqual({
            model: "deepseek-v4-flash",
            messages: [
                {role: "system", content: "Follow the cursor."},
                {role: "user", content: "Hello <mask/>"},
            ],
            temperature: 0.4,
            top_p: 0.8,
            max_tokens: 256,
            thinking: {type: "disabled"},
            stream: false,
        });
    });

    test("does not expose reasoning when the token limit produces no completion", async () => {
        const reasoning = "private reasoning derived from the note";
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                choices: [{
                    finish_reason: "length",
                    message: {content: "", reasoning_content: reasoning},
                }],
                usage: {
                    completion_tokens: 256,
                    completion_tokens_details: {reasoning_tokens: 256},
                },
            },
        });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.query([{role: "user", content: "private note context"}]);

        expect(result.isErr()).toEqual(true);
        expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
        if (result.isErr()) {
            expect(result.error.code).toEqual("incomplete_response");
            expect(result.error.message).toContain("Increase Max Tokens");
            expect(result.error.safeDiagnostics.finishReason).toEqual("length");
            expect(result.error.safeDiagnostics.incompleteReason).toEqual("max_tokens");
            expect(result.error.safeDiagnostics.outputTokenCount).toEqual(256);
            expect(result.error.safeDiagnostics.reasoningTokenCount).toEqual(256);
            expect(result.error.safeDiagnostics.reasoningCharCount).toEqual(reasoning.length);
            expect(result.error.safeDiagnostics.responseCharCount).toEqual(0);
            expect("timestamp" in result.error.safeDiagnostics).toEqual(true);
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain(reasoning);
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("private note context");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("deepseek-key");
        }
    });

    test("retries one transient empty response", async () => {
        mockedRequestUrl
            .mockResolvedValueOnce({
                status: 200,
                json: {choices: [{finish_reason: "stop", message: {content: ""}}]},
            })
            .mockResolvedValueOnce({
                status: 200,
                json: {choices: [{finish_reason: "stop", message: {content: "retry result"}}]},
            });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.queryChatModel([{role: "user", content: "Hello"}]);

        expect(result._unsafeUnwrap()).toEqual("retry result");
        expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
        expect(getLastRequestDiagnostics()?.retryCount).toEqual(1);
        expect(getLastRequestDiagnostics()?.finishReason).toEqual("stop");
    });

    test("stops after one retry when DeepSeek keeps returning empty content", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {choices: [{finish_reason: "stop", message: {content: ""}}]},
        });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.query([{role: "user", content: "Hello"}]);

        expect(result.isErr()).toEqual(true);
        expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
        if (result.isErr()) {
            expect(result.error.code).toEqual("empty_response");
            expect(result.error.safeDiagnostics.retryCount).toEqual(1);
        }
    });

    test("retries without a parameter rejected by a model", async () => {
        mockedRequestUrl
            .mockResolvedValueOnce({
                status: 400,
                json: {error: {message: "temperature is not a supported parameter"}},
            })
            .mockResolvedValueOnce({
                status: 200,
                json: {choices: [{message: {content: "retry result"}}]},
            });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-pro",
            modelOptions
        );

        const result = await client.queryChatModel([{role: "user", content: "Hello"}]);

        expect(result._unsafeUnwrap()).toEqual("retry result");
        expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(mockedRequestUrl.mock.calls[0][0].body).temperature).toEqual(0.4);
        expect(JSON.parse(mockedRequestUrl.mock.calls[1][0].body).temperature).toBeUndefined();
    });

    test("retries without the thinking switch when the API rejects it", async () => {
        mockedRequestUrl
            .mockResolvedValueOnce({
                status: 400,
                json: {error: {message: "thinking is not a supported parameter"}},
            })
            .mockResolvedValueOnce({
                status: 200,
                json: {choices: [{message: {content: "fallback result"}}]},
            });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.queryChatModel([{role: "user", content: "Hello"}]);

        expect(result._unsafeUnwrap()).toEqual("fallback result");
        expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(mockedRequestUrl.mock.calls[0][0].body).thinking).toEqual({type: "disabled"});
        expect(JSON.parse(mockedRequestUrl.mock.calls[1][0].body).thinking).toBeUndefined();
    });

    test("maps insufficient balance to a quota error", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 402,
            json: {error: {message: "Insufficient balance"}},
        });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.query([{role: "user", content: "Hello"}]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("quota_exceeded");
            expect(result.error.safeDiagnostics.provider).toEqual("deepseek");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("deepseek-key");
        }
    });

    test("loads models from the documented endpoint", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                object: "list",
                data: [
                    {id: "deepseek-v4-pro", object: "model", owned_by: "deepseek"},
                    {id: "deepseek-v4-flash", object: "model", owned_by: "deepseek"},
                ],
            },
        });
        const client = new DeepSeekApiClient(
            "deepseek-key",
            "https://api.deepseek.com/chat/completions",
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.listModels();

        expect(result._unsafeUnwrap()).toEqual([
            {id: "deepseek-v4-flash", name: "deepseek-v4-flash"},
            {id: "deepseek-v4-pro", name: "deepseek-v4-pro"},
        ]);
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.url).toEqual("https://api.deepseek.com/models");
        expect(request.headers.Authorization).toEqual("Bearer deepseek-key");
    });

    test.each([
        "http://api.deepseek.com/chat/completions",
        "http://127.0.0.1/chat/completions",
        "http://169.254.169.254/chat/completions",
        "file:///tmp/deepseek",
        "https://example.com/chat/completions",
        "https://user:password@api.deepseek.com/chat/completions",
    ])("does not send the API key or note context to unsafe URL %s", async (url) => {
        const client = new DeepSeekApiClient(
            "deepseek-key",
            url,
            "deepseek-v4-flash",
            modelOptions
        );

        const result = await client.query([
            {role: "user", content: "private note context"},
        ]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("not_configured");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("deepseek-key");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("private note context");
        }
        expect(mockedRequestUrl).not.toHaveBeenCalled();
    });
});
