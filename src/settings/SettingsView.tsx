import * as React from "react";
import {useState} from "react";

import TextSettingItem from "./components/TextSettingItem";
import {checkForErrors} from "./utils";
import SliderSettingsItem from "./components/SliderSettingsItem";

import TriggerSettings from "./components/TriggerSettings";
import SettingsItem from "./components/SettingsItem";
import CheckBoxSettingItem from "./components/CheckBoxSettingItem";
import FewShotExampleSettings from "./components/FewShotExampleSettings";
import ConnectivityCheck from "./components/ConnectivityCheck";
import DropDownSettingItem from "./components/DropDownSettingItem";
import {Notice} from "obsidian";
import ProviderModelDropDownSettingItem from "./components/ProviderModelDropDownSettingItem";
import ReportIssueSettingItem from "./components/ReportIssueSettingItem";
import DiagnosticsSettingItem from "./components/DiagnosticsSettingItem";
import {capabilitiesForSettings} from "./model_capabilities";
import {
    DEFAULT_SETTINGS,
    MAX_DELAY,
    MAX_FREQUENCY_PENALTY,
    MAX_MAX_CHAR_LIMIT,
    MAX_MAX_TOKENS,
    MAX_PRESENCE_PENALTY,
    MAX_TEMPERATURE,
    MAX_TOP_P,
    MIN_DELAY,
    MIN_FREQUENCY_PENALTY,
    MIN_MAX_CHAR_LIMIT,
    MIN_MAX_TOKENS,
    MIN_PRESENCE_PENALTY,
    MIN_TEMPERATURE,
    MIN_TOP_P,
    Settings
} from "./versions";

interface IProps {
    onSettingsChanged(settings: Settings): void;

    pluginVersion: string;
    settings: Settings;
}

const PROVIDER_LABELS: Record<Settings["apiProvider"], string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    azure: "Azure OpenAI",
    ollama: "Ollama",
};

const PROVIDER_OPTIONS: Record<Settings["apiProvider"], string> = {
    openai: "OpenAI API",
    anthropic: "Anthropic API",
    gemini: "Gemini API",
    azure: "Azure OAI API",
    ollama: "Self-hosted Ollama API",
};

export default function SettingsView(props: IProps): React.JSX.Element {
    const [settings, _setSettings] = useState<Settings>(props.settings);
    const errors = checkForErrors(settings);
    const modelCapabilities = capabilitiesForSettings(settings);

    React.useEffect(() => {
        _setSettings(props.settings);
    }, [props.settings]);

    const updateSettings = (update: Partial<Settings>) => {
        _setSettings((settings: Settings) => {
            const newSettings = {...settings, ...update};
            props.onSettingsChanged(newSettings);
            return newSettings;
        });
    };

    const resetSettings = () => {
        const azureOAIApiSettings = {
            ...settings.azureOAIApiSettings,
        };
        const openAIApiSettings = {
            ...settings.openAIApiSettings,
        };
        const anthropicApiSettings = {
            ...settings.anthropicApiSettings,
        };
        const geminiApiSettings = {
            ...settings.geminiApiSettings,
        };
        const ollamaApiSettings = {
            ...settings.ollamaApiSettings,
        };

        const newSettings: Settings = {
            ...DEFAULT_SETTINGS,
            apiProvider: settings.apiProvider,
            azureOAIApiSettings,
            openAIApiSettings,
            anthropicApiSettings,
            geminiApiSettings,
            ollamaApiSettings,
            advancedMode: settings.advancedMode,
        };
        updateSettings(newSettings);
        new Notice("Factory reset complete.");
    };

    const setProvider = (value: string) => {
        if (
            value === "openai"
            || value === "azure"
            || value === "ollama"
            || value === "anthropic"
            || value === "gemini"
        ) {
            updateSettings({apiProvider: value});
        }
    };

    const renderQuickEndpointIfNeeded = (provider: Settings["apiProvider"]) => {
        if (provider === "azure" || provider === "ollama") {
            return renderEndpointSetting(provider, "quick");
        }
        if (endpointError(provider) || currentEndpoint(provider) !== defaultEndpoint(provider)) {
            return renderEndpointSetting(provider, "quick");
        }
        return null;
    };

    const renderEndpointSetting = (provider: Settings["apiProvider"], mode: "quick" | "advanced") => {
        const name = provider === "azure"
            ? "Azure OAI API URL"
            : provider === "ollama"
                ? "Ollama API URL"
                : `${PROVIDER_LABELS[provider]} API URL`;
        const description = mode === "quick"
            ? "Custom endpoint for this provider."
            : "The endpoint used for API requests.";

        if (provider === "openai") {
            return (
                <TextSettingItem
                    name={name}
                    description={description}
                    placeholder={"https://api.openai.com/v1/responses"}
                    type="url"
                    inputMode="url"
                    value={settings.openAIApiSettings.url}
                    errorMessage={errors.get("openAIApiSettings.url")}
                    setValue={(value: string) =>
                        updateSettings({
                            openAIApiSettings: {
                                ...settings.openAIApiSettings,
                                url: value,
                            },
                        })
                    }
                />
            );
        }
        if (provider === "anthropic") {
            return (
                <TextSettingItem
                    name={name}
                    description={description}
                    placeholder={"https://api.anthropic.com/v1/messages"}
                    type="url"
                    inputMode="url"
                    value={settings.anthropicApiSettings.url}
                    errorMessage={errors.get("anthropicApiSettings.url")}
                    setValue={(value: string) =>
                        updateSettings({
                            anthropicApiSettings: {
                                ...settings.anthropicApiSettings,
                                url: value,
                            },
                        })
                    }
                />
            );
        }
        if (provider === "gemini") {
            return (
                <TextSettingItem
                    name={name}
                    description={description}
                    placeholder={"https://generativelanguage.googleapis.com/v1beta"}
                    type="url"
                    inputMode="url"
                    value={settings.geminiApiSettings.url}
                    errorMessage={errors.get("geminiApiSettings.url")}
                    setValue={(value: string) =>
                        updateSettings({
                            geminiApiSettings: {
                                ...settings.geminiApiSettings,
                                url: value,
                            },
                        })
                    }
                />
            );
        }
        if (provider === "azure") {
            return (
                <TextSettingItem
                    name={name}
                    description={mode === "quick" ? "Paste your Azure deployment URL." : description}
                    placeholder={"https://resource.openai.azure.com/openai/deployments/model/chat/completions"}
                    type="url"
                    inputMode="url"
                    value={settings.azureOAIApiSettings.url}
                    errorMessage={errors.get("azureOAIApiSettings.url")}
                    setValue={(value: string) =>
                        updateSettings({
                            azureOAIApiSettings: {
                                ...settings.azureOAIApiSettings,
                                url: value,
                            },
                        })
                    }
                />
            );
        }
        return (
            <TextSettingItem
                name={name}
                description={mode === "quick" ? "Local Ollama chat endpoint." : description}
                placeholder={"http://localhost:11434/api/chat"}
                type="url"
                inputMode="url"
                value={settings.ollamaApiSettings.url}
                errorMessage={errors.get("ollamaApiSettings.url")}
                setValue={(value: string) =>
                    updateSettings({
                        ollamaApiSettings: {
                            ...settings.ollamaApiSettings,
                            url: value,
                        },
                    })
                }
            />
        );
    };

    const renderKeySetting = (provider: Exclude<Settings["apiProvider"], "ollama">, quick = false) => {
        const description = quick
            ? `Paste your ${PROVIDER_LABELS[provider]} key. It stays in plugin settings.`
            : "The API key used in requests.";
        if (provider === "openai") {
            return (
                <TextSettingItem
                    name={"OpenAI API Key"}
                    description={description}
                    placeholder={"sk-..."}
                    password
                    autoComplete="off"
                    value={settings.openAIApiSettings.key}
                    errorMessage={errors.get("openAIApiSettings.key")}
                    setValue={(value: string) =>
                        updateSettings({
                            openAIApiSettings: {
                                ...settings.openAIApiSettings,
                                key: value,
                            },
                        })
                    }
                />
            );
        }
        if (provider === "anthropic") {
            return (
                <TextSettingItem
                    name={"Anthropic API Key"}
                    description={description}
                    placeholder={"sk-ant-..."}
                    password
                    autoComplete="off"
                    value={settings.anthropicApiSettings.key}
                    errorMessage={errors.get("anthropicApiSettings.key")}
                    setValue={(value: string) =>
                        updateSettings({
                            anthropicApiSettings: {
                                ...settings.anthropicApiSettings,
                                key: value,
                            },
                        })
                    }
                />
            );
        }
        if (provider === "gemini") {
            return (
                <TextSettingItem
                    name={"Gemini API Key"}
                    description={description}
                    placeholder={"Your Gemini API key…"}
                    password
                    autoComplete="off"
                    value={settings.geminiApiSettings.key}
                    errorMessage={errors.get("geminiApiSettings.key")}
                    setValue={(value: string) =>
                        updateSettings({
                            geminiApiSettings: {
                                ...settings.geminiApiSettings,
                                key: value,
                            },
                        })
                    }
                />
            );
        }
        return (
            <TextSettingItem
                name={"Azure API Key"}
                description={description}
                placeholder={"Your Azure API key…"}
                password
                autoComplete="off"
                value={settings.azureOAIApiSettings.key}
                errorMessage={errors.get("azureOAIApiSettings.key")}
                setValue={(value: string) =>
                    updateSettings({
                        azureOAIApiSettings: {
                            ...settings.azureOAIApiSettings,
                            key: value,
                        },
                    })
                }
            />
        );
    };

    const renderModelSetting = (provider: Settings["apiProvider"], mode: "quick" | "advanced") => {
        if (provider === "openai") {
            return (
                <ProviderModelDropDownSettingItem
                    mode={mode}
                    settings={settings}
                    value={settings.openAIApiSettings.model}
                    setValue={(value: string) =>
                        updateSettings({
                            openAIApiSettings: {
                                ...settings.openAIApiSettings,
                                model: value,
                            },
                        })
                    }
                    errorMessage={errors.get("openAIApiSettings.model")}
                />
            );
        }
        if (provider === "anthropic") {
            return (
                <ProviderModelDropDownSettingItem
                    mode={mode}
                    settings={settings}
                    value={settings.anthropicApiSettings.model}
                    setValue={(value: string) =>
                        updateSettings({
                            anthropicApiSettings: {
                                ...settings.anthropicApiSettings,
                                model: value,
                            },
                        })
                    }
                    errorMessage={errors.get("anthropicApiSettings.model")}
                />
            );
        }
        if (provider === "gemini") {
            return (
                <ProviderModelDropDownSettingItem
                    mode={mode}
                    settings={settings}
                    value={settings.geminiApiSettings.model}
                    setValue={(value: string) =>
                        updateSettings({
                            geminiApiSettings: {
                                ...settings.geminiApiSettings,
                                model: value,
                            },
                        })
                    }
                    errorMessage={errors.get("geminiApiSettings.model")}
                />
            );
        }
        if (provider === "ollama") {
            return (
                <TextSettingItem
                    name={"Model"}
                    description={"The local Ollama model to use."}
                    placeholder="llama3.1:8b"
                    value={settings.ollamaApiSettings.model}
                    setValue={(value: string) =>
                        updateSettings({
                            ollamaApiSettings: {
                                ...settings.ollamaApiSettings,
                                model: value,
                            },
                        })
                    }
                    errorMessage={errors.get("ollamaApiSettings.model")}
                />
            );
        }
        return null;
    };

    const renderQuickProviderNotice = () => {
        if (settings.apiProvider === "openai") {
            return null;
        }
        return (
            <SettingsItem
                name={"Provider"}
                description={"This vault is already configured to use this provider. Change providers in Advanced Settings."}
            >
                <span>{PROVIDER_LABELS[settings.apiProvider]}</span>
            </SettingsItem>
        );
    };

    const renderQuickSetup = () => {
        const provider = settings.apiProvider;
        return (
            <>
                <h2>Quick Setup</h2>
                <CheckBoxSettingItem
                    name={"Enable"}
                    description={"Turn autocomplete on or off."}
                    enabled={settings.enabled}
                    setEnabled={(value) => updateSettings({enabled: value})}
                />
                {renderQuickProviderNotice()}
                {renderQuickEndpointIfNeeded(provider)}
                {provider !== "ollama" && renderKeySetting(provider, true)}
                {renderModelSetting(provider, "quick")}
                <ConnectivityCheck key={`quick-${provider}`} pluginVersion={props.pluginVersion} settings={settings}/>
            </>
        );
    };

    const renderAdvancedApiSettings = () => {
        const provider = settings.apiProvider;
        return (
            <>
                <h2>Provider & Endpoints</h2>
                <DropDownSettingItem
                    name={"API Provider"}
                    description={"Choose the provider used for completion requests."}
                    value={settings.apiProvider}
                    setValue={setProvider}
                    options={PROVIDER_OPTIONS}
                    errorMessage={errors.get("apiProvider")}
                />
                {renderEndpointSetting(provider, "advanced")}
                {provider !== "ollama" && renderKeySetting(provider)}
                {renderModelSetting(provider, "advanced")}
            </>
        );
    };

    const renderModelOptions = () => (
        <>
            <h2>Model Options</h2>
            {modelCapabilities.isReasoningModel && (
                <SettingsItem
                    name={"Reasoning Model"}
                    description={"The selected model rejects some sampling controls, so unsupported options are hidden."}
                >
                    <span/>
                </SettingsItem>
            )}
            {(modelCapabilities.supportsTemperature || modelCapabilities.supportsTopP) && (<>
                {modelCapabilities.supportsTemperature && (
                    <SliderSettingsItem
                        name={"Temperature"}
                        description={"Controls randomness. Lower values are steadier; higher values are more varied."}
                        value={settings.modelOptions.temperature}
                        errorMessage={errors.get("modelOptions.temperature")}
                        setValue={(value: number) =>
                            updateSettings({
                                modelOptions: {
                                    ...settings.modelOptions,
                                    temperature: value,
                                },
                            })
                        }
                        min={MIN_TEMPERATURE}
                        max={MAX_TEMPERATURE}
                        step={0.05}
                    />
                )}
                {modelCapabilities.supportsTopP && (
                    <SliderSettingsItem
                        name={"Top P"}
                        description={"Controls how widely the model samples likely next tokens."}
                        value={settings.modelOptions.top_p}
                        errorMessage={errors.get("modelOptions.top_p")}
                        setValue={(value: number) =>
                            updateSettings({
                                modelOptions: {
                                    ...settings.modelOptions,
                                    top_p: value,
                                },
                            })
                        }
                        min={MIN_TOP_P}
                        max={MAX_TOP_P}
                        step={0.05}
                    />
                )}
            </>)}
            {(modelCapabilities.supportsFrequencyPenalty || modelCapabilities.supportsPresencePenalty) && (<>
                {modelCapabilities.supportsFrequencyPenalty && (
                    <SliderSettingsItem
                        name={"Frequency Penalty"}
                        description={"Reduces repeated wording based on how often tokens have already appeared."}
                        value={settings.modelOptions.frequency_penalty}
                        errorMessage={errors.get("modelOptions.frequency_penalty")}
                        setValue={(value: number) =>
                            updateSettings({
                                modelOptions: {
                                    ...settings.modelOptions,
                                    frequency_penalty: value,
                                },
                            })
                        }
                        min={MIN_FREQUENCY_PENALTY}
                        max={MAX_FREQUENCY_PENALTY}
                        step={0.05}
                    />
                )}
                {modelCapabilities.supportsPresencePenalty && (
                    <SliderSettingsItem
                        name={"Presence Penalty"}
                        description={"Encourages the model to introduce wording it has not used yet."}
                        value={settings.modelOptions.presence_penalty}
                        errorMessage={errors.get("modelOptions.presence_penalty")}
                        setValue={(value: number) =>
                            updateSettings({
                                modelOptions: {
                                    ...settings.modelOptions,
                                    presence_penalty: value,
                                },
                            })
                        }
                        min={MIN_PRESENCE_PENALTY}
                        max={MAX_PRESENCE_PENALTY}
                        step={0.05}
                    />
                )}
            </>)}
            {modelCapabilities.supportsMaxTokens && (
                <SliderSettingsItem
                    name={"Max Tokens"}
                    description={"Maximum completion length returned by the model."}
                    value={settings.modelOptions.max_tokens}
                    errorMessage={errors.get("modelOptions.max_tokens")}
                    setValue={(value: number) =>
                        updateSettings({
                            modelOptions: {
                                ...settings.modelOptions,
                                max_tokens: value,
                            },
                        })
                    }
                    min={MIN_MAX_TOKENS}
                    max={MAX_MAX_TOKENS}
                    step={10}
                />
            )}
        </>
    );

    const renderProcessingSettings = () => (
        <>
            <h2>Preprocessing</h2>
            <CheckBoxSettingItem
                name={"Exclude Dataview Blocks"}
                description={"Remove Dataview blocks before sending context to the provider."}
                enabled={settings.dontIncludeDataviews}
                setEnabled={(value) =>
                    updateSettings({dontIncludeDataviews: value})
                }
            />
            <CheckBoxSettingItem
                name={"Redact Sensitive Data"}
                description={"Replace obvious emails, API tokens, bearer tokens, AWS keys, and private keys before requests."}
                enabled={settings.redactSensitiveData}
                setEnabled={(value) =>
                    updateSettings({redactSensitiveData: value})
                }
            />
            <SliderSettingsItem
                name={"Maximum Prefix Length"}
                description={"Maximum characters before the cursor sent as context."}
                value={settings.maxPrefixCharLimit}
                errorMessage={errors.get("maxPrefixCharLimit")}
                setValue={(value: number) =>
                    updateSettings({maxPrefixCharLimit: value})
                }
                min={MIN_MAX_CHAR_LIMIT}
                max={MAX_MAX_CHAR_LIMIT}
                step={100}
                suffix={" chars"}
            />
            <SliderSettingsItem
                name={"Maximum Suffix Length"}
                description={"Maximum characters after the cursor sent as context."}
                value={settings.maxSuffixCharLimit}
                errorMessage={errors.get("maxSuffixCharLimit")}
                setValue={(value: number) =>
                    updateSettings({maxSuffixCharLimit: value})
                }
                min={MIN_MAX_CHAR_LIMIT}
                max={MAX_MAX_CHAR_LIMIT}
                step={100}
                suffix={" chars"}
            />
            <h2>Postprocessing</h2>
            <CheckBoxSettingItem
                name={"Remove Duplicate Math Markers"}
                description={"Remove duplicate `$` markers when the cursor is already inside a math block."}
                enabled={settings.removeDuplicateMathBlockIndicator}
                setEnabled={(value) =>
                    updateSettings({removeDuplicateMathBlockIndicator: value})
                }
            />
            <CheckBoxSettingItem
                name={"Remove Duplicate Code Markers"}
                description={"Remove duplicate code fence markers when the cursor is already inside a code block."}
                enabled={settings.removeDuplicateCodeBlockIndicator}
                setEnabled={(value) =>
                    updateSettings({removeDuplicateCodeBlockIndicator: value})
                }
            />
        </>
    );

    const renderTriggerSettings = () => (
        <>
            <h2>Trigger</h2>
            <SliderSettingsItem
                name={"Delay"}
                description={"Milliseconds between your last keystroke and the completion request."}
                value={settings.delay}
                errorMessage={errors.get("delay")}
                setValue={(value: number) => updateSettings({delay: value})}
                min={MIN_DELAY}
                max={MAX_DELAY}
                step={100}
                suffix={"ms"}
            />
            <TriggerSettings
                name={"Trigger Words"}
                description={"Completions trigger when text before the cursor matches one of these strings or regexes."}
                triggers={settings.triggers}
                setValues={(triggers) => updateSettings({triggers})}
                errorMessage={errors.get("triggerWords")}
                errorMessages={errors}
            />
        </>
    );

    const renderPrivacySettings = () => (
        <>
            <h2>Privacy</h2>
            <SettingsItem
                name={"Ignored Files"}
                description={
                    <div>
                        <p>Ignore matching files or folders. Enter one glob pattern per line.</p>
                        <ul>
                            <li><code>path/to/folder/**</code>: ignore everything in a folder.</li>
                            <li><code>**/secret/**</code>: ignore any folder named <code>secret</code>.</li>
                            <li><code>!path/to/folder/example.md</code>: undo an ignore for one file.</li>
                        </ul>
                    </div>
                }
                display={"block"}
                errorMessage={errors.get("ignoredFilePatterns")}
            >
                <textarea
                    aria-label="Ignored files"
                    name="ignored-files"
                    className="setting-item-text-area-copilot-auto-completion"
                    rows={10}
                    placeholder="**/secret/**"
                    value={settings.ignoredFilePatterns}
                    onChange={(e) =>
                        updateSettings({
                            ignoredFilePatterns: e.target.value,
                        })
                    }
                    spellCheck={false}
                />
            </SettingsItem>
            <SettingsItem
                name={"Ignored Tags"}
                description={"Ignore files containing any of these tags. Enter one tag per line without #."}
                display={"block"}
                errorMessage={errors.get("ignoredTags")}
            >
                <textarea
                    aria-label="Ignored tags"
                    name="ignored-tags"
                    className="setting-item-text-area-copilot-auto-completion"
                    rows={10}
                    placeholder="secret"
                    value={settings.ignoredTags}
                    onChange={(e) =>
                        updateSettings({
                            ignoredTags: e.target.value,
                        })
                    }
                    spellCheck={false}
                />
            </SettingsItem>
        </>
    );

    const renderSupportSettings = () => (
        <>
            <h2>Support</h2>
            <DiagnosticsSettingItem/>
            <ReportIssueSettingItem pluginVersion={props.pluginVersion} settings={settings}/>

            <h2>Danger Zone</h2>
            <SettingsItem
                name={"Factory Reset"}
                description={"Restore defaults. Provider URLs, API keys, and selected models are preserved."}
            >
                <button
                    aria-label="Reset to default settings"
                    onClick={resetSettings}
                >
                    Reset
                </button>
            </SettingsItem>
        </>
    );

    const renderPromptSettings = () => (
        <>
            <h2>Prompt Engineering</h2>
            <TextSettingItem
                name={"Answer Extraction Regex"}
                description={"Optional regex for removing preamble before the final completion."}
                placeholder={"your regex…"}
                value={settings.chainOfThoughRemovalRegex}
                errorMessage={errors.get("chainOfThoughRemovalRegex")}
                setValue={(value: string) =>
                    updateSettings({
                        chainOfThoughRemovalRegex: value,
                    })
                }
            />

            <SettingsItem
                name={"System Message"}
                description={"Instructions used to generate a completion."}
                display={"block"}
                errorMessage={errors.get("systemMessage")}
            >
                <textarea
                    aria-label="System message"
                    name="system-message"
                    className="setting-item-text-area-copilot-auto-completion"
                    rows={10}
                    placeholder="Your system message…"
                    value={settings.systemMessage}
                    onChange={(e) =>
                        updateSettings({
                            systemMessage: e.target.value,
                        })
                    }
                    spellCheck={false}
                />
            </SettingsItem>

            <SettingsItem
                name={"User Message Template"}
                description={"Template for formatting prefix and suffix with {{prefix}} and {{suffix}}."}
                display={"block"}
                errorMessage={errors.get("userMessageTemplate")}
            >
                <textarea
                    aria-label="User message template"
                    name="user-message-template"
                    className="setting-item-text-area-copilot-auto-completion"
                    rows={3}
                    placeholder="{{prefix}}<mask/>{{suffix}}"
                    value={settings.userMessageTemplate}
                    onChange={(e) =>
                        updateSettings({
                            userMessageTemplate: e.target.value,
                        })
                    }
                    spellCheck={false}
                />
            </SettingsItem>
            <FewShotExampleSettings
                fewShotExamples={settings.fewShotExamples}
                name={"Few-Shot Examples"}
                description={"Examples that teach the model the expected completion format for each context."}
                setFewShotExamples={(value) =>
                    updateSettings({fewShotExamples: value})
                }
                errorMessages={errors}
            />
        </>
    );

    const renderAdvancedSettings = () => (
        <>
            <CheckBoxSettingItem
                name={"Advanced Settings"}
                description={"Show provider switching, endpoints, model parameters, triggers, privacy, diagnostics, reset, and prompts."}
                enabled={settings.advancedMode}
                setEnabled={(value) => updateSettings({advancedMode: value})}
            />

            {settings.advancedMode && (
                <>
                    <h2>General</h2>
                    <CheckBoxSettingItem
                        name={"Cache Completions"}
                        description={"Reuse recent completions after accepting or rejecting them."}
                        enabled={settings.cacheSuggestions}
                        setEnabled={(value) => updateSettings({cacheSuggestions: value})}
                    />
                    <CheckBoxSettingItem
                        name={"Debug Mode"}
                        description={"Log request and response summaries. Note contents and API keys are not logged."}
                        enabled={settings.debugMode}
                        setEnabled={(value) => updateSettings({debugMode: value})}
                    />
                    {renderAdvancedApiSettings()}
                    {renderModelOptions()}
                    {renderProcessingSettings()}
                    {renderTriggerSettings()}
                    {renderPrivacySettings()}
                    {renderSupportSettings()}
                    {renderPromptSettings()}
                </>
            )}
        </>
    );

    const currentEndpoint = (provider: Settings["apiProvider"]): string => {
        if (provider === "openai") {
            return settings.openAIApiSettings.url;
        }
        if (provider === "anthropic") {
            return settings.anthropicApiSettings.url;
        }
        if (provider === "gemini") {
            return settings.geminiApiSettings.url;
        }
        if (provider === "azure") {
            return settings.azureOAIApiSettings.url;
        }
        return settings.ollamaApiSettings.url;
    };

    const defaultEndpoint = (provider: Settings["apiProvider"]): string => {
        if (provider === "openai") {
            return DEFAULT_SETTINGS.openAIApiSettings.url;
        }
        if (provider === "anthropic") {
            return DEFAULT_SETTINGS.anthropicApiSettings.url;
        }
        if (provider === "gemini") {
            return DEFAULT_SETTINGS.geminiApiSettings.url;
        }
        if (provider === "azure") {
            return DEFAULT_SETTINGS.azureOAIApiSettings.url;
        }
        return DEFAULT_SETTINGS.ollamaApiSettings.url;
    };

    const endpointError = (provider: Settings["apiProvider"]): string | undefined => {
        if (provider === "openai") {
            return errors.get("openAIApiSettings.url");
        }
        if (provider === "anthropic") {
            return errors.get("anthropicApiSettings.url");
        }
        if (provider === "gemini") {
            return errors.get("geminiApiSettings.url");
        }
        if (provider === "azure") {
            return errors.get("azureOAIApiSettings.url");
        }
        return errors.get("ollamaApiSettings.url");
    };

    return (
        <div>
            {renderQuickSetup()}
            {renderAdvancedSettings()}
        </div>
    );
}
