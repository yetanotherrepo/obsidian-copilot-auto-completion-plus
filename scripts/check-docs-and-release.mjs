import fs from "fs";
import path from "path";

const root = process.cwd();
const failures = [];

const forbiddenDocsText = [
    {file: "README.md", text: "top-k"},
    {file: "docs/how-to/Azure API setup guide.md", text: "gpt-3.5-turbo-16k"},
    {file: "docs/how-to/Ollama setup guide.md", text: "Copilot auto-completion: Predict"},
    {file: "docs/how-to/ignore files.md", text: "**/secrets/**"},
    {file: "docs/personalization and settings.md", text: "chain of thought tokens"},
];

for (const check of forbiddenDocsText) {
    const contents = read(check.file);
    if (contents.includes(check.text)) {
        failures.push(`${check.file} still contains obsolete text: ${check.text}`);
    }
}

checkReleaseWorkflowAssets();
checkIssueForms();
checkLocalMarkdownLinks();

if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
}

console.log("Docs and release hygiene checks passed.");

function checkReleaseWorkflowAssets() {
    const workflow = read(".github/workflows/release.yml");
    if (workflow.includes(".zip")) {
        failures.push("Release workflow must not upload zip assets.");
    }
    for (const asset of ["main.js", "manifest.json", "styles.css"]) {
        if (!workflow.includes(asset)) {
            failures.push(`Release workflow is missing ${asset}.`);
        }
    }
    if (!workflow.includes("actions/attest-build-provenance@v3")) {
        failures.push("Release workflow must generate artifact attestations.");
    }
}

function checkIssueForms() {
    for (const file of [
        ".github/ISSUE_TEMPLATE/bug_report.yml",
        ".github/ISSUE_TEMPLATE/provider_model_issue.yml",
        ".github/ISSUE_TEMPLATE/feature_request.yml",
    ]) {
        if (!fs.existsSync(path.join(root, file))) {
            failures.push(`Missing issue form: ${file}`);
        }
    }
}

function checkLocalMarkdownLinks() {
    for (const file of markdownFiles(["README.md", "CONTRIBUTING.md", "docs"])) {
        const contents = read(file);
        const linkRegex = /!?\[[^\]]*]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(contents)) !== null) {
            const href = match[1].split("#")[0];
            if (
                href.length === 0
                || href.startsWith("http://")
                || href.startsWith("https://")
                || href.startsWith("mailto:")
                || href.startsWith("#")
            ) {
                continue;
            }
            const decoded = decodeURIComponent(href);
            const target = path.resolve(root, path.dirname(file), decoded);
            if (!fs.existsSync(target)) {
                failures.push(`${file} links to missing local path: ${href}`);
            }
        }
    }
}

function markdownFiles(entries) {
    return entries.flatMap((entry) => {
        const absolute = path.join(root, entry);
        if (!fs.existsSync(absolute)) {
            return [];
        }
        const stat = fs.statSync(absolute);
        if (stat.isFile()) {
            return entry.endsWith(".md") ? [entry] : [];
        }
        return fs.readdirSync(absolute, {withFileTypes: true})
            .flatMap((dirent) => markdownFiles([path.join(entry, dirent.name)]));
    });
}

function read(file) {
    return fs.readFileSync(path.join(root, file), "utf8");
}
