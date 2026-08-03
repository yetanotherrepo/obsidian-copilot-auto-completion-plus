import {err, Result} from "neverthrow";

import {Settings} from "../../settings/versions";
import {makeProviderRequest} from "./utils";
import {ModelSelection, providerErrorToError, sanitizeEndpoint} from "../provider";
import {isOfficialOpenRouterChatUrl, openRouterModelsUrl} from "../../openrouter";

export type {ModelSelection} from "../provider";

type CloudModelProvider = "openai" | "anthropic" | "gemini";
type QuickModelProvider = "openai" | "anthropic" | "gemini";

export interface RecommendedModel extends ModelSelection {
    provider: QuickModelProvider;
    speedLabel: string;
    qualityLabel: string;
    recommended: boolean;
    quickVisible: boolean;
    sourceUrl: string;
    lastVerified: string;
}

const LAST_VERIFIED = "2026-05-30";
const OPENAI_MODELS_SOURCE = "https://developers.openai.com/api/docs/models";
const ANTHROPIC_MODELS_SOURCE = "https://platform.claude.com/docs/en/about-claude/models/overview";
const GEMINI_MODELS_SOURCE = "https://ai.google.dev/gemini-api/docs/models";

const QUICK_MODELS: Record<QuickModelProvider, RecommendedModel[]> = {
    openai: [
        recommendedModel("openai", "gpt-5.4-nano", "GPT-5.4 nano", "Fastest", "Lowest latency", false, OPENAI_MODELS_SOURCE),
        recommendedModel("openai", "gpt-5.4-mini", "GPT-5.4 mini", "Faster", "Recommended for autocomplete", true, OPENAI_MODELS_SOURCE),
        recommendedModel("openai", "gpt-5.4", "GPT-5.4", "Fast", "Balanced", false, OPENAI_MODELS_SOURCE),
        recommendedModel("openai", "gpt-5.5", "GPT-5.5", "Fast", "Best quality", false, OPENAI_MODELS_SOURCE),
    ],
    anthropic: [
        recommendedModel("anthropic", "claude-haiku-4-5-20251001", "Claude Haiku 4.5", "Fastest", "Near-frontier", false, ANTHROPIC_MODELS_SOURCE),
        recommendedModel("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6", "Fast", "Recommended", true, ANTHROPIC_MODELS_SOURCE),
        recommendedModel("anthropic", "claude-opus-4-8", "Claude Opus 4.8", "Moderate", "Best quality", false, ANTHROPIC_MODELS_SOURCE),
    ],
    gemini: [
        recommendedModel("gemini", "gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "Fastest", "Lowest latency", false, GEMINI_MODELS_SOURCE),
        recommendedModel("gemini", "gemini-3.5-flash", "Gemini 3.5 Flash", "Faster", "Recommended", true, GEMINI_MODELS_SOURCE),
        recommendedModel("gemini", "gemini-3-flash-preview", "Gemini 3 Flash Preview", "Fast", "Frontier", false, GEMINI_MODELS_SOURCE),
        recommendedModel("gemini", "gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", "Quality-first", "Best quality", false, GEMINI_MODELS_SOURCE),
    ],
};

const FALLBACK_MODELS: Record<CloudModelProvider, ModelSelection[]> = {
    openai: [
        {id: "gpt-5.4-nano", name: "GPT-5.4 nano"},
        {id: "gpt-5.4-mini", name: "GPT-5.4 mini"},
        {id: "gpt-5.4", name: "GPT-5.4"},
        {id: "gpt-5.5", name: "GPT-5.5"},
        {id: "gpt-5.5-pro", name: "GPT-5.5 pro"},
        {id: "gpt-4.1", name: "GPT-4.1"},
        {id: "gpt-4.1-mini", name: "GPT-4.1 mini"},
        {id: "gpt-4o", name: "GPT-4o"},
        {id: "gpt-4o-mini", name: "GPT-4o mini"},
    ],
    anthropic: [
        {id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5"},
        {id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6"},
        {id: "claude-opus-4-8", name: "Claude Opus 4.8"},
        {id: "claude-opus-4-7", name: "Claude Opus 4.7"},
    ],
    gemini: [
        {id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite"},
        {id: "gemini-3.5-flash", name: "Gemini 3.5 Flash"},
        {id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview"},
        {id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview"},
        {id: "gemini-2.5-pro", name: "Gemini 2.5 Pro"},
        {id: "gemini-2.5-flash", name: "Gemini 2.5 Flash"},
    ],
};

function recommendedModel(
    provider: QuickModelProvider,
    id: string,
    name: string,
    speedLabel: string,
    qualityLabel: string,
    recommended: boolean,
    sourceUrl: string
): RecommendedModel {
    return {
        provider,
        id,
        name,
        speedLabel,
        qualityLabel,
        recommended,
        quickVisible: true,
        sourceUrl,
        lastVerified: LAST_VERIFIED,
    };
}

export function getFallbackModels(provider: Settings["apiProvider"]): ModelSelection[] {
    if (provider === "openai" || provider === "anthropic" || provider === "gemini") {
        return FALLBACK_MODELS[provider];
    }
    return [];
}

export function getQuickModels(provider: Settings["apiProvider"]): RecommendedModel[] {
    if (provider === "openai" || provider === "anthropic" || provider === "gemini") {
        return QUICK_MODELS[provider].filter((model) => model.quickVisible);
    }
    return [];
}

export function getAdvancedModelOptions(
    provider: Settings["apiProvider"],
    currentModel: string,
    loadedModels: ModelSelection[]
): ModelSelection[] {
    const models = loadedModels.length > 0 ? loadedModels : getFallbackModels(provider);
    if (currentModel && models.every((model) => model.id !== currentModel)) {
        return [{id: currentModel, name: currentModel}, ...models];
    }
    return models;
}

export async function fetchModelsForProvider(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    try {
        if (settings.apiProvider === "openai") {
            return fetchOpenAIModels(settings);
        }
        if (settings.apiProvider === "anthropic") {
            return fetchAnthropicModels(settings);
        }
        if (settings.apiProvider === "gemini") {
            return fetchGeminiModels(settings);
        }
        if (settings.apiProvider === "openrouter") {
            return fetchOpenRouterModels(settings);
        }
        throw new Error(`Model loading is not supported for ${settings.apiProvider}`);
    } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
    }
}

function withPath(url: string, fallbackUrl: string, path: string): string {
    const parsed = new URL(url || fallbackUrl);
    const v1BetaIndex = parsed.pathname.indexOf("/v1beta");
    const v1Index = parsed.pathname.indexOf("/v1");

    if (v1BetaIndex >= 0) {
        parsed.pathname = parsed.pathname.slice(0, v1BetaIndex) + path;
    } else if (v1Index >= 0) {
        parsed.pathname = parsed.pathname.slice(0, v1Index) + path;
    } else {
        parsed.pathname = path;
    }
    parsed.search = "";
    return parsed.toString();
}

function openAIModelsUrl(settings: Settings): string {
    return withPath(
        settings.openAIApiSettings.url,
        "https://api.openai.com/v1/chat/completions",
        "/v1/models"
    );
}

function anthropicModelsUrl(settings: Settings): string {
    return withPath(
        settings.anthropicApiSettings.url,
        "https://api.anthropic.com/v1/messages",
        "/v1/models"
    );
}

function geminiModelsUrl(settings: Settings): string {
    const parsed = new URL(settings.geminiApiSettings.url || "https://generativelanguage.googleapis.com/v1beta");
    if (!parsed.pathname.endsWith("/models")) {
        parsed.pathname = parsed.pathname.replace(/\/$/, "") + "/models";
    }
    parsed.searchParams.set("key", settings.geminiApiSettings.key);
    parsed.searchParams.set("pageSize", "1000");
    return parsed.toString();
}

async function fetchOpenAIModels(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (settings.openAIApiSettings.key) {
        headers.Authorization = `Bearer ${settings.openAIApiSettings.key}`;
    }

    const modelsUrl = openAIModelsUrl(settings);
    const response = (await makeProviderRequest("openai", modelsUrl, "GET", undefined, headers, {
        provider: "openai",
        model: settings.openAIApiSettings.model || "Not set",
        endpoint: sanitizeEndpoint(modelsUrl),
    })).mapErr(providerErrorToError);
    return response.map((data: any) => {
        const models = Array.isArray(data.data) ? data.data : [];
        return models
            .filter((model: any) => model && model.id && isLikelyOpenAITextModel(model.id))
            .sort((a: any, b: any) => (b.created || 0) - (a.created || 0) || a.id.localeCompare(b.id))
            .map((model: any) => ({id: model.id, name: model.id}));
    });
}

async function fetchAnthropicModels(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    const modelsUrl = anthropicModelsUrl(settings);
    const response = (await makeProviderRequest("anthropic", modelsUrl, "GET", undefined, {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicApiSettings.key,
        "anthropic-version": "2023-06-01",
    }, {
        provider: "anthropic",
        model: settings.anthropicApiSettings.model || "Not set",
        endpoint: sanitizeEndpoint(modelsUrl),
    })).mapErr(providerErrorToError);
    return response.map((data: any) => {
        const models = Array.isArray(data.data) ? data.data : [];
        return models.map((model: any) => ({
            id: model.id,
            name: model.display_name || model.id,
        }));
    });
}

async function fetchGeminiModels(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    const modelsUrl = geminiModelsUrl(settings);
    const response = (await makeProviderRequest("gemini", modelsUrl, "GET", undefined, {
        "Content-Type": "application/json",
    }, {
        provider: "gemini",
        model: settings.geminiApiSettings.model || "Not set",
        endpoint: sanitizeEndpoint(settings.geminiApiSettings.url),
    })).mapErr(providerErrorToError);
    return response.map((data: any) => {
        const models = Array.isArray(data.models) ? data.models : [];
        return models
            .filter((model: any) => {
                const methods = model.supportedGenerationMethods || [];
                return methods.includes("generateContent");
            })
            .map((model: any) => {
                const id = (model.name || "").replace(/^models\//, "");
                return {
                    id,
                    name: model.displayName || id,
                };
            })
            .filter((model: ModelSelection) => model.id.length > 0);
    });
}

async function fetchOpenRouterModels(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    if (!isOfficialOpenRouterChatUrl(settings.openRouterApiSettings.url)) {
        return err(new Error("OpenRouter API URL must use the official HTTPS endpoint."));
    }
    const modelsUrl = openRouterModelsUrl();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus",
        "X-OpenRouter-Title": "Copilot Auto Completion Plus",
    };
    if (settings.openRouterApiSettings.key) {
        headers.Authorization = `Bearer ${settings.openRouterApiSettings.key}`;
    }
    const response = (await makeProviderRequest("openrouter", modelsUrl, "GET", undefined, headers, {
        provider: "openrouter",
        model: settings.openRouterApiSettings.model || "Not set",
        endpoint: sanitizeEndpoint(modelsUrl),
    })).mapErr(providerErrorToError);
    return response.map((data: any) => {
        const models = Array.isArray(data.data) ? data.data : [];
        return models
            .filter((model: any) => {
                if (!model || typeof model.id !== "string") {
                    return false;
                }
                const outputModalities = model.architecture?.output_modalities || model.output_modalities;
                return !Array.isArray(outputModalities) || outputModalities.includes("text");
            })
            .map((model: any) => ({
                id: model.id,
                name: typeof model.name === "string" && model.name.length > 0 ? model.name : model.id,
            }))
            .sort((left: ModelSelection, right: ModelSelection) => left.name.localeCompare(right.name));
    });
}

function isLikelyOpenAITextModel(id: string): boolean {
    const lowerId = id.toLowerCase();
    const unsupportedFragments = [
        "embedding",
        "moderation",
        "dall-e",
        "whisper",
        "tts",
        "transcribe",
        "realtime",
        "audio",
        "image",
        "sora",
    ];

    return !unsupportedFragments.some((fragment) => lowerId.includes(fragment));
}
