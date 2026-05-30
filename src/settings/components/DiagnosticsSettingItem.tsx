import * as React from "react";

import SettingsItem from "./SettingsItem";
import {getLastRequestDiagnostics} from "../../prediction_services/diagnostics";

export default function DiagnosticsSettingItem(): React.JSX.Element {
    const diagnostics = getLastRequestDiagnostics();

    if (!diagnostics) {
        return (
            <SettingsItem
                name={"Last request diagnostics"}
                description={"Local-only diagnostics will appear here after a connection test or completion request."}
            >
                <span>Not available</span>
            </SettingsItem>
        );
    }

    return (
        <SettingsItem
            name={"Last request diagnostics"}
            description={"Local-only diagnostics. This does not include API keys or note contents."}
            display={"block"}
        >
            <div>
                <p>Provider: {diagnostics.provider}</p>
                <p>Model: {diagnostics.model}</p>
                <p>Endpoint: {diagnostics.endpoint}</p>
                <p>Request chars: {diagnostics.requestCharCount ?? "Unknown"}</p>
                <p>Response chars: {diagnostics.responseCharCount ?? "Unknown"}</p>
                <p>Latency: {diagnostics.latencyMs ?? "Unknown"} ms</p>
                <p>Retries: {diagnostics.retryCount ?? 0}</p>
                <p>Error: {diagnostics.errorCode ?? "None"}</p>
                <p>Prompt bundle: {diagnostics.promptBundleVersion ?? "Unknown"}</p>
            </div>
        </SettingsItem>
    );
}
