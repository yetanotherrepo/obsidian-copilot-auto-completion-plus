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
