import {Notice} from "obsidian";

import {IssueReportContext, openGitHubIssue, shouldOfferIssueReport} from "./github_issues";

export function showIssueReportNotice(message: string, context: IssueReportContext): Notice {
    const fragment = createFragment();

    const messageElement = createDiv();
    messageElement.textContent = message;
    fragment.append(messageElement);

    const offerIssueReport = shouldOfferIssueReport(context.error);
    if (offerIssueReport) {
        const button = createEl("button");
        button.textContent = "Report issue";
        button.addEventListener("click", () => openGitHubIssue(context));
        fragment.append(button);
    }

    return new Notice(fragment, offerIssueReport ? 0 : 10000);
}
