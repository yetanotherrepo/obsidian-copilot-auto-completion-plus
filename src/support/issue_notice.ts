import {Notice} from "obsidian";

import {IssueReportContext, openGitHubIssue} from "./github_issues";

export function showIssueReportNotice(message: string, context: IssueReportContext): Notice {
    const fragment = document.createDocumentFragment();

    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    fragment.append(messageElement);

    const button = document.createElement("button");
    button.textContent = "Report issue";
    button.addEventListener("click", () => openGitHubIssue(context));
    fragment.append(button);

    return new Notice(fragment, 0);
}
