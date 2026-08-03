export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export function isOfficialOpenRouterChatUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:"
            && url.origin === "https://openrouter.ai"
            && url.username.length === 0
            && url.password.length === 0
            && url.pathname.replace(/\/$/, "") === "/api/v1/chat/completions"
            && url.search.length === 0
            && url.hash.length === 0;
    } catch {
        return false;
    }
}

export function openRouterModelsUrl(): string {
    const url = new URL(OPENROUTER_MODELS_URL);
    url.searchParams.set("output_modalities", "text");
    url.searchParams.set("limit", "1000");
    return url.toString();
}
