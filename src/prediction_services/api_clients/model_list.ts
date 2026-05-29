import {err, Result} from "neverthrow";

import {Settings} from "../../settings/versions";
import {makeAPIRequest} from "./utils";

export interface ModelSelection {
    id: string;
    name: string;
}

type CloudModelProvider = "openai" | "anthropic" | "gemini";

const FALLBACK_MODELS: Record<CloudModelProvider, ModelSelection[]> = {
    openai: [
        {id: "gpt-5.5", name: "GPT-5.5"},
        {id: "gpt-5.5-pro", name: "GPT-5.5 pro"},
        {id: "gpt-5.4", name: "GPT-5.4"},
        {id: "gpt-5.4-mini", name: "GPT-5.4 mini"},
        {id: "gpt-5.4-nano", name: "GPT-5.4 nano"},
        {id: "gpt-4.1", name: "GPT-4.1"},
        {id: "gpt-4.1-mini", name: "GPT-4.1 mini"},
        {id: "gpt-4o", name: "GPT-4o"},
        {id: "gpt-4o-mini", name: "GPT-4o mini"},
    ],
    anthropic: [
        {id: "claude-opus-4-7", name: "Claude Opus 4.7"},
        {id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6"},
        {id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5"},
    ],
    gemini: [
        {id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview"},
        {id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview"},
        {id: "gemini-2.5-flash", name: "Gemini 2.5 Flash"},
        {id: "gemini-2.5-pro", name: "Gemini 2.5 Pro"},
    ],
};

export function getFallbackModels(provider: Settings["apiProvider"]): ModelSelection[] {
    if (provider === "openai" || provider === "anthropic" || provider === "gemini") {
        return FALLBACK_MODELS[provider];
    }
    return [];
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

    const response = await makeAPIRequest(openAIModelsUrl(settings), "GET", undefined, headers);
    return response.map((data: any) => {
        const models = Array.isArray(data.data) ? data.data : [];
        return models
            .filter((model: any) => model && model.id && isLikelyOpenAITextModel(model.id))
            .sort((a: any, b: any) => (b.created || 0) - (a.created || 0) || a.id.localeCompare(b.id))
            .map((model: any) => ({id: model.id, name: model.id}));
    });
}

async function fetchAnthropicModels(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    const response = await makeAPIRequest(anthropicModelsUrl(settings), "GET", undefined, {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicApiSettings.key,
        "anthropic-version": "2023-06-01",
    });
    return response.map((data: any) => {
        const models = Array.isArray(data.data) ? data.data : [];
        return models.map((model: any) => ({
            id: model.id,
            name: model.display_name || model.id,
        }));
    });
}

async function fetchGeminiModels(settings: Settings): Promise<Result<ModelSelection[], Error>> {
    const response = await makeAPIRequest(geminiModelsUrl(settings), "GET", undefined, {
        "Content-Type": "application/json",
    });
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
