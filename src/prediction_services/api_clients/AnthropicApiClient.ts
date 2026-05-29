import {ApiClient, ChatMessage, ModelOptions} from "../types";
import {Settings} from "../../settings/versions";
import {Result} from "neverthrow";
import {makeAPIRequest} from "./utils";

class AnthropicApiClient implements ApiClient {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly model: string;
    private readonly modelOptions: ModelOptions;

    static fromSettings(settings: Settings): AnthropicApiClient {
        return new AnthropicApiClient(
            settings.anthropicApiSettings.key,
            settings.anthropicApiSettings.url,
            settings.anthropicApiSettings.model,
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
        this.model = model;
        this.modelOptions = modelOptions;
    }

    async queryChatModel(messages: ChatMessage[]): Promise<Result<string, Error>> {
        const systemMessages = messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n");
        const chatMessages = messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
                role: message.role,
                content: message.content,
            }));

        const body: any = {
            model: this.model,
            max_tokens: this.modelOptions.max_tokens,
            messages: chatMessages,
        };
        if (systemMessages) {
            body.system = systemMessages;
        }

        const data = await makeAPIRequest(this.url, "POST", body, {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
        });
        return data.map((data) => (data.content || [])
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join(""));
    }

    async checkIfConfiguredCorrectly(): Promise<string[]> {
        const errors: string[] = [];
        if (!this.apiKey) {
            errors.push("Anthropic API key is not set.");
        }
        if (!this.url) {
            errors.push("Anthropic API url is not set.");
        }
        if (!this.model) {
            errors.push("Anthropic model is not set.");
        }
        if (errors.length > 0) {
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

export default AnthropicApiClient;
