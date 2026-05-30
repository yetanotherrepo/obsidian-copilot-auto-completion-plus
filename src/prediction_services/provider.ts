import {Result} from "neverthrow";

import {ChatMessage, ModelOptions} from "./types";

export type ProviderName = "openai" | "anthropic" | "gemini" | "azure" | "ollama";

export type ProviderErrorCode =
    | "invalid_key"
    | "model_unavailable"
    | "unsupported_parameter"
    | "rate_limited"
    | "quota_exceeded"
    | "request_too_large"
    | "timeout"
    | "parse_error"
    | "not_configured"
    | "unknown";

export interface ModelCapabilities {
    supportsTemperature: boolean;
    supportsTopP: boolean;
    supportsFrequencyPenalty: boolean;
    supportsPresencePenalty: boolean;
    supportsMaxTokens: boolean;
    isReasoningModel: boolean;
    supportsModelListing: boolean;
    supportsStreaming: boolean;
    notes?: string[];
}

export interface CompletionResult {
    text: string;
}

export interface ModelSelection {
    id: string;
    name: string;
}

export interface SafeDiagnostics {
    provider: ProviderName;
    model: string;
    endpoint: string;
    latencyMs?: number;
    retryCount?: number;
    errorCode?: ProviderErrorCode;
    statusCode?: number;
    retryable?: boolean;
    unsupportedParameter?: string;
    requestCharCount?: number;
    responseCharCount?: number;
    promptBundleVersion?: string;
    capabilities?: ModelCapabilities;
}

export interface ProviderError {
    code: ProviderErrorCode;
    message: string;
    provider: ProviderName;
    statusCode?: number;
    retryable: boolean;
    unsupportedParameter?: string;
    safeDiagnostics: SafeDiagnostics;
}

export interface ProviderAdapter {
    buildRequest(messages: ChatMessage[]): ProviderRequest;
    parseResponse(data: any): CompletionResult;
    normalizeError(error: Error | string | ProviderError, diagnostics?: SafeDiagnostics): ProviderError;
    query(messages: ChatMessage[]): Promise<Result<CompletionResult, ProviderError>>;
    checkConnection(): Promise<Result<void, ProviderError>>;
    listModels(): Promise<Result<ModelSelection[], ProviderError>>;
    capabilitiesFor(model: string): ModelCapabilities;
}

export interface ProviderRequest {
    url: string;
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    headers: Record<string, string>;
}

export function defaultModelCapabilities(
    provider: ProviderName,
    model: string,
    endpoint = ""
): ModelCapabilities {
    const isReasoningModel = isReasoningModelId(provider, model);
    const isOpenAIResponses = provider === "openai" && isResponsesEndpoint(endpoint);
    const isOpenAIChat = provider === "openai" && !isOpenAIResponses;

    if (provider === "anthropic") {
        return {
            supportsTemperature: false,
            supportsTopP: false,
            supportsFrequencyPenalty: false,
            supportsPresencePenalty: false,
            supportsMaxTokens: true,
            isReasoningModel,
            supportsModelListing: true,
            supportsStreaming: false,
            notes: ["Anthropic requests currently use max tokens only."],
        };
    }

    if (provider === "ollama") {
        return {
            supportsTemperature: true,
            supportsTopP: true,
            supportsFrequencyPenalty: false,
            supportsPresencePenalty: false,
            supportsMaxTokens: false,
            isReasoningModel,
            supportsModelListing: false,
            supportsStreaming: false,
            notes: ["Ollama chat requests currently send temperature and top_p only."],
        };
    }

    if (provider === "gemini") {
        return {
            supportsTemperature: true,
            supportsTopP: true,
            supportsFrequencyPenalty: true,
            supportsPresencePenalty: true,
            supportsMaxTokens: true,
            isReasoningModel,
            supportsModelListing: true,
            supportsStreaming: false,
        };
    }

    if (provider === "azure") {
        return {
            supportsTemperature: true,
            supportsTopP: true,
            supportsFrequencyPenalty: true,
            supportsPresencePenalty: true,
            supportsMaxTokens: true,
            isReasoningModel,
            supportsModelListing: false,
            supportsStreaming: false,
        };
    }

    if (isReasoningModel) {
        return {
            supportsTemperature: false,
            supportsTopP: false,
            supportsFrequencyPenalty: false,
            supportsPresencePenalty: false,
            supportsMaxTokens: true,
            isReasoningModel: true,
            supportsModelListing: true,
            supportsStreaming: false,
            notes: ["Reasoning models reject some sampling parameters."],
        };
    }

    return {
        supportsTemperature: true,
        supportsTopP: true,
        supportsFrequencyPenalty: isOpenAIChat,
        supportsPresencePenalty: isOpenAIChat,
        supportsMaxTokens: true,
        isReasoningModel: false,
        supportsModelListing: true,
        supportsStreaming: false,
        notes: isOpenAIResponses
            ? ["OpenAI Responses requests use temperature, top_p, and max output tokens."]
            : undefined,
    };
}

export function optionsForCapabilities(
    modelOptions: ModelOptions,
    capabilities: ModelCapabilities
): Record<string, number> {
    const options: Record<string, number> = {};
    if (capabilities.supportsTemperature) {
        options.temperature = modelOptions.temperature;
    }
    if (capabilities.supportsTopP) {
        options.top_p = modelOptions.top_p;
    }
    if (capabilities.supportsFrequencyPenalty) {
        options.frequency_penalty = modelOptions.frequency_penalty;
    }
    if (capabilities.supportsPresencePenalty) {
        options.presence_penalty = modelOptions.presence_penalty;
    }
    return options;
}

export function isReasoningModelId(provider: ProviderName, model: string): boolean {
    if (provider !== "openai" && provider !== "azure") {
        return false;
    }
    const normalized = model.toLowerCase();
    return normalized.startsWith("gpt-5") || /^o\d/.test(normalized);
}

export function isResponsesEndpoint(endpoint: string): boolean {
    try {
        return new URL(endpoint).pathname.replace(/\/$/, "").endsWith("/responses");
    } catch {
        return endpoint.split("?")[0].replace(/\/$/, "").endsWith("/responses");
    }
}

export function messagesCharCount(messages: ChatMessage[]): number {
    return messages.reduce((count, message) => count + message.content.length, 0);
}

export function sanitizeEndpoint(value: string): string {
    if (!value) {
        return "Not set";
    }
    try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return "Custom URL";
    }
}

export function providerErrorToError(error: ProviderError): Error {
    const result = new Error(humanizeProviderError(error));
    (result as Error & {providerError?: ProviderError}).providerError = error;
    return result;
}

export function errorToProviderError(
    provider: ProviderName,
    error: Error | string,
    diagnostics: SafeDiagnostics
): ProviderError {
    const message = error instanceof Error ? error.message : error;
    const providerError = extractProviderError(error);
    if (providerError) {
        return providerError;
    }
    return createProviderError({
        provider,
        code: message.toLowerCase().includes("timeout") ? "timeout" : "unknown",
        message,
        retryable: message.toLowerCase().includes("timeout"),
        safeDiagnostics: diagnostics,
    });
}

export function extractProviderError(error: unknown): ProviderError | null {
    if (error && typeof error === "object" && "providerError" in error) {
        const providerError = (error as {providerError?: ProviderError}).providerError;
        return providerError || null;
    }
    return null;
}

export function createProviderError(input: {
    provider: ProviderName;
    code: ProviderErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    unsupportedParameter?: string;
    safeDiagnostics: SafeDiagnostics;
}): ProviderError {
    const safeDiagnostics: SafeDiagnostics = {
        ...input.safeDiagnostics,
        errorCode: input.code,
        statusCode: input.statusCode,
        retryable: input.retryable ?? false,
        unsupportedParameter: input.unsupportedParameter,
    };
    return {
        code: input.code,
        message: input.message,
        provider: input.provider,
        statusCode: input.statusCode,
        retryable: input.retryable ?? false,
        unsupportedParameter: input.unsupportedParameter,
        safeDiagnostics,
    };
}

export function providerErrorFromHttpResponse(
    provider: ProviderName,
    statusCode: number,
    responseJson: any,
    diagnostics: SafeDiagnostics
): ProviderError {
    const message = extractErrorMessage(responseJson) || `API returned status code ${statusCode}`;
    const unsupportedParameter = extractUnsupportedParameter(message);
    const lowerMessage = message.toLowerCase();
    let code: ProviderErrorCode = "unknown";

    if (unsupportedParameter) {
        code = "unsupported_parameter";
    } else if (statusCode === 401 || statusCode === 403) {
        code = "invalid_key";
    } else if (statusCode === 404) {
        code = "model_unavailable";
    } else if (statusCode === 408 || lowerMessage.includes("timeout")) {
        code = "timeout";
    } else if (statusCode === 413 || lowerMessage.includes("too large") || lowerMessage.includes("context length")) {
        code = "request_too_large";
    } else if (statusCode === 429 && (lowerMessage.includes("quota") || lowerMessage.includes("billing"))) {
        code = "quota_exceeded";
    } else if (statusCode === 429) {
        code = "rate_limited";
    }

    return createProviderError({
        provider,
        code,
        message,
        statusCode,
        retryable: statusCode >= 500 || code === "rate_limited" || code === "timeout",
        unsupportedParameter: unsupportedParameter || undefined,
        safeDiagnostics: diagnostics,
    });
}

export function humanizeProviderError(error: ProviderError): string {
    const provider = providerDisplayName(error.provider);
    if (error.code === "invalid_key") {
        return `${provider} rejected the API key. Check that the key is correct and has access to the selected model.`;
    }
    if (error.code === "model_unavailable") {
        return `${provider} could not find or access the selected model. Refresh the model list or choose another model.`;
    }
    if (error.code === "unsupported_parameter") {
        return `${provider} rejected the request parameter "${error.unsupportedParameter}". The plugin will omit unsupported model options when it can detect them.`;
    }
    if (error.code === "rate_limited") {
        return `${provider} rate limited the request. Try again later or choose a smaller/faster model.`;
    }
    if (error.code === "quota_exceeded") {
        return `${provider} reports that quota or billing limits were exceeded.`;
    }
    if (error.code === "request_too_large") {
        return `${provider} says the request is too large. Lower the prefix/suffix character limits.`;
    }
    if (error.code === "timeout") {
        return `${provider} request timed out. Try again or check the endpoint.`;
    }
    if (error.code === "parse_error") {
        return `${provider} returned a response the plugin could not parse.`;
    }
    if (error.code === "not_configured") {
        return error.message;
    }
    return error.message;
}

export function providerDisplayName(provider: ProviderName): string {
    const labels: Record<ProviderName, string> = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        gemini: "Gemini",
        azure: "Azure OpenAI",
        ollama: "Ollama",
    };
    return labels[provider];
}

export function extractUnsupportedParameter(message: string): string | null {
    const singleQuoteMatch = message.match(/Unsupported parameter:\s*'([^']+)'/i);
    if (singleQuoteMatch) {
        return singleQuoteMatch[1];
    }
    const doubleQuoteMatch = message.match(/Unsupported parameter:\s*"([^"]+)"/i);
    return doubleQuoteMatch ? doubleQuoteMatch[1] : null;
}

function extractErrorMessage(responseJson: any): string | null {
    if (typeof responseJson === "string") {
        return responseJson;
    }
    if (!responseJson || typeof responseJson !== "object") {
        return null;
    }
    if (typeof responseJson.error === "string") {
        return responseJson.error;
    }
    if (responseJson.error && typeof responseJson.error.message === "string") {
        return responseJson.error.message;
    }
    if (typeof responseJson.message === "string") {
        return responseJson.message;
    }
    return null;
}
