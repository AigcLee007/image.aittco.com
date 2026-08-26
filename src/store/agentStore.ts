import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { AgentConversation, AgentMessage, AgentRound, AgentImageReference, AgentWindowState, AppMode, NodeData, ResponsesOutputItem } from '../../types';
import { assetStorage } from '../services/assetStorage';
import { useCanvasStore } from './canvasStore';
import { useHistoryStore } from './historyStore';
import { callAgentConversationTitleApi, callAgentResponsesApi, callBatchImageSingle, parseBatchImageCallArguments, type AgentApiResultImage, type AgentImageToolConfig } from '../lib/agentApi';
import { extractReferenceIds, getAvailableReferences, replaceAgentPromptImageReferencesForApi, resolveReferenceIdsToAssetIds } from '../lib/agentImageReferences';
import { useSelectionStore } from './selectionStore';
import { calculateGptImageSize } from '../utils/imageUtils';

type AgentStoreState = {
  appMode: AppMode;
  agentConversations: AgentConversation[];
  activeConversationId: string | null;
  agentWindow: AgentWindowState;
  isResponding: boolean;
  error: string | null;
  setAppMode: (mode: AppMode) => void;
  setAgentWindow: (patch: Partial<AgentWindowState>) => void;
  createConversation: () => string;
  setActiveConversationId: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  submitAgentMessage: (prompt: string, attachedDataUrls?: string[]) => Promise<void>;
  stopAgentResponse: () => void;
};

const agentControllers = new Map<string, AbortController>();
const DEFAULT_AGENT_WINDOW: AgentWindowState = {
  x: 20,
  y: 20,
  pinned: true,
  minimized: false,
  showConversationList: true,
  showReferences: true,
};

function createEmptyConversation(): AgentConversation {
  const now = Date.now();
  return {
    id: uuidv4(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    rounds: [],
    messages: [],
  };
}

function getConversation(store: AgentStoreState) {
  const active = store.agentConversations.find((item) => item.id === store.activeConversationId);
  return active ?? null;
}

async function materializeAssetDataUrls(assetIds: string[]) {
  const values = await Promise.all(assetIds.map((assetId) => assetStorage.getAssetDataUrl(assetId)));
  return values.filter((value): value is string => Boolean(value));
}

async function buildConversationInput(conversation: AgentConversation, currentPrompt: string, currentInputImageDataUrls: string[]) {
  const input: Array<Record<string, unknown>> = [];

  for (const round of conversation.rounds) {
    const userMessage = conversation.messages.find((message) => message.id === round.id && message.role === 'user');
    if (userMessage) {
      const content: Array<Record<string, string>> = [];
      content.push({ type: 'input_text', text: userMessage.content });
      const inputImages = await materializeAssetDataUrls(round.inputImageIds);
      inputImages.forEach((imageUrl) => {
        content.push({ type: 'input_image', image_url: imageUrl });
      });
      input.push({ role: 'user', content });
    }

    const assistantMessage = conversation.messages.find((message) => message.id === `${round.id}:assistant`);
    if (assistantMessage) {
      input.push({
        role: 'assistant',
        content: [{ type: 'input_text', text: assistantMessage.content }],
      });
    }

    const generatedImages = await materializeAssetDataUrls(round.outputImageIds);
    if (generatedImages.length > 0) {
      const generatedContent: Array<Record<string, string>> = [];
      generatedContent.push({
        type: 'input_text',
        text: generatedImages
          .map((_, index) => `历史生成图引用：<ref id="round-${round.index}-image-${index + 1}" />`)
          .join('\n'),
      });
      generatedImages.forEach((imageUrl) => {
        generatedContent.push({ type: 'input_image', image_url: imageUrl });
      });
      input.push({ role: 'user', content: generatedContent });
    }
  }

  const content: Array<Record<string, string>> = [];
  const currentRefText =
    currentInputImageDataUrls.length > 0
      ? currentInputImageDataUrls
          .map((_, index) => `当前参考图：<ref id="round-${conversation.rounds.length + 1}-reference-${index + 1}" />`)
          .join('\n')
      : '';
  content.push({
    type: 'input_text',
    text: [currentRefText, currentPrompt].filter(Boolean).join('\n'),
  });
  currentInputImageDataUrls.forEach((imageUrl) => {
    content.push({ type: 'input_image', image_url: imageUrl });
  });
  input.push({ role: 'user', content });

  return input;
}

async function createCanvasNodesFromImages(images: AgentApiResultImage[], prompt: string): Promise<string[]> {
  if (images.length === 0) return [];

  const canvasStore = useCanvasStore.getState();
  const historyStore = useHistoryStore.getState();
  const currentNodes = canvasStore.nodes;
  const createdIds: string[] = [];
  let baseX = 360;
  let baseY = 120;

  if (currentNodes.length > 0) {
    const maxX = Math.max(...currentNodes.map((node) => node.x + node.width));
    baseX = maxX + 32;
    baseY = currentNodes[0]?.y ?? 120;
  }

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    let assetId: string | undefined;
    try {
      const sourceUrl = image.dataUrl.startsWith('http')
        ? `/api/proxy/image?url=${encodeURIComponent(image.dataUrl)}`
        : image.dataUrl;
      const response = await fetch(sourceUrl);
      if (response.ok) {
        assetId = await assetStorage.storeBlob(await response.blob());
      }
    } catch {
      assetId = image.dataUrl.startsWith('data:image')
        ? await assetStorage.storeDataUrl(image.dataUrl)
        : undefined;
    }
    const nodeId = canvasStore.generateId();
    const node: NodeData = {
      id: nodeId,
      type: 'IMAGE',
      x: baseX + index * 32,
      y: baseY + index * 32,
      width: 512,
      height: 512,
      opacity: 1,
      locked: false,
      loading: false,
      src: image.dataUrl,
      assetId,
      prompt,
      history: [],
      historyIndex: 0,
    };
    canvasStore.addNode(node, true);
    historyStore.addLog(prompt, image.dataUrl, assetId, 'IMAGE');
    createdIds.push(assetId ?? nodeId);
  }

  return createdIds;
}

async function getReferencedDataUrls(
  conversation: AgentConversation,
  prompt: string,
  currentRoundImageDataUrls: string[] = [],
) {
  const referenceIds = extractReferenceIds(prompt);
  const currentRoundIndex = conversation.rounds.length + 1;
  const currentRoundRefs = referenceIds
    .map((id) => {
      const match = id.match(new RegExp(`^round-${currentRoundIndex}-reference-(\\d+)$`));
      if (!match) return null;
      const imageIndex = Number(match[1]) - 1;
      return currentRoundImageDataUrls[imageIndex] ?? null;
    })
    .filter((item): item is string => Boolean(item));

  const historicalIds = referenceIds.filter(
    (id) => !id.startsWith(`round-${currentRoundIndex}-reference-`),
  );
  const assetIds = resolveReferenceIdsToAssetIds(historicalIds, conversation);
  const historicalRefs = await materializeAssetDataUrls(assetIds);
  return [...currentRoundRefs, ...historicalRefs];
}

function isLikelyTextOnlyPrompt(prompt: string) {
  const value = prompt.trim();
  if (!value) return true;
  if (/[?？]$/.test(value)) return true;
  return /^(什么|為什麼|为什么|how|what|why|解释|说明|介绍)/i.test(value);
}

function getAgentImageToolConfig(): AgentImageToolConfig {
  const selection = useSelectionStore.getState();
  const ratio =
    selection.aspectRatio === 'Custom'
      ? selection.customRatio || '1:1'
      : selection.aspectRatio === 'Smart'
        ? '1:1'
        : selection.aspectRatio;

  return {
    size: calculateGptImageSize(selection.imageSize, ratio),
    output_format: selection.gptImageOutputFormat,
    output_compression: selection.gptImageOutputCompression,
    moderation: selection.gptImageModeration,
    quality: selection.gptImageQuality,
  };
}

async function runAgentRound(conversation: AgentConversation, prompt: string, attachedDataUrls: string[], signal: AbortSignal) {
  const apiKey = useSelectionStore.getState().apiKey;
  if (!apiKey) throw new Error('请先在设置中填写 API Key。');

  const roundIndex = conversation.rounds.length + 1;
  const normalizedPrompt = replaceAgentPromptImageReferencesForApi(prompt, conversation);
  const input = await buildConversationInput(conversation, normalizedPrompt, attachedDataUrls);
  const imageTool = getAgentImageToolConfig();
  const firstPass = await callAgentResponsesApi({ apiKey, input, signal, imageTool });

  let finalText = firstPass.text;
  let finalImages = [...firstPass.images];
  let finalOutputItems: ResponsesOutputItem[] = [...firstPass.outputItems];

  const batchCall = firstPass.outputItems.find(
    (item) => item.type === 'function_call' && item.name === 'generate_image_batch' && typeof item.arguments === 'string',
  );

  if (batchCall?.arguments) {
    const batchItems = parseBatchImageCallArguments(batchCall.arguments) ?? [];
    const batchResults = await Promise.all(
      batchItems.map(async (item) => {
        const batchPrompt = replaceAgentPromptImageReferencesForApi(item.prompt, conversation);
        const refs = await getReferencedDataUrls(conversation, batchPrompt, attachedDataUrls);
        return await callBatchImageSingle({
          apiKey,
          prompt: batchPrompt,
          referenceImageDataUrls: refs,
          signal,
          imageTool,
        });
      }),
    );

    finalImages = [...finalImages, ...batchResults];
    if (!finalText) {
      finalText = `已完成 ${batchResults.length} 张图片生成。`;
    }
    finalOutputItems = [
      ...finalOutputItems,
      {
        type: 'function_call_output',
        call_id: batchCall.call_id,
        output: JSON.stringify({
          images: batchItems.map((item, index) => ({
            id: item.id,
            status: batchResults[index] ? 'done' : 'error',
          })),
        }),
      },
    ];
  }

  const continueCall = firstPass.outputItems.find(
    (item) => item.type === 'function_call' && item.name === 'continue_generation',
  );

  if (continueCall) {
    const continuePrompt = `${normalizedPrompt}\n\n请继续完成同一个任务。`;
    const secondPass = await callAgentResponsesApi({
      apiKey,
      input: await buildConversationInput(conversation, continuePrompt, attachedDataUrls),
      signal,
      imageTool,
    });
    finalText = [finalText, secondPass.text].filter(Boolean).join('\n\n').trim();
    finalImages = [...finalImages, ...secondPass.images];
    finalOutputItems = [...finalOutputItems, ...secondPass.outputItems];
  }

  if (finalImages.length === 0 && !isLikelyTextOnlyPrompt(prompt)) {
    const fallbackRefs = await getReferencedDataUrls(conversation, normalizedPrompt, attachedDataUrls);
    const fallbackImage = await callBatchImageSingle({
      apiKey,
      prompt: normalizedPrompt,
      referenceImageDataUrls: fallbackRefs,
      signal,
      imageTool,
    });
    finalImages = [fallbackImage];
    finalText = finalText || '已生成图片。';
  }

  const attachedAssetIds: string[] = [];
  for (const dataUrl of attachedDataUrls) {
    attachedAssetIds.push(await assetStorage.storeDataUrl(dataUrl));
  }

  const outputImageIds = await createCanvasNodesFromImages(finalImages, prompt);
  const roundId = uuidv4();
  const userMessage: AgentMessage = {
    id: roundId,
    role: 'user',
    content: prompt,
    createdAt: Date.now(),
    imageIds: attachedAssetIds,
  };
  const assistantMessage: AgentMessage = {
    id: `${roundId}:assistant`,
    role: 'assistant',
    content: finalText || '已完成。',
    createdAt: Date.now(),
    imageIds: outputImageIds,
  };
  const round: AgentRound = {
    id: roundId,
    index: roundIndex,
    prompt,
    status: 'done',
    createdAt: Date.now(),
    finishedAt: Date.now(),
    error: null,
    inputImageIds: attachedAssetIds,
    outputImageIds,
    responseId: firstPass.responseId,
    responseOutput: finalOutputItems,
  };

  return { round, userMessage, assistantMessage };
}

export const useAgentStore = create<AgentStoreState>()(
  persist(
    (set, get) => ({
      appMode: 'gallery',
      agentConversations: [],
      activeConversationId: null,
      agentWindow: DEFAULT_AGENT_WINDOW,
      isResponding: false,
      error: null,
      setAppMode: (mode) => set({ appMode: mode }),
      setAgentWindow: (patch) =>
        set((state) => ({
          agentWindow: { ...state.agentWindow, ...patch },
        })),
      createConversation: () => {
        const conversation = createEmptyConversation();
        set((state) => ({
          agentConversations: [conversation, ...state.agentConversations],
          activeConversationId: conversation.id,
        }));
        return conversation.id;
      },
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      deleteConversation: (id) =>
        set((state) => {
          const next = state.agentConversations.filter((item) => item.id !== id);
          return {
            agentConversations: next,
            activeConversationId:
              state.activeConversationId === id ? next[0]?.id ?? null : state.activeConversationId,
          };
        }),
      renameConversation: (id, title) =>
        set((state) => ({
          agentConversations: state.agentConversations.map((item) =>
            item.id === id ? { ...item, title, updatedAt: Date.now() } : item,
          ),
        })),
      submitAgentMessage: async (prompt, attachedDataUrls = []) => {
        const state = get();
        const conversationId = state.activeConversationId ?? state.createConversation();
        const conversation =
          get().agentConversations.find((item) => item.id === conversationId) ?? createEmptyConversation();
        const controller = new AbortController();
        agentControllers.set(conversationId, controller);
        const now = Date.now();
        const provisionalRoundId = uuidv4();
        const provisionalRound: AgentRound = {
          id: provisionalRoundId,
          index: conversation.rounds.length + 1,
          prompt,
          status: 'running',
          createdAt: now,
          finishedAt: null,
          error: null,
          inputImageIds: [],
          outputImageIds: [],
          responseOutput: [],
        };
        const provisionalUserMessage: AgentMessage = {
          id: provisionalRoundId,
          role: 'user',
          content: prompt,
          createdAt: now,
          imageIds: [],
        };
        const provisionalAssistantMessage: AgentMessage = {
          id: `${provisionalRoundId}:assistant`,
          role: 'assistant',
          content: '正在生成中...',
          createdAt: now,
          imageIds: [],
        };

        set((current) => ({
          isResponding: true,
          error: null,
          agentConversations: current.agentConversations.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  updatedAt: now,
                  rounds: [...item.rounds, provisionalRound],
                  messages: [...item.messages, provisionalUserMessage, provisionalAssistantMessage],
                }
              : item,
          ),
        }));

        try {
          if (conversation.rounds.length === 0) {
            const apiKey = useSelectionStore.getState().apiKey;
            if (apiKey) {
              try {
                const title = await callAgentConversationTitleApi({ apiKey, prompt, signal: controller.signal });
                get().renameConversation(conversationId, title);
              } catch (titleError) {
                console.warn('Agent title generation failed:', titleError);
              }
            }
          }

          const result = await runAgentRound(conversation, prompt, attachedDataUrls, controller.signal);

          set((current) => ({
            agentConversations: current.agentConversations.map((item) =>
              item.id === conversationId
                ? {
                    ...item,
                    updatedAt: Date.now(),
                    rounds: item.rounds.map((round) =>
                      round.id === provisionalRoundId ? result.round : round,
                    ),
                    messages: item.messages.map((message) => {
                      if (message.id === provisionalRoundId) return result.userMessage;
                      if (message.id === `${provisionalRoundId}:assistant`) return result.assistantMessage;
                      return message;
                    }),
                  }
                : item,
            ),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set((current) => ({
            error: message,
            agentConversations: current.agentConversations.map((item) =>
              item.id === conversationId
                ? {
                    ...item,
                    updatedAt: Date.now(),
                    rounds: item.rounds.map((round) =>
                      round.id === provisionalRoundId
                        ? {
                            ...round,
                            status: 'error',
                            error: message,
                            finishedAt: Date.now(),
                          }
                        : round,
                    ),
                    messages: item.messages.map((messageItem) =>
                      messageItem.id === `${provisionalRoundId}:assistant`
                        ? {
                            ...messageItem,
                            content: message,
                          }
                        : messageItem,
                    ),
                  }
                : item,
            ),
          }));
        } finally {
          agentControllers.delete(conversationId);
          set({ isResponding: false });
        }
      },
      stopAgentResponse: () => {
        const conversationId = get().activeConversationId;
        if (!conversationId) return;
        const controller = agentControllers.get(conversationId);
        controller?.abort();
        agentControllers.delete(conversationId);
        set({ isResponding: false, error: '已停止生成。' });
      },
    }),
    {
      name: 'agent-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        appMode: state.appMode,
        agentConversations: state.agentConversations,
        activeConversationId: state.activeConversationId,
        agentWindow: state.agentWindow,
      }),
    },
  ),
);

export function getAgentReferencesForConversation(conversation: AgentConversation | null): AgentImageReference[] {
  return getAvailableReferences(conversation);
}
