import {ApiClient, ChatMessage, ModelOptions} from "../types";

import {Settings} from "../../settings/versions";
import {Result} from "neverthrow";
import {makeAPIRequest} from "./utils";


class OpenAIApiClient implements ApiClient {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly modelOptions: ModelOptions;
    private readonly model: string;

    static fromSettings(settings: Settings): OpenAIApiClient {
        return new OpenAIApiClient(
            settings.openAIApiSettings.key,
            settings.openAIApiSettings.url,
            settings.openAIApiSettings.model,
            settings.modelOptions
        );
    }

    constructor(
        apiKey: string,
        url: string,
        model: string,
        modelOptions: ModelOptions
    ) {
        this.apiKey = apiKey;
        this.url = url;
        this.modelOptions = modelOptions;
        this.model = model;
    }

    async queryChatModel(messages: ChatMessage[]): Promise<Result<string, Error>> {
        const body = this.isResponsesUrl()
            ? this.createResponsesBody(messages)
            : this.createChatCompletionsBody(messages);

        const data = await makeAPIRequest(this.url, "POST", body, this.createHeaders());
        return this.isResponsesUrl()
            ? data.map((data) => OpenAIApiClient.extractResponsesText(data))
            : data.map((data) => data.choices[0].message.content);
    }

    private createHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    private createChatCompletionsBody(messages: ChatMessage[]): object {
        const {max_tokens, ...modelOptions} = this.modelOptions;
        return {
            messages,
            model: this.model,
            ...modelOptions,
            max_completion_tokens: max_tokens,
        };
    }

    private createResponsesBody(messages: ChatMessage[]): object {
        const instructions = messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n");
        const input = messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
                role: message.role,
                content: message.content,
            }));

        const body: any = {
            model: this.model,
            input,
            max_output_tokens: this.modelOptions.max_tokens,
            store: false,
            temperature: this.modelOptions.temperature,
            top_p: this.modelOptions.top_p,
        };
        if (instructions) {
            body.instructions = instructions;
        }
        return body;
    }

    private isResponsesUrl(): boolean {
        try {
            return new URL(this.url).pathname.replace(/\/$/, "").endsWith("/responses");
        } catch {
            return this.url.split("?")[0].replace(/\/$/, "").endsWith("/responses");
        }
    }

    private static extractResponsesText(data: any): string {
        if (typeof data.output_text === "string") {
            return data.output_text;
        }

        return (data.output || [])
            .flatMap((item: any) => {
                if (typeof item.content === "string") {
                    return [item.content];
                }
                if (Array.isArray(item.content)) {
                    return item.content
                        .map((content: any) => {
                            if (typeof content.text === "string") {
                                return content.text;
                            }
                            if (typeof content.output_text === "string") {
                                return content.output_text;
                            }
                            return "";
                        });
                }
                return [];
            })
            .join("");
    }

    async checkIfConfiguredCorrectly(): Promise<string[]> {
        const errors: string[] = [];
        if (!this.url) {
            errors.push("OpenAI API url is not set");
        }
        if (!this.model) {
            errors.push("OpenAI model is not set");
        }
        if (errors.length > 0) {
            // api check is not possible without passing previous checks so return early
            return errors;
        }
        const result = await this.queryChatModel([
            {content: "Say hello world and nothing else.", role: "user"},
        ]);

        if (result.isErr()) {
            errors.push(result.error.message);
        }
        return errors;
    }
}

export default OpenAIApiClient;
