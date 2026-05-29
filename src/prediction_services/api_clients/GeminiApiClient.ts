import {ApiClient, ChatMessage, ModelOptions} from "../types";
import {Settings} from "../../settings/versions";
import {Result} from "neverthrow";
import {makeAPIRequest} from "./utils";

class GeminiApiClient implements ApiClient {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly model: string;
    private readonly modelOptions: ModelOptions;

    static fromSettings(settings: Settings): GeminiApiClient {
        return new GeminiApiClient(
            settings.geminiApiSettings.key,
            settings.geminiApiSettings.url,
            settings.geminiApiSettings.model,
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
        this.model = model.replace(/^models\//, "");
        this.modelOptions = modelOptions;
    }

    async queryChatModel(messages: ChatMessage[]): Promise<Result<string, Error>> {
        const systemInstruction = messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n");
        const contents = messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
                role: message.role === "assistant" ? "model" : "user",
                parts: [{text: message.content}],
            }));

        const body: any = {
            contents,
            generationConfig: {
                temperature: this.modelOptions.temperature,
                topP: this.modelOptions.top_p,
                maxOutputTokens: this.modelOptions.max_tokens,
                frequencyPenalty: this.modelOptions.frequency_penalty,
                presencePenalty: this.modelOptions.presence_penalty,
            },
        };
        if (systemInstruction) {
            body.system_instruction = {
                parts: [{text: systemInstruction}],
            };
        }

        const data = await makeAPIRequest(this.generateContentUrl(), "POST", body, {
            "Content-Type": "application/json",
        });
        return data.map((data) => (((data.candidates || [])[0] || {}).content?.parts || [])
            .filter((part: any) => part.text)
            .map((part: any) => part.text)
            .join(""));
    }

    async checkIfConfiguredCorrectly(): Promise<string[]> {
        const errors: string[] = [];
        if (!this.apiKey) {
            errors.push("Gemini API key is not set.");
        }
        if (!this.url) {
            errors.push("Gemini API url is not set.");
        }
        if (!this.model) {
            errors.push("Gemini model is not set.");
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

    private generateContentUrl(): string {
        const parsed = new URL(this.url || "https://generativelanguage.googleapis.com/v1beta");
        parsed.pathname = parsed.pathname
            .replace(/\/$/, "")
            .replace(/\/models$/, "") + `/models/${this.model}:generateContent`;
        parsed.searchParams.set("key", this.apiKey);
        return parsed.toString();
    }
}

export default GeminiApiClient;
