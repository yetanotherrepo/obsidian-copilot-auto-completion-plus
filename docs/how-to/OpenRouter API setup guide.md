# OpenRouter API Setup Guide

OpenRouter provides one API endpoint for models from multiple providers. Each model can have different prices, limits, and supported parameters.

## Create an API key

1. Open [OpenRouter](https://openrouter.ai/).
2. Sign in to your account.
3. Open the [API Keys](https://openrouter.ai/settings/keys) page.
4. Create an API key.
5. Copy the key. Do not put the key in an issue, log, or shared note.

Some models require OpenRouter credits. Check the model price and your account balance before you test the connection.

## Configure the plugin

1. Open the Copilot Auto Completion Plus settings.
2. Enable `Advanced Settings`.
3. Set `API Provider` to `OpenRouter API`.
4. Keep the default API URL: `https://openrouter.ai/api/v1/chat/completions`.
5. Paste your OpenRouter API key.
6. Select `Refresh` to load compatible text-generation models.
7. Select a model.
8. Select `Test Connection`.

The plugin does not list image, audio, safety, moderation, or code-apply models. These models do not provide standard text chat completions.

The plugin marks a selected OpenRouter model as `Unverified` until the connection test succeeds. The status resets after you change the provider, API key, endpoint, or model.

The plugin accepts only the official OpenRouter HTTPS endpoint. This restriction helps protect your API key and note context.

The plugin sends note context to OpenRouter when it requests a completion. OpenRouter can route the request to another model provider. Review the terms and privacy policy for OpenRouter and the selected model provider before you use sensitive notes.

## Troubleshooting

- If OpenRouter rejects the key, create a new key and update the plugin setting.
- If OpenRouter cannot access the model, refresh the model list and select another model.
- If OpenRouter reports insufficient credits, add credits or select a free model.
- If OpenRouter limits the request rate, wait and test the connection again.
- If OpenRouter rejects the request with HTTP 400, select another model. The selected model might not support standard chat completions or the current model options.
