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


class OllamaApiClient implements ApiClient, ProviderAdapter {
    private readonly url: string;
    private readonly modelOptions: ModelOptions;
    private readonly model: string;
    private readonly promptBundleVersion: string;

    static fromSettings(settings: Settings): OllamaApiClient {
        return new OllamaApiClient(
            settings.ollamaApiSettings.url,
            settings.ollamaApiSettings.model,
            settings.modelOptions,
            settings.promptBundleVersion
        );
    }

    constructor(
        url: string,
        model: string,
        modelOptions: ModelOptions,
        promptBundleVersion = "Unknown"
    ) {
        this.url = url;
        this.modelOptions = modelOptions;
        this.model = model;
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
            "ollama",
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
                provider: "ollama",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: finishedDiagnostics,
            });
            recordRequestDiagnostics(providerError.safeDiagnostics);
            return err(providerError);
        }
    }

    buildRequest(messages: ChatMessage[]): ProviderRequest {
        const body = {
            messages,
            stream: false,
            model: this.model,
            options: {
                temperature: this.modelOptions.temperature,
                top_p: this.modelOptions.top_p,
            }
        }

        return {
            url: this.url,
            method: "POST",
            body,
            headers: {
                "Content-Type": "application/json",
            },
        };
    }

    parseResponse(data: any): CompletionResult {
        return {
            text: data.message.content,
        };
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("ollama", error, diagnostics);
    }

    capabilitiesFor(model: string): ModelCapabilities {
        return defaultModelCapabilities("ollama", model, this.url);
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        return {
            provider: "ollama",
            model: this.model || "Not set",
            endpoint: sanitizeEndpoint(this.url),
            requestCharCount: messagesCharCount(messages),
            promptBundleVersion: this.promptBundleVersion,
            capabilities: this.capabilitiesFor(this.model),
        };
    }

    async checkConnection(): Promise<Result<void, ProviderError>> {
        const errors: string[] = [];
        if (!this.url) {
            errors.push("Ollama API url is not set");
        }
        if (!this.model) {
            errors.push("Ollama model is not set");
        }
        if (errors.length > 0) {
            return err(createProviderError({
                provider: "ollama",
                code: "not_configured",
                message: errors.join("\n"),
                safeDiagnostics: {
                    provider: "ollama",
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
        return err(createProviderError({
            provider: "ollama",
            code: "not_configured",
            message: "Ollama model listing is not supported yet. Enter the local model name manually.",
            safeDiagnostics: {
                provider: "ollama",
                model: this.model || "Not set",
                endpoint: sanitizeEndpoint(this.url),
                promptBundleVersion: this.promptBundleVersion,
                capabilities: this.capabilitiesFor(this.model),
            },
        }));
    }
}

export default OllamaApiClient;
