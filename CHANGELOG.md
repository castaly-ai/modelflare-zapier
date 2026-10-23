## 0.1.4

Update create/chat to accept an optional image URL for vision-capable models and limit the model picker to authorized Chat Completions models.

Update create/generate_image to use the API key's authorized image models and the correct Images or native Gemini protocol.

Update create/create_video and search/find_video to validate video models, preserve model-specific request fields, and return completed video files.

Fix trigger/text_models, trigger/image_models, and trigger/video_models so dropdowns no longer include models outside the API key's authorized scope.

## 0.1.3

Fix authentication middleware so Zapier's template requests can resolve the selected Modelflare region without treating placeholders as custom URLs.
