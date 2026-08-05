import * as React from "react";
import {useState} from "react";
import {Notice} from "obsidian";

import DropDownSettingItem from "./DropDownSettingItem";
import SettingsItem from "./SettingsItem";
import {Settings} from "../versions";
import {
    fetchModelsForProvider,
    getAdvancedModelOptions,
    getFallbackModels,
    getQuickModels,
    RecommendedModel,
    ModelSelection
} from "../../prediction_services/api_clients/model_list";
import {defaultModelCapabilities} from "../../prediction_services/provider";
import {isUnsupportedOpenRouterModelId} from "../../openrouter";

interface IProps {
    settings: Settings;
    value: string;
    setValue(value: string): void;
    errorMessage?: string;
    mode?: "quick" | "advanced";
    verifiedModel?: string;
}

enum Status {
    NotStarted,
    Loading,
    Success,
    Failure,
}

export default function ProviderModelDropDownSettingItem(props: IProps): React.JSX.Element {
    const mode = props.mode || "advanced";
    const [models, setModels] = useState<ModelSelection[]>(initialModels(props.settings.apiProvider, mode));
    const [status, setStatus] = useState<Status>(Status.NotStarted);
    const [loadError, setLoadError] = useState<string>("");

    React.useEffect(() => {
        setModels(initialModels(props.settings.apiProvider, mode));
        setStatus(Status.NotStarted);
        setLoadError("");
    }, [props.settings.apiProvider, mode]);

    const loadModels = async () => {
        if (status === Status.Loading) {
            return;
        }
        setStatus(Status.Loading);
        setLoadError("");

        const result = await fetchModelsForProvider(props.settings);
        if (result.isErr()) {
            setStatus(Status.Failure);
            setLoadError(result.error.message);
            new Notice(`Could not load ${props.settings.apiProvider} models.`);
            return;
        }

        const loadedModels = result.value;
        setModels(loadedModels);
        setStatus(Status.Success);
        new Notice(`Loaded ${loadedModels.length} ${props.settings.apiProvider} models.`);
    };

    const currentModelIsCustom = props.value.length > 0 && models.every((model) => model.id !== props.value);
    const options = mode === "quick"
        ? quickModelOptions(props.settings.apiProvider, props.value, props.verifiedModel)
        : modelOptions(
            getAdvancedModelOptions(props.settings.apiProvider, props.value, models),
            props.value,
            props.settings,
            currentModelIsCustom,
            props.verifiedModel
        );
    const buttonText = status === Status.Loading ? "Loading…" : "Refresh";

    return (
        <>
            <DropDownSettingItem
                name={"Model"}
                description={mode === "quick"
                    ? "Recommended models are sorted from fastest to highest quality."
                    : "Choose a model. Refresh the list after changing your API key."}
                placeholder={"Select a model..."}
                value={props.value}
                setValue={(value) => props.setValue(value)}
                options={options}
                errorMessage={props.errorMessage || loadError}
                disabled={status === Status.Loading}
            />
            {mode === "advanced" && (
                <SettingsItem
                    name={"Refresh models"}
                    description={"Load the full model list from the selected provider."}
                    errorMessage={loadError}
                >
                    {status === Status.Loading && (
                        <span
                            aria-label="Loading models"
                            role="status"
                            className="loader-copilot-auto-completion"
                        />
                    )}
                    <button
                        aria-label="Refresh models"
                        onClick={() => {
                            void loadModels();
                        }}
                        disabled={status === Status.Loading}
                    >
                        {buttonText}
                    </button>
                </SettingsItem>
            )}
        </>
    );
}

function initialModels(provider: Settings["apiProvider"], mode: "quick" | "advanced"): ModelSelection[] {
    return mode === "quick" ? getQuickModels(provider) : getFallbackModels(provider);
}

function quickModelOptions(
    provider: Settings["apiProvider"],
    currentModel: string,
    verifiedModel?: string
): { [key: string]: string } {
    const options: { [key: string]: string } = {};
    const models = getQuickModels(provider);
    if (currentModel && models.every((model) => model.id !== currentModel)) {
        if (provider === "openrouter" && isUnsupportedOpenRouterModelId(currentModel)) {
            options[currentModel] = `${currentModel} — Unsupported · Choose another model`;
        } else if (provider === "openrouter") {
            options[currentModel] = `${currentModel} — ${verificationLabel(currentModel, verifiedModel)}`;
        } else {
            options[currentModel] = `${currentModel} — Custom`;
        }
    }
    for (const model of models) {
        options[model.id] = labelRecommendedModel(model);
    }
    return options;
}

function modelOptions(
    models: ModelSelection[],
    currentModel: string,
    settings: Settings,
    currentModelIsCustom: boolean,
    verifiedModel?: string
): { [key: string]: string } {
    const options: { [key: string]: string } = {};
    for (const model of models) {
        if (settings.apiProvider === "openrouter" && isUnsupportedOpenRouterModelId(model.id)) {
            options[model.id] = `${model.name} — Unsupported · Choose another model`;
        } else if (currentModelIsCustom && model.id === currentModel) {
            const customBadges = settings.apiProvider === "openrouter"
                ? `Custom · ${verificationLabel(model.id, verifiedModel)}`
                : "Custom";
            options[model.id] = `${model.name} — ${customBadges}`;
        } else {
            options[model.id] = labelModel(model, settings, verifiedModel);
        }
    }
    return options;
}

function labelRecommendedModel(model: RecommendedModel): string {
    const badges = [model.speedLabel];
    if (model.recommended) {
        badges.push("Recommended");
    } else if (model.qualityLabel) {
        badges.push(model.qualityLabel);
    }
    return `${model.name} — ${badges.join(" · ")}`;
}

function labelModel(model: ModelSelection, settings: Settings, verifiedModel?: string): string {
    const badges: string[] = [];
    const capabilities = defaultModelCapabilities(
        settings.apiProvider,
        model.id,
        endpointFor(settings)
    );

    if (capabilities.isReasoningModel) {
        badges.push("Reasoning");
    }
    if (settings.apiProvider === "ollama") {
        badges.push("Local");
    }
    if (settings.apiProvider === "openrouter") {
        badges.push(verificationLabel(model.id, verifiedModel));
    }
    if (getQuickModels(settings.apiProvider).some((quickModel) => quickModel.id === model.id && quickModel.recommended)) {
        badges.push("Recommended");
    }

    return badges.length > 0 ? `${model.name} — ${badges.join(" · ")}` : model.name;
}

function verificationLabel(modelId: string, verifiedModel?: string): string {
    return modelId === verifiedModel ? "Verified" : "Unverified · Run Test Connection";
}

function endpointFor(settings: Settings): string {
    if (settings.apiProvider === "openai") {
        return settings.openAIApiSettings.url;
    }
    if (settings.apiProvider === "anthropic") {
        return settings.anthropicApiSettings.url;
    }
    if (settings.apiProvider === "openrouter") {
        return settings.openRouterApiSettings.url;
    }
    if (settings.apiProvider === "deepseek") {
        return settings.deepSeekApiSettings.url;
    }
    if (settings.apiProvider === "gemini") {
        return settings.geminiApiSettings.url;
    }
    if (settings.apiProvider === "azure") {
        return settings.azureOAIApiSettings.url;
    }
    return settings.ollamaApiSettings.url;
}
