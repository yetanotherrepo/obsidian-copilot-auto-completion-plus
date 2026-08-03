import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {requestUrl} from "obsidian";

import OpenAIApiClient from "../../../prediction_services/api_clients/OpenAIApiClient";
import {ModelOptions} from "../../../prediction_services/types";

jest.mock("obsidian", () => ({
    requestUrl: jest.fn(),
}), {virtual: true});

const mockedRequestUrl = requestUrl as any;

const modelOptions: ModelOptions = {
    temperature: 0.4,
    top_p: 0.8,
    frequency_penalty: 0.25,
    presence_penalty: 0,
    max_tokens: 256,
};

describe("OpenAIApiClient", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    test("uses the Responses API request shape for /responses URLs", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                output: [
                    {
                        type: "message",
                        content: [
                            {type: "output_text", text: "predicted text"},
                        ],
                    },
                ],
            },
        });

        const client = new OpenAIApiClient(
            "openai-key",
            "https://api.openai.com/v1/responses",
            "gpt-test",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "system", content: "Follow the cursor."},
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("predicted text");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.url).toEqual("https://api.openai.com/v1/responses");
        expect(request.headers.Authorization).toEqual("Bearer openai-key");
        expect(JSON.parse(request.body)).toEqual({
            model: "gpt-test",
            input: [
                {role: "user", content: "Hello <mask/>"},
            ],
            instructions: "Follow the cursor.",
            max_output_tokens: 256,
            store: false,
            temperature: 0.4,
            top_p: 0.8,
        });
    });

    test("omits sampling parameters for GPT-5 reasoning models in the Responses API", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                output_text: "reasoning prediction",
            },
        });

        const client = new OpenAIApiClient(
            "openai-key",
            "https://api.openai.com/v1/responses",
            "gpt-5.5",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("reasoning prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(JSON.parse(request.body)).toEqual({
            model: "gpt-5.5",
            input: [
                {role: "user", content: "Hello <mask/>"},
            ],
            max_output_tokens: 256,
            store: false,
        });
    });

    test("reports an incomplete response when reasoning uses the output token limit", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                status: "incomplete",
                incomplete_details: {reason: "max_output_tokens"},
                output: [],
                usage: {
                    output_tokens: 256,
                    output_tokens_details: {reasoning_tokens: 256},
                },
            },
        });

        const client = new OpenAIApiClient(
            "openai-key",
            "https://api.openai.com/v1/responses",
            "gpt-5.4-mini",
            modelOptions
        );

        const result = await client.query([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("incomplete_response");
            expect(result.error.safeDiagnostics.responseStatus).toEqual("incomplete");
            expect(result.error.safeDiagnostics.incompleteReason).toEqual("max_output_tokens");
            expect(result.error.safeDiagnostics.outputTokenCount).toEqual(256);
            expect(result.error.safeDiagnostics.reasoningTokenCount).toEqual(256);
            expect(result.error.message).toContain("Increase Max tokens");
        }
    });

    test("reports a refusal without storing the refusal text", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                status: "completed",
                output: [
                    {
                        type: "message",
                        content: [
                            {type: "refusal", refusal: "Private provider text"},
                        ],
                    },
                ],
            },
        });

        const client = new OpenAIApiClient(
            "openai-key",
            "https://api.openai.com/v1/responses",
            "gpt-5.4-mini",
            modelOptions
        );

        const result = await client.query([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result.isErr()).toEqual(true);
        if (result.isErr()) {
            expect(result.error.code).toEqual("model_refusal");
            expect(result.error.message).not.toContain("Private provider text");
            expect(JSON.stringify(result.error.safeDiagnostics)).not.toContain("Private provider text");
        }
    });

    test("retries OpenAI requests after removing unsupported top-level parameters", async () => {
        mockedRequestUrl
            .mockResolvedValueOnce({
                status: 400,
                json: {
                    error: {
                        message: "Unsupported parameter: 'top_p' is not supported with this model.",
                    },
                },
            })
            .mockResolvedValueOnce({
                status: 400,
                json: {
                    error: {
                        message: "Unsupported parameter: 'temperature' is not supported with this model.",
                    },
                },
            })
            .mockResolvedValueOnce({
                status: 200,
                json: {
                    output_text: "future model prediction",
                },
            });

        const client = new OpenAIApiClient(
            "openai-key",
            "https://api.openai.com/v1/responses",
            "gpt-future",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("future model prediction");
        expect(mockedRequestUrl).toHaveBeenCalledTimes(3);

        const firstBody = JSON.parse(mockedRequestUrl.mock.calls[0][0].body);
        expect(firstBody.top_p).toEqual(0.8);
        expect(firstBody.temperature).toEqual(0.4);

        const secondBody = JSON.parse(mockedRequestUrl.mock.calls[1][0].body);
        expect(secondBody.top_p).toBeUndefined();
        expect(secondBody.temperature).toEqual(0.4);

        const thirdBody = JSON.parse(mockedRequestUrl.mock.calls[2][0].body);
        expect(thirdBody.top_p).toBeUndefined();
        expect(thirdBody.temperature).toBeUndefined();
    });

    test("keeps the Chat Completions request shape for compatible URLs", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                choices: [
                    {message: {content: "compatible prediction"}},
                ],
            },
        });

        const client = new OpenAIApiClient(
            "",
            "http://localhost:1234/v1/chat/completions",
            "local-model",
            modelOptions
        );

        const result = await client.queryChatModel([
            {role: "user", content: "Hello <mask/>"},
        ]);

        expect(result._unsafeUnwrap()).toEqual("compatible prediction");
        const request = mockedRequestUrl.mock.calls[0][0] as any;
        expect(request.url).toEqual("http://localhost:1234/v1/chat/completions");
        expect(request.headers.Authorization).toBeUndefined();
        expect(JSON.parse(request.body)).toEqual({
            messages: [
                {role: "user", content: "Hello <mask/>"},
            ],
            model: "local-model",
            temperature: 0.4,
            top_p: 0.8,
            frequency_penalty: 0.25,
            presence_penalty: 0,
            max_completion_tokens: 256,
        });
    });
});
