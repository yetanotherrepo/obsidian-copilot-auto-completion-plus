import {z} from "zod";

import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V2,
    settingsSchema as settingsSchemaV2,
} from "../v2/v2";
import {triggerSchema} from "../v1/v1";
import {openRouterApiSettingsSchema} from "../shared";

export const settingsSchema = settingsSchemaV2.extend({
    version: z.literal("3"),
    apiProvider: z.enum(["azure", "openai", "openrouter", "ollama", "anthropic", "gemini"]),
    openRouterApiSettings: openRouterApiSettingsSchema,
}).strict();

export const pluginDataSchema = z.object({
    settings: settingsSchema,
}).strict();

export const DEFAULT_SETTINGS: Settings = {
    ...DEFAULT_SETTINGS_V2,
    version: "3",
    openRouterApiSettings: {
        key: "",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: "",
    },
};

export type Settings = z.input<typeof settingsSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type PluginData = z.infer<typeof pluginDataSchema>;
