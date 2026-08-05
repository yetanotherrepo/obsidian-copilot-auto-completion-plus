import {err, ok, Result} from "neverthrow";

import {
    DEEPSEEK_CHAT_URL,
    DEEPSEEK_MODELS_URL,
    isOfficialDeepSeekChatUrl,
    selectDeepSeekModels,
} from "../../deepseek";
import {Settings} from "../../settings/versions";
import {readArray, readRecord, readString} from "../../unknown";
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

class DeepSeekApiClient implements ApiClient, ProviderAdapter {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly model: string;
    private readonly modelOptions: ModelOptions;
    private readonly promptBundleVersion: string;

    static fromSettings(settings: Settings): DeepSeekApiClient {
        return new DeepSeekApiClient(
            settings.deepSeekApiSettings.key,
            settings.deepSeekApiSettings.url,
            settings.deepSeekApiSettings.model,
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
                    provider: "deepseek",
                    code: "empty_response",
                    message: "DeepSeek returned no completion text.",
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
                provider: "deepseek",
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
            url: DEEPSEEK_CHAT_URL,
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

    parseResponse(data: unknown): CompletionResult {
        const firstChoice = (readArray(data, "choices") ?? [])[0];
        const message = firstChoice === undefined ? undefined : readRecord(firstChoice, "message");
        const content = readString(message, "content");
        if (content === undefined) {
            throw new Error("The DeepSeek response does not contain message content.");
        }
        return {text: content};
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("deepseek", error, diagnostics);
    }

    capabilitiesFor(model: string): ModelCapabilities {
        return defaultModelCapabilities("deepseek", model, this.url);
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
        if (!isOfficialDeepSeekChatUrl(this.url)) {
            return err(this.notConfiguredError([
                "DeepSeek API URL must use the official HTTPS endpoint.",
            ]));
        }

        const response = await makeProviderRequest(
            "deepseek",
            DEEPSEEK_MODELS_URL,
            "GET",
            undefined,
            this.headers(),
            {
                ...this.safeDiagnostics([]),
                endpoint: sanitizeEndpoint(DEEPSEEK_MODELS_URL),
            }
        );
        return response.map(selectDeepSeekModels);
    }

    private async makeRequestWithUnsupportedParameterRetry(
        body: Record<string, unknown>,
        diagnostics: SafeDiagnostics
    ): Promise<{result: Result<unknown, ProviderError>; retryCount: number}> {
        let requestBody = {...body};
        const removedParameters = new Set<string>();
        let retryCount = 0;

        for (;;) {
            const result = await makeProviderRequest(
                "deepseek",
                DEEPSEEK_CHAT_URL,
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
        };
        if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    private configurationErrors(): string[] {
        const errors: string[] = [];
        if (!this.apiKey) {
            errors.push("DeepSeek API key is not set.");
        }
        if (!isOfficialDeepSeekChatUrl(this.url)) {
            errors.push("DeepSeek API URL must use the official HTTPS endpoint.");
        }
        if (!this.model) {
            errors.push("DeepSeek model is not set.");
        }
        return errors;
    }

    private notConfiguredError(errors: string[]): ProviderError {
        return createProviderError({
            provider: "deepseek",
            code: "not_configured",
            message: errors.join("\n"),
            safeDiagnostics: this.safeDiagnostics([]),
        });
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        return {
            provider: "deepseek",
            model: this.model || "Not set",
            endpoint: sanitizeEndpoint(this.url),
            requestCharCount: messagesCharCount(messages),
            promptBundleVersion: this.promptBundleVersion,
            capabilities: this.capabilitiesFor(this.model),
        };
    }
}

export default DeepSeekApiClient;
