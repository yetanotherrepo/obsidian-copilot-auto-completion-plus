# Publishing Copilot Auto Completion Plus

## Release flow

1. Update `package.json`, `package-lock.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md` for the new version.
2. Run the local validation checks:

```bash
npm run lint
npm run build
npm run tests -- --runInBand
npm run docs:check
npm audit --audit-level=high
```

3. Commit the release changes.
4. Merge the release commit into `master`.
5. Wait for the `master` CI workflow to pass.
6. Create and push a matching `x.y.z` git tag. Do not add a `v` prefix.
7. The release workflow checks the tag and its commit. It then runs the lint, build, tests, attestations, and release publishing.
8. Check the Obsidian Community portal and the public plugin page.

## Release assets

Only these assets are supported by Obsidian and should be uploaded:

- `main.js`
- `manifest.json`
- `styles.css`

Do not upload archives or extra files. Obsidian will not download them, and the automated community review reports them as additional release assets.

The release workflow generates GitHub artifact attestations for all three assets so users can verify that they were built from this repository.

## Existing Obsidian listing

You do not need to submit the plugin again for each version. Obsidian reads the version from `manifest.json`. It then downloads the files from the matching GitHub Release.

After the release workflow completes, check these items:

1. The GitHub Release is not a draft or prerelease.
2. The release tag matches `manifest.json` without a `v` prefix.
3. The release contains only the supported assets.
4. The Community portal completes its release review.
5. The public plugin page shows the new version.

The store update can take time. Do not treat a successful GitHub workflow as proof that the store update completed.

## Initial listing or listing changes

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
  "description": "Adds configurable AI auto-completion using OpenAI, OpenRouter, Anthropic, Gemini, Azure OpenAI, or Ollama.",
  "repo": "yetanotherrepo/obsidian-copilot-auto-completion-plus"
}
```
