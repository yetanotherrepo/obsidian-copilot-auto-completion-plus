import {readArray, readString} from "./unknown";

export const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_MODELS_URL = "https://api.deepseek.com/models";

export interface DeepSeekModelSelection {
    id: string;
    name: string;
}

export function isOfficialDeepSeekChatUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:"
            && url.origin === "https://api.deepseek.com"
            && url.username.length === 0
            && url.password.length === 0
            && url.pathname.replace(/\/$/, "") === "/chat/completions"
            && url.search.length === 0
            && url.hash.length === 0;
    } catch {
        return false;
    }
}

export function selectDeepSeekModels(data: unknown): DeepSeekModelSelection[] {
    return (readArray(data, "data") ?? [])
        .flatMap((model) => {
            const id = readString(model, "id");
            return id && id.length > 0 ? [{id, name: id}] : [];
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}
