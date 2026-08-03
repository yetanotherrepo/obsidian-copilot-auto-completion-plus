import {SafeDiagnostics, safeUnsupportedParameterName} from "./provider";

export interface RequestDiagnostics extends SafeDiagnostics {
    timestamp: string;
}

let lastRequestDiagnostics: RequestDiagnostics | null = null;

export function recordRequestDiagnostics(diagnostics: SafeDiagnostics): void {
    lastRequestDiagnostics = {
        ...diagnostics,
        timestamp: new Date().toISOString(),
    };
}

export function getLastRequestDiagnostics(): RequestDiagnostics | null {
    return lastRequestDiagnostics;
}

export function clearRequestDiagnostics(): void {
    lastRequestDiagnostics = null;
}

export function diagnosticsToMarkdown(diagnostics: RequestDiagnostics | SafeDiagnostics | null | undefined): string[] {
    if (!diagnostics) {
        return ["- Last request diagnostics: Not available"];
    }

    const capabilities = diagnostics.capabilities;
    const capabilitySummary = capabilities
        ? [
            capabilities.supportsTemperature ? "temperature" : null,
            capabilities.supportsTopP ? "top_p" : null,
            capabilities.supportsFrequencyPenalty ? "frequency_penalty" : null,
            capabilities.supportsPresencePenalty ? "presence_penalty" : null,
            capabilities.supportsMaxTokens ? "max_tokens" : null,
        ].filter(Boolean).join(", ") || "none"
        : "Unknown";

    return [
        `- Diagnostics timestamp: ${"timestamp" in diagnostics ? diagnostics.timestamp : "Not recorded"}`,
        `- Endpoint: ${diagnostics.endpoint}`,
        `- Request characters: ${diagnostics.requestCharCount ?? "Unknown"}`,
        `- Response characters: ${diagnostics.responseCharCount ?? "Unknown"}`,
        `- Response status: ${safeEnumDiagnostic(diagnostics.responseStatus, RESPONSE_STATUSES, "Unknown")}`,
        `- Incomplete reason: ${safeEnumDiagnostic(diagnostics.incompleteReason, INCOMPLETE_REASONS, "None")}`,
        `- Output tokens: ${diagnostics.outputTokenCount ?? "Unknown"}`,
        `- Reasoning tokens: ${diagnostics.reasoningTokenCount ?? "Unknown"}`,
        `- Latency: ${diagnostics.latencyMs ?? "Unknown"} ms`,
        `- Retry count: ${diagnostics.retryCount ?? 0}`,
        `- Error code: ${diagnostics.errorCode ?? "None"}`,
        `- Status code: ${diagnostics.statusCode ?? "None"}`,
        `- Retryable: ${diagnostics.retryable ?? false}`,
        `- Unsupported parameter: ${safeParameterName(diagnostics.unsupportedParameter)}`,
        `- Prompt bundle: ${diagnostics.promptBundleVersion ?? "Unknown"}`,
        `- Capabilities: ${capabilitySummary}`,
    ];
}

const RESPONSE_STATUSES = new Set(["queued", "in_progress", "completed", "incomplete", "failed", "cancelled"]);
const INCOMPLETE_REASONS = new Set(["max_output_tokens", "max_tokens", "content_filter"]);

function safeEnumDiagnostic(
    value: string | undefined,
    allowedValues: Set<string>,
    fallback: string
): string {
    if (!value) {
        return fallback;
    }
    const normalized = value.toLowerCase();
    return allowedValues.has(normalized) ? normalized : "Other";
}

function safeParameterName(value: string | undefined): string {
    return value ? safeUnsupportedParameterName(value) || "None" : "None";
}
