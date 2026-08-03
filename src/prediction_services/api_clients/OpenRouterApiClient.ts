import {err, ok, Result} from "neverthrow";

import {Settings} from "../../settings/versions";
import {recordRequestDiagnostics} from "../diagnostics";
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
    extractUnsupportedParameter,
    humanizeProviderError,
    messagesCharCount,
    optionsForCapabilities,
    providerErrorToError,
    sanitizeEndpoint,
} from "../provider";
import {ApiClient, ChatMessage, ModelOptions} from "../types";
import {makeProviderRequest} from "./utils";
import {
    OPENROUTER_CHAT_URL,
    isOfficialOpenRouterChatUrl,
    openRouterModelsUrl,
    selectOpenRouterAutocompleteModels,
} from "../../openrouter";

const OPENROUTER_APP_URL = "https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus";
const OPENROUTER_APP_TITLE = "Copilot Auto Completion Plus";

class OpenRouterApiClient implements ApiClient, ProviderAdapter {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly model: string;
    private readonly modelOptions: ModelOptions;
    private readonly promptBundleVersion: string;

    static fromSettings(settings: Settings): OpenRouterApiClient {
        return new OpenRouterApiClient(
            settings.openRouterApiSettings.key,
            settings.openRouterApiSettings.url,
            settings.openRouterApiSettings.model,
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
        const configurationErrors = this.configurationErrors();
        if (configurationErrors.length > 0) {
            return err(this.notConfiguredError(configurationErrors));
        }
        const request = this.buildRequest(messages);
        const diagnostics = this.safeDiagnostics(messages);
        const startedAt = Date.now();
        const {result, retryCount} = await this.makeRequestWithUnsupportedParameterRetry(
            request.body || {},
            diagnostics
        );
        const finishedDiagnostics: SafeDiagnostics = {
            ...diagnostics,
            latencyMs: Date.now() - startedAt,
            retryCount,
        };

        if (result.isErr()) {
            const error = {
                ...result.error,
                safeDiagnostics: {
                    ...result.error.safeDiagnostics,
                    ...finishedDiagnostics,
                    errorCode: result.error.code,
                },
            };
            recordRequestDiagnostics(error.safeDiagnostics);
            return err(error);
        }

        try {
            const completion = this.parseResponse(result.value);
            if (completion.text.length === 0) {
                const providerError = createProviderError({
                    provider: "openrouter",
                    code: "empty_response",
                    message: "OpenRouter returned no completion text.",
                    safeDiagnostics: finishedDiagnostics,
                });
                recordRequestDiagnostics(providerError.safeDiagnostics);
                return err(providerError);
            }
            recordRequestDiagnostics({
                ...finishedDiagnostics,
                responseCharCount: completion.text.length,
            });
            return ok(completion);
        } catch (error) {
            const providerError = createProviderError({
                provider: "openrouter",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: finishedDiagnostics,
            });
            recordRequestDiagnostics(providerError.safeDiagnostics);
            return err(providerError);
        }
    }

    buildRequest(messages: ChatMessage[]): ProviderRequest {
        const capabilities = this.capabilitiesFor(this.model);
        return {
            url: OPENROUTER_CHAT_URL,
            method: "POST",
            body: {
                model: this.model,
                messages,
                ...optionsForCapabilities(this.modelOptions, capabilities),
                ...(capabilities.supportsMaxTokens ? {max_tokens: this.modelOptions.max_tokens} : {}),
            },
            headers: this.headers(),
        };
    }

    parseResponse(data: any): CompletionResult {
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === "string") {
            return {text: content};
        }
        if (Array.isArray(content)) {
            return {
                text: content
                    .map((part: any) => typeof part?.text === "string" ? part.text : "")
                    .join(""),
            };
        }
        throw new Error("The OpenRouter response does not contain message content.");
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("openrouter", error, diagnostics);
    }

    capabilitiesFor(model: string): ModelCapabilities {
        return defaultModelCapabilities("openrouter", model, this.url);
    }

    async checkConnection(): Promise<Result<void, ProviderError>> {
        const errors = this.configurationErrors();
        if (errors.length > 0) {
            return err(this.notConfiguredError(errors));
        }

        const result = await this.query([
            {content: "Say hello world and nothing else.", role: "user"},
        ]);
        return result.isErr() ? err(result.error) : ok(undefined);
    }

    async checkIfConfiguredCorrectly(): Promise<string[]> {
        const result = await this.checkConnection();
        return result.isErr() ? [humanizeProviderError(result.error)] : [];
    }

    async listModels(): Promise<Result<ModelSelection[], ProviderError>> {
        if (!isOfficialOpenRouterChatUrl(this.url)) {
            return err(this.notConfiguredError([
                "OpenRouter API URL must use the official HTTPS endpoint.",
            ]));
        }
        const modelsUrl = openRouterModelsUrl();
        const response = await makeProviderRequest(
            "openrouter",
            modelsUrl,
            "GET",
            undefined,
            this.headers(),
            {
                ...this.safeDiagnostics([]),
                endpoint: sanitizeEndpoint(modelsUrl),
            }
        );
        return response.map(selectOpenRouterAutocompleteModels);
    }

    private async makeRequestWithUnsupportedParameterRetry(
        body: Record<string, unknown>,
        diagnostics: SafeDiagnostics
    ): Promise<{result: Result<any, ProviderError>; retryCount: number}> {
        let requestBody = {...body};
        const removedParameters = new Set<string>();
        let retryCount = 0;

        for (;;) {
            const result = await makeProviderRequest(
                "openrouter",
                OPENROUTER_CHAT_URL,
                "POST",
                requestBody,
                this.headers(),
                {...diagnostics, retryCount}
            );
            if (result.isOk()) {
                return {result, retryCount};
            }

            const unsupportedParameter = result.error.unsupportedParameter
                || extractUnsupportedParameter(result.error.message);
            if (
                unsupportedParameter === null
                || removedParameters.has(unsupportedParameter)
                || !(unsupportedParameter in requestBody)
            ) {
                return {result, retryCount};
            }

            removedParameters.add(unsupportedParameter);
            retryCount += 1;
            requestBody = {...requestBody};
            delete requestBody[unsupportedParameter];
        }
    }

    private headers(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_APP_URL,
            "X-OpenRouter-Title": OPENROUTER_APP_TITLE,
        };
        if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    private configurationErrors(): string[] {
        const errors: string[] = [];
        if (!this.apiKey) {
            errors.push("OpenRouter API key is not set.");
        }
        if (!isOfficialOpenRouterChatUrl(this.url)) {
            errors.push("OpenRouter API URL must use the official HTTPS endpoint.");
        }
        if (!this.model) {
            errors.push("OpenRouter model is not set.");
        }
        return errors;
    }

    private notConfiguredError(errors: string[]): ProviderError {
        return createProviderError({
            provider: "openrouter",
            code: "not_configured",
            message: errors.join("\n"),
            safeDiagnostics: this.safeDiagnostics([]),
        });
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        return {
            provider: "openrouter",
            model: this.model || "Not set",
            endpoint: sanitizeEndpoint(this.url),
            requestCharCount: messagesCharCount(messages),
            promptBundleVersion: this.promptBundleVersion,
            capabilities: this.capabilitiesFor(this.model),
        };
    }
}

export default OpenRouterApiClient;
