import {ApiClient, ChatMessage, ModelOptions} from "../types";
import {Settings} from "../../settings/versions";
import {makeProviderRequest} from "./utils";
import {err, ok, Result} from "neverthrow";
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
    optionsForCapabilities,
    providerErrorToError,
    sanitizeEndpoint,
} from "../provider";
import {recordRequestDiagnostics} from "../diagnostics";


class AzureOAIClient implements ApiClient, ProviderAdapter {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly modelOptions: ModelOptions;
    private readonly promptBundleVersion: string;

    constructor(apiKey: string, url: string, modelOptions: ModelOptions, promptBundleVersion = "Unknown") {
        this.apiKey = apiKey;
        this.url = url;
        this.modelOptions = modelOptions;
        this.promptBundleVersion = promptBundleVersion;
    }

    static fromSettings(settings: Settings): AzureOAIClient {
        return new AzureOAIClient(
            settings.azureOAIApiSettings.key,
            settings.azureOAIApiSettings.url,
            settings.modelOptions,
            settings.promptBundleVersion
        );
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
            "azure",
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
                provider: "azure",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: finishedDiagnostics,
            });
            recordRequestDiagnostics(providerError.safeDiagnostics);
            return err(providerError);
        }
    }

    buildRequest(messages: ChatMessage[]): ProviderRequest {
        const capabilities = this.capabilitiesFor(this.modelFromDeploymentUrl());
        const body = {
            messages,
            ...optionsForCapabilities(this.modelOptions, capabilities),
            ...(capabilities.supportsMaxTokens ? {max_tokens: this.modelOptions.max_tokens} : {}),
        };
        return {
            url: this.url,
            method: "POST",
            body,
            headers: {
                "Content-Type": "application/json",
                "api-key": this.apiKey,
            },
        };
    }

    parseResponse(data: any): CompletionResult {
        return {
            text: data.choices[0].message.content,
        };
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("azure", error, diagnostics);
    }

    capabilitiesFor(model: string): ModelCapabilities {
        return defaultModelCapabilities("azure", model, this.url);
    }

    private modelFromDeploymentUrl(): string {
        const match = this.url.match(/\/deployments\/([^/]+)/i);
        return match ? decodeURIComponent(match[1]) : "Configured in Azure deployment URL";
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        const model = this.modelFromDeploymentUrl();
        return {
            provider: "azure",
            model,
            endpoint: sanitizeEndpoint(this.url),
            requestCharCount: messagesCharCount(messages),
            promptBundleVersion: this.promptBundleVersion,
            capabilities: this.capabilitiesFor(model),
        };
    }

    async checkConnection(): Promise<Result<void, ProviderError>> {
        const errors: string[] = [];

        if (!this.apiKey) {
            errors.push("API key is not set.");
        }
        if (!this.url) {
            errors.push("Azure OpenAI API url is not set.");
        }
        if (errors.length > 0) {
            return err(createProviderError({
                provider: "azure",
                code: "not_configured",
                message: errors.join("\n"),
                safeDiagnostics: {
                    provider: "azure",
                    model: this.modelFromDeploymentUrl(),
                    endpoint: sanitizeEndpoint(this.url),
                    promptBundleVersion: this.promptBundleVersion,
                    capabilities: this.capabilitiesFor(this.modelFromDeploymentUrl()),
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
            provider: "azure",
            code: "not_configured",
            message: "Azure model listing is not supported because the model is selected by deployment URL.",
            safeDiagnostics: {
                provider: "azure",
                model: this.modelFromDeploymentUrl(),
                endpoint: sanitizeEndpoint(this.url),
                promptBundleVersion: this.promptBundleVersion,
                capabilities: this.capabilitiesFor(this.modelFromDeploymentUrl()),
            },
        }));
    }
}

export default AzureOAIClient;
