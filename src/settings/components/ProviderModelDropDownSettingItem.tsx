import * as React from "react";
import {useState} from "react";
import {Notice} from "obsidian";

import DropDownSettingItem from "./DropDownSettingItem";
import SettingsItem from "./SettingsItem";
import {Settings} from "../versions";
import {
    fetchModelsForProvider,
    getFallbackModels,
    ModelSelection
} from "../../prediction_services/api_clients/model_list";

interface IProps {
    settings: Settings;
    value: string;
    setValue(value: string): void;
    errorMessage?: string;
}

enum Status {
    NotStarted,
    Loading,
    Success,
    Failure,
}

export default function ProviderModelDropDownSettingItem(props: IProps): React.JSX.Element {
    const [models, setModels] = useState<ModelSelection[]>(getFallbackModels(props.settings.apiProvider));
    const [status, setStatus] = useState<Status>(Status.NotStarted);
    const [loadError, setLoadError] = useState<string>("");

    React.useEffect(() => {
        setModels(getFallbackModels(props.settings.apiProvider));
        setStatus(Status.NotStarted);
        setLoadError("");
    }, [props.settings.apiProvider]);

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

    const options = modelOptions(models, props.value);
    const buttonText = status === Status.Loading ? "Loading..." : "Refresh";

    return (
        <>
            <DropDownSettingItem
                name={"Model"}
                description={"Choose a model. Refresh the list after changing your API key."}
                placeholder={"Select a model..."}
                value={props.value}
                setValue={props.setValue}
                options={options}
                errorMessage={props.errorMessage || loadError}
                disabled={status === Status.Loading}
            />
            <SettingsItem
                name={"Refresh models"}
                description={"Load the model list from the selected provider."}
                errorMessage={loadError}
            >
                {status === Status.Loading && <span className="loader-copilot-auto-completion"/>}
                <button
                    aria-label="Refresh models"
                    onClick={loadModels}
                    disabled={status === Status.Loading}
                >
                    {buttonText}
                </button>
            </SettingsItem>
        </>
    );
}

function modelOptions(models: ModelSelection[], currentModel: string): { [key: string]: string } {
    const options: { [key: string]: string } = {};
    if (currentModel && models.every((model) => model.id !== currentModel)) {
        options[currentModel] = currentModel;
    }

    for (const model of models) {
        options[model.id] = model.name;
    }
    return options;
}
