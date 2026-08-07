import {err, ok, Result} from "neverthrow";

import {
    DEEPSEEK_CHAT_URL,
    DEEPSEEK_MODELS_URL,
    isOfficialDeepSeekChatUrl,
    selectDeepSeekModels,
} from "../../deepseek";
import {Settings} from "../../settings/versions";
import {readArray, readNumber, readRecord, readString} from "../../unknown";
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

interface DeepSeekParsedResponse {
    completion: CompletionResult;
    diagnostics: Partial<SafeDiagnostics>;
}

const DEEPSEEK_FINISH_REASONS = new Set([
    "stop",
    "length",
    "content_filter",
    "tool_calls",
    "insufficient_system_resource",
]);

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
        let {result, retryCount, requestBody} = await this.makeRequestWithUnsupportedParameterRetry(
            request.body || {},
            diagnostics
        );

        if (result.isErr()) {
            return err(this.recordError(result.error, {
                ...diagnostics,
                latencyMs: Date.now() - startedAt,
                retryCount,
            }));
        }

        let parsed: DeepSeekParsedResponse;
        try {
            parsed = this.parseResponseWithDiagnostics(result.value);
        } catch (error) {
            const providerError = createProviderError({
                provider: "deepseek",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: {
                    ...diagnostics,
                    latencyMs: Date.now() - startedAt,
                    retryCount,
                },
            });
            return err(this.recordError(providerError));
        }

        if (parsed.completion.text.length === 0 && parsed.diagnostics.finishReason !== "length") {
            ({result, retryCount, requestBody} = await this.makeRequestWithUnsupportedParameterRetry(
                requestBody,
                diagnostics,
                retryCount + 1
            ));

            if (result.isErr()) {
                return err(this.recordError(result.error, {
                    ...diagnostics,
                    latencyMs: Date.now() - startedAt,
                    retryCount,
                }));
            }

            try {
                parsed = this.parseResponseWithDiagnostics(result.value);
            } catch (error) {
                const providerError = createProviderError({
                    provider: "deepseek",
                    code: "parse_error",
                    message: error instanceof Error ? error.message : String(error),
                    safeDiagnostics: {
                        ...diagnostics,
                        latencyMs: Date.now() - startedAt,
                        retryCount,
                    },
                });
                return err(this.recordError(providerError));
            }
        }

        const finishedDiagnostics: SafeDiagnostics = {
            ...diagnostics,
            ...parsed.diagnostics,
            responseCharCount: parsed.completion.text.length,
            latencyMs: Date.now() - startedAt,
            retryCount,
        };

        if (parsed.completion.text.length === 0) {
            const reachedTokenLimit = parsed.diagnostics.finishReason === "length";
            const providerError = createProviderError({
                provider: "deepseek",
                code: reachedTokenLimit ? "incomplete_response" : "empty_response",
                message: reachedTokenLimit
                    ? "DeepSeek reached the max_tokens limit before it returned completion text. Increase Max Tokens and try again."
                    : parsed.diagnostics.reasoningCharCount
                        ? "DeepSeek returned reasoning but no final completion text."
                        : "DeepSeek returned no completion text.",
                safeDiagnostics: {
                    ...finishedDiagnostics,
                    ...(reachedTokenLimit ? {incompleteReason: "max_tokens"} : {}),
                },
            });
            return err(this.recordError(providerError));
        }

        recordRequestDiagnostics(finishedDiagnostics);
        return ok(parsed.completion);
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
                thinking: {type: "disabled"},
                stream: false,
            },
            headers: this.headers(),
        };
    }

    parseResponse(data: unknown): CompletionResult {
        return this.parseResponseWithDiagnostics(data).completion;
    }

    private parseResponseWithDiagnostics(data: unknown): DeepSeekParsedResponse {
        const firstChoice = (readArray(data, "choices") ?? [])[0];
        const message = firstChoice === undefined ? undefined : readRecord(firstChoice, "message");
        const content = readString(message, "content");
        if (content === undefined) {
            throw new Error("The DeepSeek response does not contain message content.");
        }

        const rawFinishReason = firstChoice === undefined
            ? undefined
            : readString(firstChoice, "finish_reason");
        const finishReason = rawFinishReason === undefined
            ? undefined
            : DEEPSEEK_FINISH_REASONS.has(rawFinishReason.toLowerCase())
                ? rawFinishReason.toLowerCase()
                : "other";
        const reasoningContent = readString(message, "reasoning_content");
        const usage = readRecord(data, "usage");
        const completionDetails = readRecord(usage, "completion_tokens_details");

        return {
            completion: {text: content},
            diagnostics: {
                ...(finishReason === undefined ? {} : {finishReason}),
                ...(reasoningContent === undefined ? {} : {reasoningCharCount: reasoningContent.length}),
                ...this.safeTokenCount(readNumber(usage, "completion_tokens"), "outputTokenCount"),
                ...this.safeTokenCount(readNumber(completionDetails, "reasoning_tokens"), "reasoningTokenCount"),
            },
        };
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
        diagnostics: SafeDiagnostics,
        initialRetryCount = 0
    ): Promise<{
        result: Result<unknown, ProviderError>;
        retryCount: number;
        requestBody: Record<string, unknown>;
    }> {
        let requestBody = {...body};
        const removedParameters = new Set<string>();
        let retryCount = initialRetryCount;

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
                return {result, retryCount, requestBody};
            }

            const unsupportedParameter = result.error.unsupportedParameter
                || extractUnsupportedParameter(result.error.message);
            if (
                unsupportedParameter === null
                || removedParameters.has(unsupportedParameter)
                || !(unsupportedParameter in requestBody)
            ) {
                return {result, retryCount, requestBody};
            }

            removedParameters.add(unsupportedParameter);
            retryCount += 1;
            requestBody = {...requestBody};
            delete requestBody[unsupportedParameter];
        }
    }

    private safeTokenCount(
        value: number | undefined,
        key: "outputTokenCount" | "reasoningTokenCount"
    ): Partial<SafeDiagnostics> {
        return value !== undefined && Number.isFinite(value) && value >= 0
            ? {[key]: value}
            : {};
    }

    private recordError(error: ProviderError, diagnostics?: SafeDiagnostics): ProviderError {
        const safeDiagnostics = recordRequestDiagnostics({
            ...error.safeDiagnostics,
            ...diagnostics,
            errorCode: error.code,
        });
        return {...error, safeDiagnostics};
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
