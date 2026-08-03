import {Plugin, PluginSettingTab, Setting} from "obsidian";
import {createRoot, Root} from "react-dom/client";
import SettingsView from "./SettingsView";
import * as React from "react";
import {DEFAULT_SETTINGS, Settings} from "./versions";
import {checkForErrors} from "./utils";


export interface SettingsObserver {
    handleSettingChanged(settings: Settings): void;
}

type SaveSettings = (settings: Settings) => Promise<void>;
type SettingDefinition = {
    name: string;
    render(setting: Setting): void;
};


export class SettingTab extends PluginSettingTab {
    public settings: Settings = DEFAULT_SETTINGS;
    private updatedSettings: Settings | undefined = undefined;
    private observers: SettingsObserver[] = [];
    private root: Root | undefined = undefined;
    private saveSettings: SaveSettings;

    public static addSettingsTab(
        plugin: Plugin,
        settings: Settings,
        saveSettings: SaveSettings
    ): SettingTab {
        const settingsTab = new SettingTab(plugin, settings, saveSettings);
        plugin.addSettingTab(settingsTab);

        return settingsTab;
    }

    public constructor(
        private plugin: Plugin,
        settings: Settings,
        saveSettings: SaveSettings
    ) {
        super(plugin.app, plugin);
        this.plugin = plugin;
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    public addObserver(observer: SettingsObserver): void {
        this.observers.push(observer);
    }

    public setEnable(enabled: boolean): void {
        this.settings = {...this.settings, enabled: enabled};
        void this.saveSettings(this.settings).then(() => this.updateObservers());
    }

    private updateObservers(): void {
        for (const observer of this.observers) {
            observer.handleSettingChanged(this.settings);
        }
    }

    getSettingDefinitions(): SettingDefinition[] {
        return [{
            name: "Copilot Auto Completion Plus",
            render: (setting) => {
                setting.settingEl.empty();
                this.renderSettings(setting.settingEl);
            },
        }];
    }

    display(): void {
        this.renderSettings(this.containerEl);
    }

    private renderSettings(container: HTMLElement): void {
        this.root?.unmount();
        container.empty();
        this.root = createRoot(container);
        this.root.render(
            <React.StrictMode>
                <SettingsView
                    onSettingsChanged={(settings) => {
                        this.updatedSettings = settings;
                    }}
                    pluginVersion={this.plugin.manifest.version}
                    settings={this.settings}
                />
            </React.StrictMode>
        );
    }


    hide(): void {
        if (this.updatedSettings) {
            this.settings = this.updatedSettings;
            this.updatedSettings = undefined;

            const errors = checkForErrors(this.settings);
            if (errors.size > 0) {
                this.updateObservers();
            } else {
                void this.saveSettings(this.settings).then(() => this.updateObservers());
            }
        }
        if (this.root) {
            this.root.unmount();
        }
        super.hide();
    }
}
