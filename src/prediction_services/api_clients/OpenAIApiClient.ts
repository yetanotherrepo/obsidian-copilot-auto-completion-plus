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
    extractUnsupportedParameter,
    humanizeProviderError,
    isResponsesEndpoint,
    messagesCharCount,
    optionsForCapabilities,
    providerErrorToError,
    sanitizeEndpoint,
} from "../provider";
import {recordRequestDiagnostics} from "../diagnostics";


class OpenAIApiClient implements ApiClient, ProviderAdapter {
    private readonly apiKey: string;
    private readonly url: string;
    private readonly modelOptions: ModelOptions;
    private readonly model: string;
    private readonly promptBundleVersion: string;

    static fromSettings(settings: Settings): OpenAIApiClient {
        return new OpenAIApiClient(
            settings.openAIApiSettings.key,
            settings.openAIApiSettings.url,
            settings.openAIApiSettings.model,
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
        const startedAt = Date.now();
        const {result, retryCount} = await this.makeRequestWithUnsupportedParameterRetry(
            request.body || {},
            this.safeDiagnostics(messages)
        );

        const diagnostics: SafeDiagnostics = {
            ...this.safeDiagnostics(messages),
            latencyMs: Date.now() - startedAt,
            retryCount,
        };

        if (result.isErr()) {
            const error = {
                ...result.error,
                safeDiagnostics: {
                    ...result.error.safeDiagnostics,
                    latencyMs: diagnostics.latencyMs,
                    retryCount,
                },
            };
            recordRequestDiagnostics(error.safeDiagnostics);
            return err(error);
        }

        let text: string;
        try {
            text = this.parseResponse(result.value).text;
        } catch (error) {
            const providerError = createProviderError({
                provider: "openai",
                code: "parse_error",
                message: error instanceof Error ? error.message : String(error),
                safeDiagnostics: diagnostics,
            });
            recordRequestDiagnostics(providerError.safeDiagnostics);
            return err(providerError);
        }
        recordRequestDiagnostics({
            ...diagnostics,
            responseCharCount: text.length,
        });
        return ok({text});
    }

    buildRequest(messages: ChatMessage[]): ProviderRequest {
        return {
            url: this.url,
            method: "POST",
            body: this.isResponsesUrl()
                ? this.createResponsesBody(messages)
                : this.createChatCompletionsBody(messages),
            headers: this.createHeaders(),
        };
    }

    parseResponse(data: any): CompletionResult {
        return {
            text: this.isResponsesUrl()
                ? OpenAIApiClient.extractResponsesText(data)
                : data.choices[0].message.content,
        };
    }

    normalizeError(error: Error | string | ProviderError, diagnostics = this.safeDiagnostics([])): ProviderError {
        if (typeof error === "object" && "safeDiagnostics" in error) {
            return error;
        }
        return errorToProviderError("openai", error, diagnostics);
    }

    private createHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    private createChatCompletionsBody(messages: ChatMessage[]): Record<string, unknown> {
        const capabilities = this.capabilitiesFor(this.model);
        const modelOptions = optionsForCapabilities(this.modelOptions, capabilities);
        return {
            messages,
            model: this.model,
            ...modelOptions,
            ...(capabilities.supportsMaxTokens ? {max_completion_tokens: this.modelOptions.max_tokens} : {}),
        };
    }

    private createResponsesBody(messages: ChatMessage[]): Record<string, unknown> {
        const capabilities = this.capabilitiesFor(this.model);
        const instructions = messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n");
        const input = messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
                role: message.role,
                content: message.content,
            }));

        const body: any = {
            model: this.model,
            input,
            store: false,
            ...optionsForCapabilities(this.modelOptions, capabilities),
        };
        if (capabilities.supportsMaxTokens) {
            body.max_output_tokens = this.modelOptions.max_tokens;
        }
        if (instructions) {
            body.instructions = instructions;
        }
        return body;
    }

    private async makeRequestWithUnsupportedParameterRetry(
        body: Record<string, unknown>,
        diagnostics: SafeDiagnostics
    ): Promise<{result: Result<any, ProviderError>; retryCount: number}> {
        let requestBody = {...body};
        const removedParameters = new Set<string>();
        let retryCount = 0;

        while (true) {
            const data = await makeProviderRequest(
                "openai",
                this.url,
                "POST",
                requestBody,
                this.createHeaders(),
                {
                    ...diagnostics,
                    retryCount,
                }
            );
            if (data.isOk()) {
                return {result: data, retryCount};
            }

            const unsupportedParameter = data.error.unsupportedParameter
                || extractUnsupportedParameter(data.error.message);
            if (
                unsupportedParameter === null ||
                removedParameters.has(unsupportedParameter) ||
                !(unsupportedParameter in requestBody)
            ) {
                return {result: data, retryCount};
            }

            removedParameters.add(unsupportedParameter);
            retryCount += 1;
            const {[unsupportedParameter]: _unsupported, ...nextBody} = requestBody;
            requestBody = nextBody;
        }
    }

    private isResponsesUrl(): boolean {
        try {
            return isResponsesEndpoint(this.url);
        } catch {
            return isResponsesEndpoint(this.url);
        }
    }

    capabilitiesFor(model: string): ModelCapabilities {
        return defaultModelCapabilities("openai", model, this.url);
    }

    private safeDiagnostics(messages: ChatMessage[]): SafeDiagnostics {
        return {
            provider: "openai",
            model: this.model || "Not set",
            endpoint: sanitizeEndpoint(this.url),
            requestCharCount: messagesCharCount(messages),
            promptBundleVersion: this.promptBundleVersion,
            capabilities: this.capabilitiesFor(this.model),
        };
    }

    private static extractResponsesText(data: any): string {
        if (typeof data.output_text === "string") {
            return data.output_text;
        }

        return (data.output || [])
            .flatMap((item: any) => {
                if (typeof item.content === "string") {
                    return [item.content];
                }
                if (Array.isArray(item.content)) {
                    return item.content
                        .map((content: any) => {
                            if (typeof content.text === "string") {
                                return content.text;
                            }
                            if (typeof content.output_text === "string") {
                                return content.output_text;
                            }
                            return "";
                        });
                }
                return [];
            })
            .join("");
    }

    async checkConnection(): Promise<Result<void, ProviderError>> {
        const errors: string[] = [];
        if (!this.url) {
            errors.push("OpenAI API url is not set");
        }
        if (!this.model) {
            errors.push("OpenAI model is not set");
        }
        if (errors.length > 0) {
            return err(createProviderError({
                provider: "openai",
                code: "not_configured",
                message: errors.join("\n"),
                safeDiagnostics: {
                    provider: "openai",
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
        const parsed = new URL(this.url || "https://api.openai.com/v1/responses");
        parsed.pathname = "/v1/models";
        parsed.search = "";
        const response = await makeProviderRequest(
            "openai",
            parsed.toString(),
            "GET",
            undefined,
            this.createHeaders(),
            {
                provider: "openai",
                model: this.model || "Not set",
                endpoint: sanitizeEndpoint(parsed.toString()),
                promptBundleVersion: this.promptBundleVersion,
                capabilities: this.capabilitiesFor(this.model),
            }
        );
        return response.map((data: any) => {
            const models = Array.isArray(data.data) ? data.data : [];
            return models
                .filter((model: any) => model && model.id)
                .map((model: any) => ({id: model.id, name: model.id}));
        });
    }
}

export default OpenAIApiClient;
