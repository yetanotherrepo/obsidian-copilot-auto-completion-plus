import {Settings} from "../settings/versions";
import {diagnosticsToMarkdown, getLastRequestDiagnostics} from "../prediction_services/diagnostics";
import {ProviderError, SafeDiagnostics, extractProviderError, humanizeProviderError, sanitizeEndpoint} from "../prediction_services/provider";
import {redact} from "../prediction_services/pre_processors/sensitive_data_redactor";
import {Platform} from "obsidian";

export const GITHUB_REPOSITORY_URL = "https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus";

export type IssueSource = "settings" | "connectivity-check" | "prediction";

export interface IssueReportContext {
    source: IssueSource;
    pluginVersion?: string;
    settings?: Settings;
    error?: Error | string | ProviderError;
    diagnostics?: SafeDiagnostics;
}

export function buildGitHubIssueUrl(context: IssueReportContext): string {
    const url = new URL(`${GITHUB_REPOSITORY_URL}/issues/new`);
    url.searchParams.set("title", issueTitle(context));
    url.searchParams.set("body", issueBody(context));
    return url.toString();
}

export function openGitHubIssue(context: IssueReportContext): void {
    window.open(buildGitHubIssueUrl(context), "_blank", "noopener,noreferrer");
}

export function shouldOfferIssueReport(
    error: Error | string | ProviderError | undefined
): boolean {
    const providerError = error instanceof Error
        ? extractProviderError(error)
        : isProviderError(error)
            ? error
            : null;
    const rawMessage = providerError?.message
        || (error instanceof Error
            ? error.message
            : typeof error === "string"
                ? error
                : "");
    if (isConnectionFailure(rawMessage) || isRawConfigurationFailure(rawMessage)) {
        return false;
    }
    if (!providerError) {
        return true;
    }
    return ![
        "invalid_key",
        "model_unavailable",
        "rate_limited",
        "quota_exceeded",
        "request_too_large",
        "timeout",
        "not_configured",
    ].includes(providerError.code);
}

export function issueBody(context: IssueReportContext): string {
    const settings = context.settings;
    const diagnostics = context.diagnostics
        || providerDiagnostics(context.error)
        || getLastRequestDiagnostics();
    return [
        "## What happened?",
        "",
        "Please describe what you were doing and what went wrong.",
        "",
        "## Expected behavior",
        "",
        "What did you expect to happen?",
        "",
        "## Diagnostics",
        "",
        `- Plugin version: ${context.pluginVersion || "Unknown"}`,
        `- Source: ${context.source}`,
        `- Provider: ${settings ? providerLabel(settings) : "Unknown"}`,
        `- Model: ${settings ? selectedModel(settings) : "Unknown"}`,
        `- API URL: ${settings ? selectedEndpoint(settings) : "Unknown"}`,
        `- Error: ${errorMessage(context.error)}`,
        `- Platform: ${platformLabel()}`,
        ...diagnosticsToMarkdown(diagnostics),
        "",
        "## Privacy note",
        "",
        "This report does not include your API key or note contents. Please do not paste secrets or private note text into this issue.",
    ].join("\n");
}

function platformLabel(): string {
    if (Platform.isIosApp) {
        return "iOS";
    }
    if (Platform.isAndroidApp) {
        return "Android";
    }
    if (Platform.isMacOS) {
        return "macOS";
    }
    if (Platform.isWin) {
        return "Windows";
    }
    if (Platform.isLinux) {
        return "Linux";
    }
    return Platform.isMobileApp ? "Mobile" : "Unknown";
}

function issueTitle(context: IssueReportContext): string {
    if (context.source === "prediction") {
        return "Prediction failed";
    }
    if (context.source === "connectivity-check") {
        return "Connection test failed";
    }
    return "Plugin issue";
}

function providerLabel(settings: Settings): string {
    const labels: Record<Settings["apiProvider"], string> = {
        openai: "OpenAI API",
        openrouter: "OpenRouter API",
        deepseek: "DeepSeek API",
        anthropic: "Anthropic API",
        gemini: "Gemini API",
        azure: "Azure OpenAI API",
        ollama: "Self-hosted Ollama API",
    };
    return `${labels[settings.apiProvider]} (${settings.apiProvider})`;
}

function selectedModel(settings: Settings): string {
    if (settings.apiProvider === "openai") {
        return settings.openAIApiSettings.model || "Not set";
    }
    if (settings.apiProvider === "anthropic") {
        return settings.anthropicApiSettings.model || "Not set";
    }
    if (settings.apiProvider === "openrouter") {
        return settings.openRouterApiSettings.model || "Not set";
    }
    if (settings.apiProvider === "deepseek") {
        return settings.deepSeekApiSettings.model || "Not set";
    }
    if (settings.apiProvider === "gemini") {
        return settings.geminiApiSettings.model || "Not set";
    }
    if (settings.apiProvider === "azure") {
        return "Configured in Azure deployment URL";
    }
    return settings.ollamaApiSettings.model || "Not set";
}

function selectedEndpoint(settings: Settings): string {
    if (settings.apiProvider === "openai") {
        return sanitizeEndpoint(settings.openAIApiSettings.url);
    }
    if (settings.apiProvider === "anthropic") {
        return sanitizeEndpoint(settings.anthropicApiSettings.url);
    }
    if (settings.apiProvider === "openrouter") {
        return sanitizeEndpoint(settings.openRouterApiSettings.url);
    }
    if (settings.apiProvider === "deepseek") {
        return sanitizeEndpoint(settings.deepSeekApiSettings.url);
    }
    if (settings.apiProvider === "gemini") {
        return sanitizeEndpoint(settings.geminiApiSettings.url);
    }
    if (settings.apiProvider === "azure") {
        return sanitizeEndpoint(settings.azureOAIApiSettings.url);
    }
    return sanitizeEndpoint(settings.ollamaApiSettings.url);
}

function errorMessage(error: Error | string | ProviderError | undefined): string {
    if (error === undefined) {
        return "Not provided";
    }
    if (isProviderError(error)) {
        return safeProviderErrorMessage(error);
    }
    if (error instanceof Error) {
        const providerError = extractProviderError(error);
        return providerError
            ? safeProviderErrorMessage(providerError)
            : "Unexpected plugin error. Review the developer console for details.";
    }
    return "Unexpected plugin error. Review the developer console for details.";
}

function providerDiagnostics(error: Error | string | ProviderError | undefined): SafeDiagnostics | null {
    if (!error) {
        return null;
    }
    if (isProviderError(error)) {
        return error.safeDiagnostics;
    }
    if (error instanceof Error) {
        return extractProviderError(error)?.safeDiagnostics || null;
    }
    return null;
}

function isProviderError(error: unknown): error is ProviderError {
    return Boolean(error && typeof error === "object" && "safeDiagnostics" in error && "provider" in error);
}

function safeProviderErrorMessage(error: ProviderError): string {
    if (error.code === "unknown") {
        return "The provider returned an unexpected error. Review the developer console for details.";
    }
    return sanitizePublicErrorText(humanizeProviderError(error));
}

function sanitizePublicErrorText(value: string): string {
    const withoutSensitiveValues = redact(value).replace(
        /https?:\/\/[^\s)\]}]+/gi,
        (url) => sanitizeEndpoint(url)
    );
    const normalized = Array.from(withoutSensitiveValues, (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint < 32 || codePoint === 127 ? " " : character;
    }).join("")
        .replace(/\s{2,}/g, " ")
        .trim();
    return normalized.slice(0, 500) || "Provider error details are not available.";
}

function isConnectionFailure(message: string): boolean {
    return /err_connection_refused|econnrefused|connection refused|failed to fetch|network error/i.test(message);
}

function isRawConfigurationFailure(message: string): boolean {
    return /\b(?:401|403)\b|unauthori[sz]ed|invalid(?: api)? key|api key (?:is )?not set|missing api key|rate limit|quota|billing/i.test(message);
}
