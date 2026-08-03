export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface OpenRouterModelSelection {
    id: string;
    name: string;
}

const UNSUPPORTED_MODEL_ID_PATTERNS = [
    /^morph\//,
    /content-safety/,
    /gpt-oss-safeguard/,
    /llama-guard/,
    /moderation/,
];

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

export function isUnsupportedOpenRouterModelId(id: string): boolean {
    const normalizedId = id.toLowerCase();
    return UNSUPPORTED_MODEL_ID_PATTERNS.some((pattern) => pattern.test(normalizedId));
}

export function selectOpenRouterAutocompleteModels(data: unknown): OpenRouterModelSelection[] {
    const response = asRecord(data);
    const models = response && Array.isArray(response.data) ? response.data : [];

    return models
        .filter(isOpenRouterAutocompleteModel)
        .map((model) => {
            const id = model.id;
            const name = typeof model.name === "string" && model.name.length > 0
                ? model.name
                : id;
            return {id, name};
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

function isOpenRouterAutocompleteModel(
    model: unknown
): model is Record<string, unknown> & {id: string} {
    const record = asRecord(model);
    if (!record || typeof record.id !== "string" || record.id.length === 0) {
        return false;
    }
    if (isUnsupportedOpenRouterModelId(record.id)) {
        return false;
    }

    const architecture = asRecord(record.architecture);
    const outputModalities = architecture?.output_modalities ?? record.output_modalities;
    return Array.isArray(outputModalities)
        && outputModalities.length === 1
        && outputModalities[0] === "text";
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object"
        ? value as Record<string, unknown>
        : null;
}
