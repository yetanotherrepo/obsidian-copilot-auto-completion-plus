# DeepSeek API Setup Guide

DeepSeek provides an OpenAI-compatible Chat Completions API. The plugin connects directly to the official DeepSeek API.

## Create an API key

1. Open the [DeepSeek Platform](https://platform.deepseek.com/).
2. Sign in or create an account.
3. Add account credit if your selected model requires it.
4. Open the [API Keys](https://platform.deepseek.com/api_keys) page.
5. Create an API key.
6. Store the key in a secure location.

## Configure the plugin

1. Open Obsidian settings.
2. Open `Copilot Auto Completion Plus`.
3. Enable `Advanced Settings`.
4. Set `API Provider` to `DeepSeek API`.
5. Keep the default API URL: `https://api.deepseek.com/chat/completions`.
6. Paste your DeepSeek API key.
7. Select `DeepSeek V4 Flash` for lower autocomplete latency.
8. Use `Refresh` to load the current model list when necessary.
9. Select `Test Connection`.

The plugin sends `temperature`, `top_p`, and `max_tokens` when the selected model supports them. The plugin retries without a parameter when the API identifies that parameter as unsupported.

## Security and privacy

The plugin accepts only the official DeepSeek HTTPS endpoint. This restriction protects the API key and note context from custom endpoints.

The plugin sends note context to DeepSeek when it requests a completion. Review the DeepSeek privacy terms before you use sensitive notes.

## Troubleshooting

- If DeepSeek rejects the key, create a new key and update the plugin setting.
- If DeepSeek cannot access the model, select `Refresh` and choose another model.
- If DeepSeek reports insufficient balance, add account credit or choose another model.
- If DeepSeek limits the request rate, wait and test the connection again.
- If DeepSeek rejects a request with HTTP 400, select another model or reset the model options.
