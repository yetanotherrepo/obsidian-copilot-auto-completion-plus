import {ApiClient, ChatMessage, ModelOptions} from "../types";
import {Settings} from "../../settings/versions";
import {err, ok, Result} from "neverthrow";
import {makeProviderRequest} from "./utils";
import {
    CompletionResult,
    ModelCapabilities,
    ModelSelection,
    ProviderAdapter,
    ProviderError,
    ProviderRequest,
    SafeDiagnostics,
    createProviderError,
    defaultModelCapabilities,
    errorToProviderError,
    humanizeProviderError,
    messagesCharCount,
    providerErrorToError,
    sanitizeEndpoint,
} from "../provider";
import {recordRequestDiagnostics} from "../diagnostics";
import {readArray, readRecord, readString} from "../../unknown";

class GeminiApiClient implements ApiClient, ProviderAdapter {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly model: string;
    private readonly modelOptions: ModelOptions;
    private readonly promptBundleVersion: string;
    private penaltiesSupported = true;

    static fromSettings(settings: Settings): GeminiApiClient {
        return new GeminiApiClient(
            settings.geminiApiSettings.key,
            settings.geminiApiSettings.url,
            settings.geminiApiSettings.model,
            settings.modelOptions,
            settings.promptBundleVersion
        );
    }

    constructor(
        apiKey: string,
        url: string,
        model: string,
        modelOptions: ModelOptions,
        promptBundleVersion = "Unknown"
    ) {
        this.apiKey = apiKey;
        this.url = url;
        this.model = model.replace(/^models\//, "");
        this.modelOptions = modelOptions;
        this.promptBundleVersion = promptBundleVersion;
    }

    async queryChatModel(messages: ChatMessage[]): Promise<Result<string, Error>> {
        return (await this.query(messages))
            .map((result) => result.text)
            .mapErr(providerErrorToError);
    }

    async query(messages: ChatMessage[]): Promise<Result<CompletionResult, ProviderError>> {
        const request = this.buildRequest(messages);
        const diagnostics = this.safeDiagnostics(messages);
        const startedAt = Date.now();
        let retryCount = 0;
        let data = await makeProviderRequest(
            "gemini",
            request.url,
            request.method,
            request.body,
            request.headers,
            diagnostics
        );
        if (data.isErr() && GeminiApiClient.shouldRetryWithoutPenalties(data.error)) {
            this.penaltiesSupported = false;
            retryCount = 1;
            const retryRequest = this.buildRequest(messages);
            data = await makeProviderRequest(
                "gemini",
                retryRequest.url,
                retryRequest.method,
                retryRequest.body,
                retryRequest.headers,
                {
                    ...this.safeDiagnostics(messages),
                    retryCount,
                }
            );
        }
        const finishedDiagnostics = {
            ...this.safeDiagnostics(messages),
            latencyMs: Date.now() - startedAt,
            retryCount,
        };

        if (data.isErr()) {
            const error = {
                ...data.error,
                safeDiagnostics: {
                    ...data.error.safeDiagnostics,
                    ...finishedDiagnostics,
                    errorCode: data.error.code,
                },
            };
            recordRequestDiagnostics(error.safeDiagnostics);
            return err(error);
        }

        try {
            const result = this.parseResponse(data.value);
            recordRequestDiagnostics({
                ...finishedDiagnostics,
                responseCharCount: result.text.length,
            });
            return ok(result);
        } catch (error) {
            const providerError = createProviderError({
                provider: "gemini",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: finishedDiagnostics,
            });
            recordRequestDiagnostics(providerError.safeDiagnostics);
            return err(providerError);
        }
    }

    buildRequest(messages: ChatMessage[]): ProviderRequest {
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

        const capabilities = this.capabilitiesFor(this.model);
        const body: Record<string, unknown> = {
            contents,
            generationConfig: {
                temperature: this.modelOptions.temperature,
                topP: this.modelOptions.top_p,
                maxOutputTokens: this.modelOptions.max_tokens,
                ...(capabilities.supportsFrequencyPenalty
                    ? {frequencyPenalty: this.modelOptions.frequency_penalty}
                    : {}),
                ...(capabilities.supportsPresencePenalty
                    ? {presencePenalty: this.modelOptions.presence_penalty}
                    : {}),
            },
        };
        if (systemInstruction) {
            body.system_instruction = {
                parts: [{text: systemInstruction}],
            };
        }

        return {
            url: this.generateContentUrl(),
            method: "POST",
            body,
            headers: {
                "Content-Type": "application/json",
            },
        };
    }

    parseResponse(data: unknown): CompletionResult {
        const candidate = (readArray(data, "candidates") ?? [])[0];
        const content = candidate === undefined ? undefined : readRecord(candidate, "content");
        const parts = readArray(content, "parts") ?? [];
        return {
            text: parts
                .map((part) => readString(part, "text") ?? "")
                .join(""),
        };
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("gemini", error, diagnostics);
    }

    capabilitiesFor(model: string): ModelCapabilities {
        const capabilities = defaultModelCapabilities("gemini", model, this.url);
        if (this.penaltiesSupported) {
            return capabilities;
        }
        return {
            ...capabilities,
            supportsFrequencyPenalty: false,
            supportsPresencePenalty: false,
            notes: [
                ...(capabilities.notes || []),
                "The selected Gemini model rejected penalty parameters.",
            ],
        };
    }

    private static shouldRetryWithoutPenalties(error: ProviderError): boolean {
        if (error.statusCode !== 400) {
            return false;
        }
        const unsupportedParameter = (error.unsupportedParameter || "").toLowerCase();
        if (unsupportedParameter.includes("frequencypenalty")
            || unsupportedParameter.includes("presencepenalty")
            || unsupportedParameter.includes("frequency_penalty")
            || unsupportedParameter.includes("presence_penalty")) {
            return true;
        }

        const message = error.message.toLowerCase();
        return message.includes("penalty is not enabled")
            || (/(frequency|presence)[_ ]?penalty/.test(message)
                && /(not supported|not enabled|unknown field|invalid parameter)/.test(message));
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        return {
            provider: "gemini",
            model: this.model || "Not set",
            endpoint: sanitizeEndpoint(this.url),
            requestCharCount: messagesCharCount(messages),
            promptBundleVersion: this.promptBundleVersion,
            capabilities: this.capabilitiesFor(this.model),
        };
    }

    async checkConnection(): Promise<Result<void, ProviderError>> {
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
            return err(createProviderError({
                provider: "gemini",
                code: "not_configured",
                message: errors.join("\n"),
                safeDiagnostics: {
                    provider: "gemini",
                    model: this.model || "Not set",
                    endpoint: sanitizeEndpoint(this.url),
                    promptBundleVersion: this.promptBundleVersion,
                    capabilities: this.capabilitiesFor(this.model),
                },
            }));
        }

        const result = await this.query([
            {content: "Say hello world and nothing else.", role: "user"},
        ]);

        if (result.isErr()) {
            return err(result.error);
        }
        return ok(undefined);
    }

    async checkIfConfiguredCorrectly(): Promise<string[]> {
        const result = await this.checkConnection();
        return result.isErr() ? [humanizeProviderError(result.error)] : [];
    }

    async listModels(): Promise<Result<ModelSelection[], ProviderError>> {
        const response = await makeProviderRequest(
            "gemini",
            this.modelsUrl(),
            "GET",
            undefined,
            {"Content-Type": "application/json"},
            {
                provider: "gemini",
                model: this.model || "Not set",
                endpoint: sanitizeEndpoint(this.url),
                promptBundleVersion: this.promptBundleVersion,
                capabilities: this.capabilitiesFor(this.model),
            }
        );
        return response.map((data) => {
            const models = readArray(data, "models") ?? [];
            return models
                .filter((model) => (readArray(model, "supportedGenerationMethods") ?? [])
                    .some((method) => method === "generateContent"))
                .map((model) => {
                    const id = (readString(model, "name") ?? "").replace(/^models\//, "");
                    return {
                        id,
                        name: readString(model, "displayName") ?? id,
                    };
                })
                .filter((model: ModelSelection) => model.id.length > 0);
        });
    }

    private generateContentUrl(): string {
        const parsed = new URL(this.url || "https://generativelanguage.googleapis.com/v1beta");
        parsed.pathname = parsed.pathname
            .replace(/\/$/, "")
            .replace(/\/models$/, "") + `/models/${this.model}:generateContent`;
        parsed.searchParams.set("key", this.apiKey);
        return parsed.toString();
    }

    private modelsUrl(): string {
        const parsed = new URL(this.url || "https://generativelanguage.googleapis.com/v1beta");
        if (!parsed.pathname.endsWith("/models")) {
            parsed.pathname = parsed.pathname.replace(/\/$/, "") + "/models";
        }
        parsed.searchParams.set("key", this.apiKey);
        parsed.searchParams.set("pageSize", "1000");
        return parsed.toString();
    }
}

export default GeminiApiClient;
