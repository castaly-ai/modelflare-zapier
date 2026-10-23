import {
  ATTRIBUTION_HEADER,
  CATALOG_URL,
  SMART_KEY_HINT,
  attributionValue,
  classifyModels,
  describeError,
  errorFromResponse,
  needsCatalog,
  resolveBaseUrl,
  signUpUrl,
  type CatalogEntry,
  type ModelKind,
  type ModelListEntry,
} from '@modelflare/core'
import { version as platformVersion, type Bundle, type HttpRequestOptions, type HttpResponse, type ZObject } from 'zapier-platform-core'

const VERSION = __MODELFLARE_PLUGIN_VERSION__
const UTM_SOURCE = 'zapier'
const ATTRIBUTION = attributionValue('modelflare-zapier', VERSION)

// Keep the region to the declared choice values. Zapier's auth-template
// builder runs middleware with opaque placeholders; passing that placeholder
// to resolveBaseUrl makes template generation fail before authData.apiKey can
// become Authorization: Bearer {{bundle.authData.apiKey}}.
const baseUrl = (bundle: Bundle) => resolveBaseUrl(bundle.authData.region === 'china' ? 'china' : 'global')

const addAuth = (request: HttpRequestOptions & { url?: string }, _z: ZObject, bundle: Bundle) => {
  if (request.url?.startsWith(baseUrl(bundle))) {
    request.headers = {
      ...request.headers,
      Authorization: `Bearer ${bundle.authData.apiKey}`,
      [ATTRIBUTION_HEADER]: ATTRIBUTION,
    }
  }
  return request
}

const explainErrors = async (response: HttpResponse, z: ZObject) => {
  if (response.status >= 400 && (response.request.url ?? '').startsWith('https://')) {
    const error = await errorFromResponse(new Response(response.content, { status: response.status }))
    throw new z.errors.Error(describeError(error, { locale: 'en', utmSource: UTM_SOURCE }), error.code ?? error.kind, response.status)
  }
  return response
}

async function modelsOfKind(z: ZObject, bundle: Bundle, kind: ModelKind) {
  const list = await z.request<{ data?: ModelListEntry[] }>({ url: `${baseUrl(bundle)}/models?scope=authorized` })
  const matches = (model: ReturnType<typeof classifyModels>[number]) =>
    model.kind === kind && (kind !== 'text' || model.endpoints.includes('openai'))
  let catalog: CatalogEntry[] | null = null
  try {
    if (!needsCatalog(list.data.data ?? [])) return classifyModels(list.data.data ?? [], null).filter(matches)
    const response = await z.request<{ data?: CatalogEntry[] }>({ url: CATALOG_URL, skipThrowForStatus: true })
    catalog = response.status === 200 && Array.isArray(response.data?.data) ? response.data.data : null
  } catch {
    catalog = null
  }
  return classifyModels(list.data.data ?? [], catalog).filter(matches)
}

const modelTrigger = (kind: ModelKind) => ({
  key: `${kind}_models`,
  noun: 'Model',
  display: { label: `List ${kind} models`, description: `Lists the ${kind} models your key can call.`, hidden: true },
  operation: {
    perform: async (z: ZObject, bundle: Bundle) =>
      (await modelsOfKind(z, bundle, kind)).map((model) => ({ id: model.id, name: model.id })),
  },
})

const modelField = (kind: ModelKind) => ({
  key: 'model',
  label: 'Model',
  required: true,
  dynamic: `${kind}_models.id.name`,
  helpText: `${kind[0]!.toUpperCase()}${kind.slice(1)} models your key can call.`,
})

const parametersField = {
  key: 'parameters',
  label: 'Parameters (JSON)',
  required: false,
  type: 'text' as const,
  helpText:
    "Model-specific fields as a JSON object, sent unchanged. Each model's fields are on its page in the [Modelflare model docs](https://docs.modelflare.dev/models/).",
}

function jsonInput(z: ZObject, value: unknown, name: string): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {}
  try {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // Reported below.
  }
  throw new z.errors.Error(`${name} must be a JSON object`, 'invalid_input', 400)
}

const chat = {
  key: 'chat',
  noun: 'Reply',
  display: { label: 'Message a Model', description: 'Sends a prompt to any text model your Modelflare key can call.' },
  operation: {
    inputFields: [
      modelField('text'),
      { key: 'prompt', label: 'Prompt', required: true, type: 'text' as const },
      { key: 'system', label: 'System Message', required: false, type: 'text' as const },
      {
        key: 'image_url',
        label: 'Image URL',
        required: false,
        type: 'string' as const,
        helpText: 'Optional image input for a vision-capable text model. Use an HTTPS or data URL.',
      },
      parametersField,
    ],
    perform: async (
      z: ZObject,
      bundle: Bundle<{ model: string; prompt: string; system?: string; image_url?: string; parameters?: string }>,
    ) => {
      const { model, prompt, system, image_url: imageUrl, parameters } = bundle.inputData
      const selected = (await modelsOfKind(z, bundle, 'text')).find((candidate) => candidate.id === model)
      if (!selected) throw new z.errors.Error(`${model} is not a chat-completions model your key can call.`, 'model_not_found', 404)
      const userContent = imageUrl
        ? [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ]
        : prompt
      const response = await z.request<{ choices?: Array<{ message?: { content?: string } }>; model?: string; usage?: unknown }>({
        url: `${baseUrl(bundle)}/chat/completions`,
        method: 'POST',
        body: {
          ...jsonInput(z, parameters, 'Parameters'),
          model: selected.id,
          messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: userContent }],
        },
      })
      return { content: response.data.choices?.[0]?.message?.content ?? '', model: response.data.model ?? model, usage: response.data.usage }
    },
    sample: { content: 'Hello!', model: 'model-id', usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } },
  },
}

const generateImage = {
  key: 'generate_image',
  noun: 'Image',
  display: { label: 'Generate Image', description: 'Generates an image with any image model your Modelflare key can call.' },
  operation: {
    inputFields: [modelField('image'), { key: 'prompt', label: 'Prompt', required: true, type: 'text' as const }, parametersField],
    perform: async (z: ZObject, bundle: Bundle<{ model: string; prompt: string; parameters?: string }>) => {
      const { model: modelId, prompt, parameters } = bundle.inputData
      const model = (await modelsOfKind(z, bundle, 'image')).find((candidate) => candidate.id === modelId)
      if (!model) throw new z.errors.Error(`${modelId} is not an image model your key can call.`, 'model_not_found', 404)
      const extra = jsonInput(z, parameters, 'Parameters')
      const files: string[] = []
      if (model.imageRoute === 'gemini-generate-content') {
        const { contents, ...rest } = extra
        const response = await z.request<{ candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> }>({
          url: `${baseUrl(bundle)}/models/${encodeURIComponent(model.id)}:generateContent`,
          method: 'POST',
          body: { contents: contents ?? [{ role: 'user', parts: [{ text: prompt }] }], ...rest },
        })
        for (const part of response.data.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? []) {
          if (part.inlineData?.data) {
            const data = Buffer.from(part.inlineData.data, 'base64')
            files.push(await z.stashFile(data, data.length, `${model.id}.png`, part.inlineData.mimeType ?? 'image/png'))
          }
        }
      } else {
        const response = await z.request<{ data?: Array<{ url?: string; b64_json?: string }> }>({
          url: `${baseUrl(bundle)}/images/generations`,
          method: 'POST',
          body: { ...extra, model: model.id, prompt },
        })
        for (const item of response.data.data ?? []) {
          if (item.b64_json) {
            const data = Buffer.from(item.b64_json, 'base64')
            files.push(await z.stashFile(data, data.length, `${model.id}.png`, 'image/png'))
          } else if (item.url) {
            // Result URLs expire, so Zapier keeps its own copy.
            files.push(await z.stashFile(z.request({ url: item.url, raw: true })))
          }
        }
      }
      if (files.length === 0) throw new z.errors.Error(`${model.id} returned no image`, 'no_image', 502)
      return { model: model.id, file: files[0], files }
    },
    sample: { model: 'model-id', file: 'https://zapier.example/file.png', files: ['https://zapier.example/file.png'] },
  },
}

const createVideo = {
  key: 'create_video',
  noun: 'Video Task',
  display: { label: 'Create Video', description: 'Starts a video task with any video model your Modelflare key can call. Use Find Video to get the result.' },
  operation: {
    inputFields: [
      modelField('video'),
      {
        key: 'request',
        label: 'Request (JSON)',
        required: true,
        type: 'text' as const,
        helpText:
          "The request body as a JSON object, from the model's page in the [Modelflare video model docs](https://docs.modelflare.dev/models/video/). The model field is set for you.",
      },
    ],
    perform: async (z: ZObject, bundle: Bundle<{ model: string; request: string }>) => {
      const selected = (await modelsOfKind(z, bundle, 'video')).find((candidate) => candidate.id === bundle.inputData.model)
      if (!selected) throw new z.errors.Error(`${bundle.inputData.model} is not a video model your key can call.`, 'model_not_found', 404)
      const response = await z.request<{ id?: string; task_id?: string; status?: string }>({
        url: `${baseUrl(bundle)}/videos`,
        method: 'POST',
        body: { ...jsonInput(z, bundle.inputData.request, 'Request'), model: selected.id },
      })
      return { id: response.data.id ?? response.data.task_id, status: response.data.status ?? 'queued' }
    },
    sample: { id: 'task_123', status: 'queued' },
  },
}

const findVideo = {
  key: 'find_video',
  noun: 'Video',
  display: { label: 'Find Video', description: 'Gets a video task; returns the video file once it is completed.' },
  operation: {
    inputFields: [{ key: 'task_id', label: 'Task ID', required: true }],
    perform: async (z: ZObject, bundle: Bundle<{ task_id: string }>) => {
      const id = encodeURIComponent(bundle.inputData.task_id)
      const task = (await z.request<Record<string, unknown>>({ url: `${baseUrl(bundle)}/videos/${id}` })).data
      if (task.status !== 'completed') return [{ ...task, id: bundle.inputData.task_id }]
      // Result URLs expire, so Zapier keeps its own copy of the finished video.
      const file = await z.stashFile(z.request({ url: `${baseUrl(bundle)}/videos/${id}/content`, raw: true }))
      return [{ ...task, id: bundle.inputData.task_id, file }]
    },
    sample: { id: 'task_123', status: 'completed', file: 'https://zapier.example/video.mp4' },
  },
}

export = {
  version: VERSION,
  platformVersion,
  authentication: {
    type: 'custom',
    fields: [
      {
        key: 'apiKey',
        label: 'Smart API Key',
        type: 'password',
        required: true,
        helpText: `${SMART_KEY_HINT.en} [Get a Smart API Key](${signUpUrl(UTM_SOURCE)})`,
      },
      {
        key: 'region',
        label: 'Base URL',
        required: true,
        default: 'global',
        choices: { global: 'Global (https://modelflare.dev/v1)', china: 'China (https://origin.modelflare.dev/v1)' },
        helpText: 'Use China if your Zaps call Modelflare from mainland China. Both reach the same account, keys and models.',
      },
    ],
    test: async (z: ZObject, bundle: Bundle) => (await z.request({ url: `${baseUrl(bundle)}/models` })).data,
    connectionLabel: 'Modelflare ({{bundle.authData.region}})',
  },
  beforeRequest: [addAuth],
  afterResponse: [explainErrors],
  triggers: {
    text_models: modelTrigger('text'),
    image_models: modelTrigger('image'),
    video_models: modelTrigger('video'),
  },
  creates: { chat, generate_image: generateImage, create_video: createVideo },
  searches: { find_video: findVideo },
}
