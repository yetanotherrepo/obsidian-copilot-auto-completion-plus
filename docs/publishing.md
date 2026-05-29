# Publishing Copilot Auto Completion Plus

## GitHub release 1.2.0

Use the release tag `1.2.0`. It must match the `version` field in `manifest.json`.

Release title:

```text
Copilot Auto Completion Plus 1.2.0
```

Release notes:

```markdown
## What's new

- Adds Anthropic and Gemini API providers.
- Adds refreshable model dropdowns for OpenAI, Anthropic, and Gemini.
- Uses the OpenAI Responses API by default for OpenAI while preserving OpenAI-compatible Chat Completions URLs.
- Updates OpenAI Chat Completions requests to use `max_completion_tokens`.
- Renames the fork to Copilot Auto Completion Plus for Obsidian Community Plugins publishing.

## Validation

- `npm run build`
- `npm run tests -- --runInBand`
- `npm audit`
```

Upload these release assets:

- `main.js`
- `manifest.json`
- `styles.css`

The prepared local zip is:

```text
/private/tmp/copilot-auto-completion-plus-1.2.0-release.zip
```

## Obsidian Community submission

The old `obsidianmd/obsidian-releases` pull-request route may be disabled by the repository owners. If GitHub says that owners disabled opening pull requests, use the Obsidian Community portal instead:

1. Sign in at `https://community.obsidian.md`.
2. Open your account's plugin management page.
3. Choose the new plugin submission flow.
4. Submit the repository URL:

```text
https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus
```

Repository URL:

```text
https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus
```

Submission fields:

```json
{
  "id": "copilot-auto-completion-plus",
  "name": "Copilot Auto Completion Plus",
  "author": "Daniil Shipilov",
  "description": "Adds configurable AI auto-completion to Obsidian using OpenAI, Anthropic, Gemini, Azure OpenAI, or Ollama.",
  "repo": "yetanotherrepo/obsidian-copilot-auto-completion-plus"
}
```
