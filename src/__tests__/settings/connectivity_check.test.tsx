import {afterEach, beforeEach, describe, expect, jest, test} from "@jest/globals";
import * as React from "react";
import {act} from "react-dom/test-utils";
import {createRoot, Root} from "react-dom/client";
import {Notice, requestUrl} from "obsidian";

import ConnectivityCheck from "../../settings/components/ConnectivityCheck";
import {DEFAULT_SETTINGS, Settings} from "../../settings/versions";
import {cloneDeep} from "../../test_utils/clone";

jest.mock("obsidian", () => ({
    Notice: jest.fn(),
    requestUrl: jest.fn(),
}), {virtual: true});

const mockedRequestUrl = requestUrl as any;
const mockedNotice = Notice as unknown as jest.Mock;
const reactTestGlobal = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
};
reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;

type ConfigurationUpdate = (settings: Settings) => Array<{
    settings: Settings;
    revision: number;
}>;

describe("ConnectivityCheck", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mockedRequestUrl.mockReset();
        mockedNotice.mockReset();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    test.each<[string, ConfigurationUpdate]>([
        ["API key", (settings) => [{settings: withOpenRouter(settings, {key: "new-key"}), revision: 2}]],
        ["endpoint", (settings) => [{settings: withOpenRouter(settings, {url: `${settings.openRouterApiSettings.url}?changed=1`}), revision: 2}]],
        ["model", (settings) => [{settings: withOpenRouter(settings, {model: "google/gemini-3.5-flash"}), revision: 2}]],
        ["provider", (settings) => [{settings: withAnthropic(settings), revision: 2}]],
        ["provider away and back", (settings) => [
            {settings: withAnthropic(settings), revision: 2},
            {settings, revision: 3},
        ]],
    ])("ignores a successful stale request after changing %s", async (_name, updates) => {
        let resolveRequest: (value: unknown) => void = () => undefined;
        mockedRequestUrl.mockReturnValue(new Promise((resolve) => {
            resolveRequest = resolve;
        }));
        const settings = openRouterSettings();
        const onVerificationChange = jest.fn();

        await renderCheck(settings, 1, onVerificationChange);
        await act(async () => {
            clickTestConnection();
            await Promise.resolve();
        });

        for (const update of updates(settings)) {
            await renderCheck(update.settings, update.revision, onVerificationChange);
        }

        await act(async () => {
            resolveRequest({
                status: 200,
                json: {choices: [{message: {content: "hello world"}}]},
            });
            await Promise.resolve();
        });

        expect(onVerificationChange).toHaveBeenCalledTimes(1);
        expect(onVerificationChange).toHaveBeenCalledWith(false);
        expect(mockedNotice).not.toHaveBeenCalledWith(
            expect.stringContaining("Successfully connected")
        );
    });

    async function renderCheck(
        settings: Settings,
        connectionRevision: number,
        onVerificationChange: (verified: boolean) => void
    ): Promise<void> {
        await act(async () => {
            root.render(
                <ConnectivityCheck
                    pluginVersion="1.4.2"
                    settings={settings}
                    connectionRevision={connectionRevision}
                    onVerificationChange={onVerificationChange}
                />
            );
        });
    }

    function clickTestConnection(): void {
        const button = container.querySelector<HTMLButtonElement>("button[aria-label='Test Connection']");
        if (!button) {
            throw new Error("Test Connection button was not rendered.");
        }
        button.dispatchEvent(new MouseEvent("click", {bubbles: true}));
    }
});

function openRouterSettings(): Settings {
    const settings = cloneDeep(DEFAULT_SETTINGS);
    settings.apiProvider = "openrouter";
    settings.openRouterApiSettings = {
        key: "original-key",
        model: "google/gemini-3.1-flash-lite-preview",
        url: "https://openrouter.ai/api/v1/chat/completions",
    };
    return settings;
}

function withOpenRouter(
    settings: Settings,
    update: Partial<Settings["openRouterApiSettings"]>
): Settings {
    return {
        ...settings,
        openRouterApiSettings: {
            ...settings.openRouterApiSettings,
            ...update,
        },
    };
}

function withAnthropic(settings: Settings): Settings {
    return {
        ...settings,
        apiProvider: "anthropic",
        anthropicApiSettings: {
            ...settings.anthropicApiSettings,
            key: "anthropic-key",
            model: "claude-sonnet-4-6",
        },
    };
}
