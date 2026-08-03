import * as React from "react";
import {useState} from "react";
import SettingsItem from "./SettingsItem";
import {Notice} from "obsidian";
import {Settings} from "../versions";
import {openGitHubIssue, shouldOfferIssueReport} from "../../support/github_issues";
import {ProviderError, humanizeProviderError} from "../../prediction_services/provider";
import {createProviderAdapter} from "../../prediction_services/api_clients/factory";

interface IProps {
    pluginVersion: string;
    settings: Settings;
}

enum Status {
    NotStarted,
    Loading,
    Success,
    Failure,
}

export default function ConnectivityCheck(props: IProps): React.JSX.Element {
    const [status, setStatus] = useState<Status>(Status.NotStarted);
    const [errors, setErrors] = useState<string[]>([]);
    const [providerError, setProviderError] = useState<ProviderError | null>(null);

    React.useEffect(() => {
        setStatus(Status.NotStarted);
        setProviderError(null);
    }, [props.settings]);

    const onClickConnectionButton = async () => {
        if (status === Status.Loading) {
            return;
        }

        setStatus(Status.Loading);
        setProviderError(null);
        try {
            const client = createProviderAdapter(props.settings);
            const result = await client.checkConnection();
            if (result.isErr()) {
                setProviderError(result.error);
                setErrors([humanizeProviderError(result.error)]);
                new Notice(
                    `Cannot connect to the ${props.settings.apiProvider} API. Please check your settings.`
                );
                setStatus(Status.Failure);
                return;
            }

            setErrors([]);
            new Notice(
                `Successfully connected to the ${props.settings.apiProvider} API.`
            );
            setStatus(Status.Success);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setErrors([`${message} Check your settings or report an issue.`]);
            new Notice(
                `Cannot connect to the ${props.settings.apiProvider} API. Please check your settings.`
            );
            setStatus(Status.Failure);
            return
        }


    };

    const ProgressFeedback = () => {
        if (status === Status.Loading) {
            return (
                <span
                    aria-label="Testing connection"
                    role="status"
                    className="loader-copilot-auto-completion"
                />
            );
        }
        if (status === Status.Success) {
            return (
                <span className={"loader-placeholder-copilot-auto-completion"}>
                    <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="100%"
                        height="100%"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#00b344"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-check"
                    >
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </span>
            );
        }
        if (status === Status.Failure) {
            return (
                <span className={"loader-placeholder-copilot-auto-completion"}>
                    <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ff0000"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-x"
                    >
                        <path d="M18 6 6 18"/>
                        <path d="m6 6 12 12"/>
                    </svg>
                </span>
            );
        }

        return <span className={"loader-placeholder-copilot-auto-completion"}/>;
    };

    return (
        <SettingsItem
            name={"Test Connection"}
            description={
                "Verify that the selected provider, key, and model work."
            }
            errorMessage={errors.join("\n")}
        >
            <span aria-live="polite">{ProgressFeedback()}</span>
            <button
                aria-label="Test Connection"
                onClick={onClickConnectionButton}
                disabled={status === Status.Loading}
            >
                Test Connection
            </button>
            {status === Status.Failure && shouldOfferIssueReport(
                providerError || errors.join("\n")
            ) && (
                <button
                    aria-label="Report connection issue on GitHub"
                    onClick={() => openGitHubIssue({
                        source: "connectivity-check",
                        pluginVersion: props.pluginVersion,
                        settings: props.settings,
                        error: providerError || errors.join("\n"),
                        diagnostics: providerError?.safeDiagnostics,
                    })}
                >
                    Report issue
                </button>
            )}
        </SettingsItem>
    );
}
