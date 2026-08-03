import {describe, expect, test} from "@jest/globals";

import {buildGitHubIssueUrl, issueBody, shouldOfferIssueReport} from "../../support/github_issues";
import {DEFAULT_SETTINGS, Settings} from "../../settings/versions";
import {cloneDeep} from "../../test_utils/clone";
import {createProviderError, extractUnsupportedParameter} from "../../prediction_services/provider";

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
        expect(body).toContain("- Error: Unexpected plugin error. Review the developer console for details.");
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

    test("does not offer issue reports for user configuration errors", () => {
        const error = createProviderError({
            provider: "openai",
            code: "invalid_key",
            message: "Invalid API key",
            statusCode: 401,
            safeDiagnostics: {
                provider: "openai",
                model: "gpt-5.4-mini",
                endpoint: "https://api.openai.com/v1/responses",
            },
        });

        expect(shouldOfferIssueReport(error)).toEqual(false);
        expect(shouldOfferIssueReport("net::ERR_CONNECTION_REFUSED")).toEqual(false);
        expect(shouldOfferIssueReport("Request failed with HTTP 401")).toEqual(false);
    });

    test("offers issue reports for plugin response-handling errors", () => {
        const error = createProviderError({
            provider: "openai",
            code: "incomplete_response",
            message: "OpenAI returned an incomplete response without completion text.",
            safeDiagnostics: {
                provider: "openai",
                model: "gpt-5.4-mini",
                endpoint: "https://api.openai.com/v1/responses",
            },
        });

        expect(shouldOfferIssueReport(error)).toEqual(true);
        expect(shouldOfferIssueReport("Penalty is not enabled for this model")).toEqual(true);
    });

    test("does not copy raw error text into the public issue body", () => {
        const body = issueBody({
            source: "prediction",
            settings: settingsWithSecrets(),
            error: new Error(
                "Failed at https://private.example.test/path?token=secret-value with Bearer secret-token-value-1234567890 near private note text"
            ),
        });

        expect(body).toContain("Unexpected plugin error. Review the developer console for details.");
        expect(body).not.toContain("private.example.test");
        expect(body).not.toContain("secret-token-value-1234567890");
        expect(body).not.toContain("near private note text");
    });

    test("does not copy unknown provider errors into the public issue body", () => {
        const error = createProviderError({
            provider: "openai",
            code: "unknown",
            message: "Bearer secret-token-value-1234567890 near private note text",
            safeDiagnostics: {
                provider: "openai",
                model: "gpt-5.4-mini",
                endpoint: "https://api.openai.com/v1/responses",
            },
        });
        const body = issueBody({source: "prediction", error});

        expect(body).toContain("The provider returned an unexpected error.");
        expect(body).not.toContain("secret-token-value-1234567890");
        expect(body).not.toContain("near private note text");
    });

    test("allowlists provider-controlled diagnostic strings", () => {
        const body = issueBody({
            source: "prediction",
            diagnostics: {
                provider: "openai",
                model: "gpt-5.4-mini",
                endpoint: "https://api.openai.com/v1/responses",
                responseStatus: "Bearer secret-token-value-1234567890",
                incompleteReason: "near private note text",
                unsupportedParameter: "token\nprivate-note",
            },
        });

        expect(body).toContain("- Response status: Other");
        expect(body).toContain("- Incomplete reason: Other");
        expect(body).toContain("- Unsupported parameter: None");
        expect(body).not.toContain("secret-token-value-1234567890");
        expect(body).not.toContain("near private note text");
        expect(body).not.toContain("private-note");
    });

    test("accepts only safe unsupported parameter names", () => {
        expect(extractUnsupportedParameter("Unsupported parameter: 'top_p'")).toEqual("top_p");
        expect(extractUnsupportedParameter("Unsupported parameter: 'token private note'")).toEqual(null);
        expect(extractUnsupportedParameter("Unsupported parameter: 'sk-abcdefghijklmnopqrstuvwxyz123456'")).toEqual(null);
        expect(extractUnsupportedParameter(`Unsupported parameter: '${"x".repeat(65)}'`)).toEqual(null);
    });
});
