import type { ResponsesApiResponse, ResponsesOutputItem } from '../../types';

const RESPONSES_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/api-proxy/v1'
    : 'https://max.aittco.com/v1';

const AGENT_FIXED_MODEL = 'gpt-5.5';
const DEFAULT_STREAM_PARTIAL_IMAGES = 1;

export interface AgentApiResultImage {
  toolCallId?: string;
  action?: string;
  dataUrl: string;
}

export interface AgentApiResult {
  responseId?: string;
  text: string;
  images: AgentApiResultImage[];
  outputItems: ResponsesOutputItem[];
  rawResponsePayload?: string;
}

export interface BatchImageItem {
  id: string;
  prompt: string;
}

export interface AgentImageToolConfig {
  action?: 'auto' | 'generate';
  size?: string;
  output_format?: 'png' | 'jpeg' | 'webp';
  output_compression?: number | null;
  moderation?: 'auto' | 'low';
  quality?: 'auto' | 'low' | 'medium' | 'high';
  partial_images?: number;
}

const AGENT_INSTRUCTIONS = [
  'You are an image-generation assistant in a multi-turn canvas app.',
  '',
  '## Image generation policy',
  '- If the user input is a short noun phrase, subject phrase, or scene phrase like "一只小猫", interpret it as a request to generate an image unless the user clearly asks a text-only question.',
  '- Use image_generation when the user asks to create, redesign, transform, continue, or vary images.',
  '- For 2+ independent images, you may call generate_image_batch.',
  '- When a prompt references earlier images, keep <ref id="..." /> tags in tool arguments.',
  '- Do not rely on previous_response_id, hidden server-side memory, or response item ids from prior turns.',
  '- If the task is complete, stop calling tools and return the final answer.',
  '',
  '## Style',
  '- For direct image requests, prefer generating the image instead of replying with descriptive text only.',
  '- If you have already generated the image, respond briefly.',
].join('\n');

const PROMPT_REWRITE_GUARD_PREFIX = 'Use the following text as the complete prompt. Do not rewrite it:';

function normalizeBase64Image(value: string) {
  if (value.startsWith('data:image')) return value;
  return `data:image/png;base64,${value}`;
}

function isEventStreamResponse(response: Response): boolean {
  return response.headers?.get('Content-Type')?.toLowerCase().includes('text/event-stream') ?? false;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getStringValue(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getNumberValue(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function throwIfAborted(...signals: Array<AbortSignal | undefined>) {
  const signal = signals.find((item) => item?.aborted);
  if (!signal) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('Request aborted', 'AbortError');
}

function parseServerSentEventBlock(block: string): string | null {
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    dataLines.push(line.slice(5).replace(/^ /, ''));
  }

  const data = dataLines.join('\n').trim();
  if (!data || data === '[DONE]') return null;
  return data;
}

function getStreamResponsePayload(event: Record<string, unknown>): ResponsesApiResponse | null {
  const response = event.response;
  if (isRecordValue(response)) return response as ResponsesApiResponse;

  const item = event.item;
  if (isRecordValue(item)) return { output: [item as ResponsesOutputItem] };
  return null;
}

function extractTextFromOutputItem(item: ResponsesOutputItem) {
  if (!Array.isArray(item.content)) return '';
  return item.content
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractText(payload: ResponsesApiResponse) {
  return (payload.output ?? [])
    .map(extractTextFromOutputItem)
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function extractImageFromOutputItem(item: ResponsesOutputItem): AgentApiResultImage | null {
  if (item.type !== 'image_generation_call') return null;

  const result = item.result;
  const b64 =
    typeof result === 'string'
      ? result
      : result && typeof result === 'object'
      ? typeof result.b64_json === 'string'
        ? result.b64_json
        : typeof result.base64 === 'string'
        ? result.base64
        : typeof result.image === 'string'
        ? result.image
        : typeof result.data === 'string'
        ? result.data
        : ''
      : '';

  if (!b64.trim()) return null;
  return {
    toolCallId: item.id,
    action: typeof item.action === 'string' ? item.action : undefined,
    dataUrl: normalizeBase64Image(b64),
  };
}

function extractImages(payload: ResponsesApiResponse) {
  return (payload.output ?? [])
    .map(extractImageFromOutputItem)
    .filter((image): image is AgentApiResultImage => Boolean(image));
}

async function handleApiError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    throw new Error(parsed?.error?.message || parsed?.error || text);
  } catch {
    throw new Error(text || `Agent request failed (${response.status})`);
  }
}

async function readJsonServerSentEvents(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  signals: Array<AbortSignal | undefined> = [],
) {
  if (!response.body) throw new Error('Stream response body is missing.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };

  throwIfAborted(...signals);
  for (const signal of signals) signal?.addEventListener('abort', cancelReader, { once: true });

  const processBlock = async (block: string) => {
    const data = parseServerSentEventBlock(block);
    if (!data) return;

    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error('Agent stream returned invalid JSON event.');
    }

    if (!isRecordValue(event)) return;

    const error = event.error;
    if (typeof error === 'string' && error.trim()) throw new Error(error);
    if (isRecordValue(error) && typeof error.message === 'string' && error.message.trim()) {
      throw new Error(error.message);
    }

    await onEvent(event);
  };

  try {
    while (true) {
      throwIfAborted(...signals);
      const { value, done } = await reader.read();
      throwIfAborted(...signals);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.search(/\r?\n\r?\n/);
      while (separatorIndex >= 0) {
        const matched = buffer.match(/\r?\n\r?\n/);
        const separator = matched?.[0] ?? '\n\n';
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + separator.length);
        await processBlock(block);
        separatorIndex = buffer.search(/\r?\n\r?\n/);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) await processBlock(buffer);
  } finally {
    for (const signal of signals) signal?.removeEventListener('abort', cancelReader);
  }
}

async function parseAgentStreamResponse(
  response: Response,
  signal?: AbortSignal,
): Promise<AgentApiResult> {
  let completedPayload: ResponsesApiResponse | null = null;
  const outputItems: ResponsesOutputItem[] = [];
  let streamedText = '';

  const publishOutputItems = (items: ResponsesOutputItem[]) => {
    for (const item of items) {
      const index = item.id ? outputItems.findIndex((existing) => existing.id === item.id) : -1;
      if (index >= 0) outputItems[index] = item;
      else outputItems.push(item);
    }
  };

  await readJsonServerSentEvents(
    response,
    async (event) => {
      const type = getStringValue(event, 'type');

      if (type === 'response.output_text.delta') {
        const delta = getStringValue(event, 'delta');
        if (delta) streamedText += delta;
        return;
      }

      const payload = getStreamResponsePayload(event);
      if (payload?.output) publishOutputItems(payload.output);
      if (type === 'response.completed' || isRecordValue(event.response)) {
        completedPayload = payload;
      }
    },
    [signal],
  );

  throwIfAborted(signal);
  const payload: ResponsesApiResponse | null = completedPayload
    ? {
        ...completedPayload,
        output:
          Array.isArray(completedPayload.output) && completedPayload.output.length > 0
            ? completedPayload.output
            : outputItems,
      }
    : outputItems.length
    ? { output: outputItems }
    : null;
  if (!payload) throw new Error('Agent stream did not return a completed response.');

  return {
    responseId: payload.id,
    text: extractText(payload) || streamedText.trim(),
    images: extractImages(payload),
    outputItems: payload.output ?? [],
    rawResponsePayload: JSON.stringify(payload, null, 2),
  };
}

function createTools(customTools?: Array<Record<string, unknown>>) {
  if (customTools) return customTools;
  return [
    {
      type: 'image_generation',
      action: 'auto',
      output_format: 'png',
      moderation: 'auto',
      quality: 'auto',
      partial_images: DEFAULT_STREAM_PARTIAL_IMAGES,
    },
    {
      type: 'function',
      name: 'generate_image_batch',
      description: 'Generate multiple independent images concurrently. Each item prompt may contain <ref id="..." /> tags.',
      parameters: {
        type: 'object',
        properties: {
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                prompt: { type: 'string' },
              },
              required: ['id', 'prompt'],
              additionalProperties: false,
            },
          },
        },
        required: ['images'],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      type: 'function',
      name: 'continue_generation',
      description: 'Ask the app to continue another generation round with the same context.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        required: ['reason'],
        additionalProperties: false,
      },
      strict: true,
    },
  ];
}

function createImageTool(config?: AgentImageToolConfig) {
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    action: config?.action ?? 'auto',
    output_format: config?.output_format ?? 'png',
    moderation: config?.moderation ?? 'auto',
    quality: config?.quality ?? 'auto',
    partial_images: config?.partial_images ?? DEFAULT_STREAM_PARTIAL_IMAGES,
  };

  if (config?.size) tool.size = config.size;
  if (config?.output_format !== 'png' && config?.output_compression != null) {
    tool.output_compression = config.output_compression;
  }

  return tool;
}

export async function callAgentResponsesApi(opts: {
  apiKey: string;
  input: unknown;
  signal?: AbortSignal;
  tools?: Array<Record<string, unknown>>;
  instructions?: string;
  imageTool?: AgentImageToolConfig;
}): Promise<AgentApiResult> {
  const { apiKey, input, signal, tools, instructions, imageTool } = opts;

  const response = await fetch(`${RESPONSES_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: AGENT_FIXED_MODEL,
      input,
      tools: tools ?? [createImageTool(imageTool), ...createTools().slice(1)],
      instructions: instructions ?? AGENT_INSTRUCTIONS,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  if (isEventStreamResponse(response)) {
    return await parseAgentStreamResponse(response, signal);
  }

  const payload = (await response.json()) as ResponsesApiResponse;
  return {
    responseId: payload.id,
    text: extractText(payload),
    images: extractImages(payload),
    outputItems: payload.output ?? [],
    rawResponsePayload: JSON.stringify(payload, null, 2),
  };
}

export async function callAgentConversationTitleApi(opts: {
  apiKey: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(`${RESPONSES_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: opts.apiKey.startsWith('Bearer ') ? opts.apiKey : `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: AGENT_FIXED_MODEL,
      instructions: 'Generate a concise conversation title. Output title text only.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Generate a short title for this conversation:\n${opts.prompt}`,
            },
          ],
        },
      ],
      max_output_tokens: 32,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  const payload = (await response.json()) as ResponsesApiResponse;
  const text = extractText(payload).trim();
  return text.slice(0, 24) || '新对话';
}

export function parseBatchImageCallArguments(args: string): BatchImageItem[] | null {
  try {
    const parsed = JSON.parse(args) as { images?: unknown };
    if (!Array.isArray(parsed.images)) return null;

    const items = parsed.images
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const prompt = typeof entry.prompt === 'string' ? entry.prompt.trim() : '';
        if (!prompt) return null;
        return {
          id:
            typeof entry.id === 'string' && entry.id.trim()
              ? entry.id.trim()
              : `image_${index + 1}`,
          prompt,
        };
      })
      .filter((item): item is BatchImageItem => Boolean(item));

    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

export async function callBatchImageSingle(opts: {
  apiKey: string;
  prompt: string;
  referenceImageDataUrls: string[];
  signal?: AbortSignal;
  imageTool?: AgentImageToolConfig;
}): Promise<AgentApiResultImage> {
  const guardedPrompt = `${PROMPT_REWRITE_GUARD_PREFIX}\n${opts.prompt}`;
  const input =
    opts.referenceImageDataUrls.length > 0
      ? [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: guardedPrompt },
              ...opts.referenceImageDataUrls.map((dataUrl) => ({
                type: 'input_image',
                image_url: dataUrl,
              })),
            ],
          },
        ]
      : guardedPrompt;

  const response = await fetch(`${RESPONSES_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: opts.apiKey.startsWith('Bearer ') ? opts.apiKey : `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: AGENT_FIXED_MODEL,
      input,
      tools: [createImageTool({
        ...opts.imageTool,
        action: opts.referenceImageDataUrls.length > 0 ? 'auto' : 'generate',
      })],
      tool_choice: 'required',
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  const result = isEventStreamResponse(response)
    ? await parseAgentStreamResponse(response, opts.signal)
    : {
        responseId: undefined,
        text: '',
        images: extractImages((await response.json()) as ResponsesApiResponse),
        outputItems: [],
      };

  const image = result.images[0];
  if (!image) {
    throw new Error(result.rawResponsePayload || result.text || 'Batch image call did not return an image.');
  }
  return image;
}
