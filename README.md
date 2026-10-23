# Modelflare for Zapier

Chat, image and video generation in Zaps with one Modelflare **Smart API Key** for every model available to your account.

一个 Modelflare **Smart API Key**，在 Zapier 里调用你账号可用的全部模型。

Get a key / 获取 Key: https://modelflare.dev/sign-up?utm_source=zapier&utm_medium=plugin&utm_campaign=integrations

| Type | Name | What it does |
|---|---|---|
| Action | Message a Model | Sends a prompt, optional system message and optional image URL to a text/vision model |
| Action | Generate Image | Generates an image; Zapier keeps a copy of the file because result URLs expire |
| Action | Create Video | Starts a video task and returns its task ID |
| Search | Find Video | Gets a video task; returns the video file once it is completed |

Model dropdowns list the models your key can call. Model-specific fields go in **Parameters (JSON)** or **Request (JSON)**; each model's fields are on its page at https://docs.modelflare.dev/models/.

Development: `npm run validate` builds `dist/index.js` and checks it against Zapier's app schema. Publish with the Zapier Platform CLI (`zapier push`) from the company account.

MIT © Havenbyte LLC
