# Publishing Copilot Auto Completion Plus

## Release flow

1. Update `package.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md` for the new version.
2. Run the local validation checks:

```bash
npm run build
npm run tests -- --runInBand
npm run docs:check
npm audit
```

3. Commit the release changes.
4. Create and push a matching git tag.
5. The release workflow builds the plugin, runs tests, checks docs/release hygiene, creates artifact attestations, and publishes the release.

## Release assets

Only these assets are supported by Obsidian and should be uploaded:

- `main.js`
- `manifest.json`
- `styles.css`

Do not upload archives or extra files. Obsidian will not download them, and the automated community review reports them as additional release assets.

The release workflow generates GitHub artifact attestations for all three assets so users can verify that they were built from this repository.

## Obsidian Community portal

The old `obsidianmd/obsidian-releases` pull-request route may be disabled by the repository owners. If GitHub says that owners disabled opening pull requests, use the Obsidian Community portal instead:

1. Sign in at `https://community.obsidian.md`.
2. Open your account's plugin management page.
3. Submit or edit the plugin listing.
4. Use this repository:

```text
https://github.com/yetanotherrepo/obsidian-copilot-auto-completion-plus
```

Submission fields:

```json
{
  "id": "copilot-auto-completion-plus",
  "name": "Copilot Auto Completion Plus",
  "author": "Daniil Shipilov",
  "description": "Adds configurable AI auto-completion using OpenAI, Anthropic, Gemini, Azure OpenAI, or Ollama.",
  "repo": "yetanotherrepo/obsidian-copilot-auto-completion-plus"
}
```
