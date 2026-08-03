# CONTRIBUTING.md

## Local Development
To develop the plugin locally, follow these steps:

1. Clone the project into this directory using: `git clone https://github.com/your-username/obsidian-copilot-auto-completion-plus` (or your fork).
2. Navigate to the newly created `obsidian-copilot-auto-completion-plus` folder using: `cd obsidian-copilot-auto-completion-plus`.
3. Install the dependencies with: `npm install`.
4. Run the build script with: `npm run dev`, which will:
    - Build the plugin and place the files in the `.obsidian/plugins/copilot-auto-completion-plus` folder.
    - Watch for file changes and automatically rebuild the plugin when changes are made. (Use the `reload app without saving` action in Obsidian to see the changes).
5. Open the `demo_vault` in your local Obsidian application.
6. Enable `copilot-auto-completion-plus` in the community plugins section.
7. Access the `Copilot Auto Completion Plus` settings and enter the necessary secrets.
8. You are now ready to test the plugin in the `demo_vault`.
9. For more information on the different test cases, refer to the [README.md](demo_vault/README.md) file in the `demo_vault`.

Want to try out in your own vault? You can do so by following these steps:
1. Go to your (development) obsidian vault.
2. Find the dotfiles folder with all the configs. Typically name `.obsidian`
3. Go to the plugin folder here. This is typically named `plugins`. If you have not installed any plugins, this folder might not exist.
4. Copy the folder `demo_vault/.obsidian/plugins/copilot-auto-completion-plus` into your own plugins folder.

You can now make changes to the plugin and test them locally.
If your changes could benefit others, feel free to submit a pull request.

Before you open a pull request, run these checks:

```bash
npm run lint
npm run build
npm run tests -- --runInBand
npm run docs:check
```

## Making a Release

Use the release procedure in [docs/publishing.md](docs/publishing.md). The release tag must use `x.y.z`. Do not add a `v` prefix.

The release workflow accepts only commits that belong to `master`. It runs the lint, build, tests, documentation checks, and dependency audit. It then creates attestations and publishes the supported plugin files.
