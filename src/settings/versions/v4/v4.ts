import {z} from "zod";

import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V3,
    settingsSchema as settingsSchemaV3,
} from "../v3/v3";
import {deepSeekApiSettingsSchema} from "../shared";
import {triggerSchema} from "../v1/v1";

export const settingsSchema = settingsSchemaV3.extend({
    version: z.literal("4"),
    apiProvider: z.enum([
        "azure",
        "openai",
        "openrouter",
        "deepseek",
        "ollama",
        "anthropic",
        "gemini",
    ]),
    deepSeekApiSettings: deepSeekApiSettingsSchema,
}).strict();

export const pluginDataSchema = z.object({
    settings: settingsSchema,
}).strict();

export const DEFAULT_SETTINGS: Settings = {
    ...DEFAULT_SETTINGS_V3,
    version: "4",
    deepSeekApiSettings: {
        key: "",
        url: "https://api.deepseek.com/chat/completions",
        model: "deepseek-v4-flash",
    },
};

export type Settings = z.input<typeof settingsSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type PluginData = z.infer<typeof pluginDataSchema>;
