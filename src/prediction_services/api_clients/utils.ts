import {requestUrl} from "obsidian";
import {err, ok, Result} from "neverthrow";
import {
    ProviderError,
    ProviderName,
    SafeDiagnostics,
    createProviderError,
    providerErrorFromHttpResponse,
    providerErrorToError,
} from "../provider";

export async function makeProviderRequest(
    provider: ProviderName,
    url: string,
    method: "GET" | "POST",
    body: object | undefined = undefined,
    headers: Record<string, string> | undefined = undefined,
    diagnostics: SafeDiagnostics
): Promise<Result<unknown, ProviderError>> {
    try {
        if (headers === undefined) {
            headers = {
                "Content-Type": "application/json",
            };
        }

        const response = await requestUrl({
            url,
            method,
            body: body === undefined ? undefined : JSON.stringify(body),
            headers,
            throw: false,
            contentType: "application/json",
        });

        if (response.status >= 400) {
            const responseJson: unknown = response.json;
            return err(providerErrorFromHttpResponse(provider, response.status, responseJson, diagnostics));
        }

        const responseJson: unknown = response.json;
        return ok(responseJson);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const lowerMessage = message.toLowerCase();
        return err(createProviderError({
            provider,
            code: lowerMessage.includes("timeout") || lowerMessage.includes("abort") ? "timeout" : "unknown",
            message,
            retryable: true,
            safeDiagnostics: diagnostics,
        }));
    }
}

export async function makeAPIRequest(
    url: string,
    method: string,
    body: object | undefined = undefined,
    headers: Record<string, string> | undefined = undefined
): Promise<Result<unknown, Error>> {
    const result = await makeProviderRequest(
        "openai",
        url,
        method === "GET" ? "GET" : "POST",
        body,
        headers,
        {
            provider: "openai",
            model: "Unknown",
            endpoint: url,
        }
    );
    return result.mapErr(providerErrorToError);
}
