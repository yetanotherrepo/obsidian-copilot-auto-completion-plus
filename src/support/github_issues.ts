import {Settings} from "../settings/versions";

export const GITHUB_REPOSITORY_URL = "https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus";

export type IssueSource = "settings" | "connectivity-check" | "prediction";

export interface IssueReportContext {
    source: IssueSource;
    pluginVersion?: string;
    settings?: Settings;
    error?: Error | string;
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

export function issueBody(context: IssueReportContext): string {
    const settings = context.settings;
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
        `- User agent: ${typeof navigator === "undefined" ? "Unknown" : navigator.userAgent}`,
        "",
        "## Privacy note",
        "",
        "This report does not include your API key or note contents. Please do not paste secrets or private note text into this issue.",
    ].join("\n");
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
        return sanitizeUrl(settings.openAIApiSettings.url);
    }
    if (settings.apiProvider === "anthropic") {
        return sanitizeUrl(settings.anthropicApiSettings.url);
    }
    if (settings.apiProvider === "gemini") {
        return sanitizeUrl(settings.geminiApiSettings.url);
    }
    if (settings.apiProvider === "azure") {
        return sanitizeUrl(settings.azureOAIApiSettings.url);
    }
    return sanitizeUrl(settings.ollamaApiSettings.url);
}

function sanitizeUrl(value: string): string {
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

function errorMessage(error: Error | string | undefined): string {
    if (error === undefined) {
        return "Not provided";
    }
    if (error instanceof Error) {
        return error.message;
    }
    return error;
}
