import {z} from "zod";

import {
    DEFAULT_SETTINGS as DEFAULT_SETTINGS_V1,
    settingsSchema as settingsSchemaV1,
    triggerSchema,
} from "../v1/v1";
import {FewShotExample, promptBundleVersionSchema} from "../shared";

export const DEFAULT_ANSWER_ONLY_SYSTEM_MESSAGE = `Your job is to predict the most logical text that should be written at the location of the <mask/>.
Return only the text that should replace <mask/>.
Do not include explanations, labels, analysis, Markdown fences, or surrounding text unless the replacement itself needs them.
Your answer can be code, a single word, or multiple sentences.
If the <mask/> is in the middle of a partial sentence, return only the missing word or words needed to complete that sentence.
Do not repeat text that already appears directly before or after the <mask/>.
Use the same language, style, formatting, indentation, and Markdown context as the surrounding text.`;

export const settingsSchema = settingsSchemaV1.extend({
    version: z.literal("2"),
    promptBundleVersion: promptBundleVersionSchema,
    redactSensitiveData: z.boolean(),
}).strict();

export const pluginDataSchema = z.object({
    settings: settingsSchema,
}).strict();

export const DEFAULT_SETTINGS: Settings = {
    ...DEFAULT_SETTINGS_V1,
    version: "2",
    systemMessage: DEFAULT_ANSWER_ONLY_SYSTEM_MESSAGE,
    fewShotExamples: DEFAULT_SETTINGS_V1.fewShotExamples.map(stripAnswerPrefix),
    chainOfThoughRemovalRegex: "",
    promptBundleVersion: "answer_only_v2",
    redactSensitiveData: false,
};

function stripAnswerPrefix(example: FewShotExample): FewShotExample {
    return {
        ...example,
        answer: example.answer.replace(/^[\s\S]*ANSWER:\s*/, ""),
    };
}

export type Settings = z.input<typeof settingsSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type PluginData = z.infer<typeof pluginDataSchema>;
