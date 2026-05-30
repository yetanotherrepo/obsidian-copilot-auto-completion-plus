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

        const data = await this.makeRequestWithUnsupportedParameterRetry(body);
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

    private createChatCompletionsBody(messages: ChatMessage[]): Record<string, unknown> {
        const {max_tokens, ...modelOptions} = this.modelOptions;
        return {
            messages,
            model: this.model,
            ...modelOptions,
            max_completion_tokens: max_tokens,
        };
    }

    private createResponsesBody(messages: ChatMessage[]): Record<string, unknown> {
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
        };
        if (!this.isOpenAIReasoningModel()) {
            body.temperature = this.modelOptions.temperature;
            body.top_p = this.modelOptions.top_p;
        }
        if (instructions) {
            body.instructions = instructions;
        }
        return body;
    }

    private async makeRequestWithUnsupportedParameterRetry(body: Record<string, unknown>): Promise<Result<any, Error>> {
        let requestBody = {...body};
        const removedParameters = new Set<string>();

        while (true) {
            const data = await makeAPIRequest(this.url, "POST", requestBody, this.createHeaders());
            if (data.isOk()) {
                return data;
            }

            const unsupportedParameter = OpenAIApiClient.extractUnsupportedParameter(data.error.message);
            if (
                unsupportedParameter === null ||
                removedParameters.has(unsupportedParameter) ||
                !(unsupportedParameter in requestBody)
            ) {
                return data;
            }

            removedParameters.add(unsupportedParameter);
            const {[unsupportedParameter]: _unsupported, ...nextBody} = requestBody;
            requestBody = nextBody;
        }
    }

    private isResponsesUrl(): boolean {
        try {
            return new URL(this.url).pathname.replace(/\/$/, "").endsWith("/responses");
        } catch {
            return this.url.split("?")[0].replace(/\/$/, "").endsWith("/responses");
        }
    }

    private isOpenAIReasoningModel(): boolean {
        const model = this.model.toLowerCase();
        return model.startsWith("gpt-5") || /^o\d/.test(model);
    }

    private static extractUnsupportedParameter(message: string): string | null {
        const match = message.match(/Unsupported parameter:\s*'([^']+)'/i);
        return match ? match[1] : null;
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
