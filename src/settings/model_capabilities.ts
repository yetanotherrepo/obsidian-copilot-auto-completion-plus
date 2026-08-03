import {Settings} from "./versions";
import {ModelCapabilities, defaultModelCapabilities} from "../prediction_services/provider";

export function capabilitiesForSettings(settings: Settings): ModelCapabilities {
    if (settings.apiProvider === "openai") {
        return defaultModelCapabilities(
            "openai",
            settings.openAIApiSettings.model,
            settings.openAIApiSettings.url
        );
    }
    if (settings.apiProvider === "anthropic") {
        return defaultModelCapabilities(
            "anthropic",
            settings.anthropicApiSettings.model,
            settings.anthropicApiSettings.url
        );
    }
    if (settings.apiProvider === "openrouter") {
        return defaultModelCapabilities(
            "openrouter",
            settings.openRouterApiSettings.model,
            settings.openRouterApiSettings.url
        );
    }
    if (settings.apiProvider === "gemini") {
        return defaultModelCapabilities(
            "gemini",
            settings.geminiApiSettings.model,
            settings.geminiApiSettings.url
        );
    }
    if (settings.apiProvider === "azure") {
        const match = settings.azureOAIApiSettings.url.match(/\/deployments\/([^/]+)/i);
        return defaultModelCapabilities(
            "azure",
            match ? decodeURIComponent(match[1]) : "Configured in Azure deployment URL",
            settings.azureOAIApiSettings.url
        );
    }
    return defaultModelCapabilities(
        "ollama",
        settings.ollamaApiSettings.model,
        settings.ollamaApiSettings.url
    );
}
