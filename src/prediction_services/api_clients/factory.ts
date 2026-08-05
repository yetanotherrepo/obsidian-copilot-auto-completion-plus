import {Settings} from "../../settings/versions";
import {ProviderAdapter} from "../provider";
import AnthropicApiClient from "./AnthropicApiClient";
import AzureOAIClient from "./AzureOAIClient";
import DeepSeekApiClient from "./DeepSeekApiClient";
import GeminiApiClient from "./GeminiApiClient";
import OllamaApiClient from "./OllamaApiClient";
import OpenAIApiClient from "./OpenAIApiClient";
import OpenRouterApiClient from "./OpenRouterApiClient";

export function createProviderAdapter(settings: Settings): ProviderAdapter {
    if (settings.apiProvider === "openai") {
        return OpenAIApiClient.fromSettings(settings);
    }
    if (settings.apiProvider === "openrouter") {
        return OpenRouterApiClient.fromSettings(settings);
    }
    if (settings.apiProvider === "deepseek") {
        return DeepSeekApiClient.fromSettings(settings);
    }
    if (settings.apiProvider === "azure") {
        return AzureOAIClient.fromSettings(settings);
    }
    if (settings.apiProvider === "ollama") {
        return OllamaApiClient.fromSettings(settings);
    }
    if (settings.apiProvider === "anthropic") {
        return AnthropicApiClient.fromSettings(settings);
    }
    if (settings.apiProvider === "gemini") {
        return GeminiApiClient.fromSettings(settings);
    }
    throw new Error("Invalid API provider");
}
