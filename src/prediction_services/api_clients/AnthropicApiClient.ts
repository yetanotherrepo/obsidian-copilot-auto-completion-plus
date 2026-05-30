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

class AnthropicApiClient implements ApiClient, ProviderAdapter {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly model: string;
    private readonly modelOptions: ModelOptions;
    private readonly promptBundleVersion: string;

    static fromSettings(settings: Settings): AnthropicApiClient {
        return new AnthropicApiClient(
            settings.anthropicApiSettings.key,
            settings.anthropicApiSettings.url,
            settings.anthropicApiSettings.model,
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
        this.model = model;
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

        const data = await makeProviderRequest(
            "anthropic",
            request.url,
            request.method,
            request.body,
            request.headers,
            diagnostics
        );

        const finishedDiagnostics = {
            ...diagnostics,
            latencyMs: Date.now() - startedAt,
            retryCount: 0,
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
                provider: "anthropic",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: finishedDiagnostics,
            });
            recordRequestDiagnostics(providerError.safeDiagnostics);
            return err(providerError);
        }
    }

    buildRequest(messages: ChatMessage[]): ProviderRequest {
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

        return {
            url: this.url,
            method: "POST",
            body,
            headers: this.headers(),
        };
    }

    parseResponse(data: any): CompletionResult {
        return {
            text: (data.content || [])
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join(""),
        };
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("anthropic", error, diagnostics);
    }

    capabilitiesFor(model: string): ModelCapabilities {
        return defaultModelCapabilities("anthropic", model, this.url);
    }

    private headers(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
        };
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        return {
            provider: "anthropic",
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
            errors.push("Anthropic API key is not set.");
        }
        if (!this.url) {
            errors.push("Anthropic API url is not set.");
        }
        if (!this.model) {
            errors.push("Anthropic model is not set.");
        }
        if (errors.length > 0) {
            return err(createProviderError({
                provider: "anthropic",
                code: "not_configured",
                message: errors.join("\n"),
                safeDiagnostics: {
                    provider: "anthropic",
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
        const parsed = new URL(this.url || "https://api.anthropic.com/v1/messages");
        parsed.pathname = "/v1/models";
        parsed.search = "";
        const response = await makeProviderRequest(
            "anthropic",
            parsed.toString(),
            "GET",
            undefined,
            this.headers(),
            {
                provider: "anthropic",
                model: this.model || "Not set",
                endpoint: sanitizeEndpoint(parsed.toString()),
                promptBundleVersion: this.promptBundleVersion,
                capabilities: this.capabilitiesFor(this.model),
            }
        );
        return response.map((data: any) => {
            const models = Array.isArray(data.data) ? data.data : [];
            return models.map((model: any) => ({
                id: model.id,
                name: model.display_name || model.id,
            }));
        });
    }
}

export default AnthropicApiClient;
