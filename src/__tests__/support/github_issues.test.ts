import {describe, expect, test} from "@jest/globals";

import {buildGitHubIssueUrl, issueBody} from "../../support/github_issues";
import {DEFAULT_SETTINGS, Settings} from "../../settings/versions";
import {cloneDeep} from "../../test_utils/clone";

function settingsWithSecrets(): Settings {
    const settings = cloneDeep(DEFAULT_SETTINGS);
    settings.apiProvider = "openai";
    settings.openAIApiSettings.key = "sensitive-value";
    settings.openAIApiSettings.model = "gpt-5.5";
    settings.openAIApiSettings.url = "https://api.openai.com/v1/responses?auth=sensitive-value";
    return settings;
}

describe("GitHub issue reporting", () => {
    test("builds a GitHub issue URL with safe diagnostics", () => {
        const url = new URL(buildGitHubIssueUrl({
            source: "prediction",
            pluginVersion: "1.2.6",
            settings: settingsWithSecrets(),
            error: new Error("Unsupported parameter: 'top_p'"),
        }));

        expect(url.origin + url.pathname).toEqual(
            "https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus/issues/new"
        );
        expect(url.searchParams.get("title")).toEqual("Prediction failed");

        const body = url.searchParams.get("body") || "";
        expect(body).toContain("- Plugin version: 1.2.6");
        expect(body).toContain("- Source: prediction");
        expect(body).toContain("- Provider: OpenAI API (openai)");
        expect(body).toContain("- Model: gpt-5.5");
        expect(body).toContain("- API URL: https://api.openai.com/v1/responses");
        expect(body).toContain("- Error: Unsupported parameter: 'top_p'");
        expect(body).not.toContain("sensitive-value");
        expect(body).not.toContain("auth=sensitive-value");
    });

    test("does not include API keys or note contents in issue body", () => {
        const body = issueBody({
            source: "settings",
            settings: settingsWithSecrets(),
            error: "Something failed near private note text",
        });

        expect(body).not.toContain("sensitive-value");
        expect(body).not.toContain("auth=sensitive-value");
        expect(body).not.toContain("prefix");
        expect(body).not.toContain("suffix");
    });
});
