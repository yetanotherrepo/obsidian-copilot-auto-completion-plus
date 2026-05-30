import * as React from "react";

import SettingsItem from "./SettingsItem";
import {Settings} from "../versions";
import {openGitHubIssue} from "../../support/github_issues";

interface IProps {
    pluginVersion: string;
    settings: Settings;
}

export default function ReportIssueSettingItem(props: IProps): React.JSX.Element {
    return (
        <SettingsItem
            name={"Report an issue"}
            description={
                "Open a GitHub issue with safe diagnostics about your provider, model, endpoint, and plugin state. API keys and note contents are not included."
            }
        >
            <button
                aria-label="Report an issue on GitHub"
                onClick={() => openGitHubIssue({
                    source: "settings",
                    pluginVersion: props.pluginVersion,
                    settings: props.settings,
                })}
            >
                Report issue
            </button>
        </SettingsItem>
    );
}
