import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  History,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  Pin,
  Plus,
  Send,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import DropUpSelect from './DropUpSelect';
import { assetStorage } from '../src/services/assetStorage';
import { useAgentStore, getAgentReferencesForConversation } from '../src/store/agentStore';
import { getReferenceTag } from '../src/lib/agentImageReferences';
import { useSelectionStore } from '../src/store/selectionStore';
import { calculateGptImageSize } from '../src/utils/imageUtils';

interface AgentWorkspaceProps {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

function AgentAssetThumb({
  assetId,
  onClick,
  className = 'h-full w-full object-cover',
}: {
  assetId: string;
  onClick?: () => void;
  className?: string;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    assetStorage.getAssetUrl(assetId).then((nextUrl) => {
      if (!cancelled && nextUrl) setUrl(nextUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white/[0.04] text-white/30">
        <ImageIcon size={16} />
      </div>
    );
  }

  return <img src={url} alt="" className={className} onClick={onClick} />;
}

function AgentImageCard({
  assetId,
  roundIndex,
  imageIndex,
  prompt,
  onOpen,
}: {
  assetId: string;
  roundIndex: number;
  imageIndex: number;
  prompt: string;
  onOpen: () => void;
}) {
  const selection = useSelectionStore();
  const ratio =
    selection.aspectRatio === 'Custom'
      ? selection.customRatio || '1:1'
      : selection.aspectRatio === 'Smart'
        ? '1:1'
        : selection.aspectRatio;
  const actualSize = calculateGptImageSize(selection.imageSize, ratio);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-left transition hover:border-cyan-400/40 hover:bg-black/35"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <AgentAssetThumb assetId={assetId} onClick={onOpen} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{`第${roundIndex}轮图${imageIndex + 1}`}</div>
            <div className="mt-1 line-clamp-3 text-sm leading-6 text-white/72">{prompt}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-white/60 transition group-hover:bg-cyan-400/15 group-hover:text-cyan-200">
            <Maximize2 size={14} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/42">
          <span>gpt-5.5</span>
          <span>{actualSize}</span>
          <span>{selection.gptImageOutputFormat.toUpperCase()}</span>
        </div>
      </div>
    </button>
  );
}

function getRoundTaskCount(round: { status: string; outputImageIds: string[]; responseOutput?: Array<{ type?: string; output?: string }> }) {
  if (round.outputImageIds.length > 0) return round.outputImageIds.length;

  for (const item of round.responseOutput ?? []) {
    if (item.type !== 'function_call_output' || typeof item.output !== 'string') continue;
    try {
      const parsed = JSON.parse(item.output) as { images?: unknown[] };
      if (Array.isArray(parsed.images) && parsed.images.length > 0) return parsed.images.length;
    } catch {
      continue;
    }
  }

  return round.status === 'running' ? 1 : 0;
}

function AgentTaskPlaceholder({
  label,
  prompt,
  state,
}: {
  label: string;
  prompt: string;
  state: 'running' | 'done' | 'error';
}) {
  const isRunning = state === 'running';
  const accentClass =
    state === 'error'
      ? 'border-red-400/25 bg-red-500/[0.04]'
      : isRunning
        ? 'border-cyan-400/25 bg-cyan-500/[0.05]'
        : 'border-white/10 bg-black/20';

  return (
    <div className={`flex w-full gap-3 rounded-2xl border p-3 ${accentClass}`}>
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
        {isRunning ? (
          <Loader2 size={22} className="animate-spin text-cyan-300" />
        ) : (
          <ImageIcon size={18} className="text-white/35" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">{label}</div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
              state === 'error'
                ? 'bg-red-500/15 text-red-200'
                : isRunning
                  ? 'bg-cyan-500/15 text-cyan-200'
                  : 'bg-white/8 text-white/60'
            }`}
          >
            {state === 'error' ? 'error' : isRunning ? 'running' : 'done'}
          </span>
        </div>
        <div className="mt-2 line-clamp-3 text-sm leading-6 text-white/68">{prompt}</div>
      </div>
    </div>
  );
}

function AgentComposerParameters() {
  const {
    imageSize,
    aspectRatio,
    customRatio,
    gptImageQuality,
    setGptImageQuality,
    gptImageOutputFormat,
    setGptImageOutputFormat,
    gptImageOutputCompression,
    setGptImageOutputCompression,
    gptImageModeration,
    setGptImageModeration,
  } = useSelectionStore();

  const ratio =
    aspectRatio === 'Custom'
      ? customRatio || '1:1'
      : aspectRatio === 'Smart'
        ? '1:1'
        : aspectRatio;
  const actualSize = calculateGptImageSize(imageSize, ratio);

  return (
    <div className="grid grid-cols-3 gap-2 pt-3 sm:grid-cols-6">
      <div>
        <div className="mb-1 text-[10px] text-gray-500">尺寸</div>
        <div className="min-h-[40px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
          {actualSize}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] text-gray-500">质量</div>
        <DropUpSelect
          value={gptImageQuality}
          onChange={(value) => setGptImageQuality(value as typeof gptImageQuality)}
          options={[
            { value: 'auto', label: 'auto' },
            { value: 'low', label: 'low' },
            { value: 'medium', label: 'medium' },
            { value: 'high', label: 'high' },
          ]}
        />
      </div>
      <div>
        <div className="mb-1 text-[10px] text-gray-500">格式</div>
        <DropUpSelect
          value={gptImageOutputFormat}
          onChange={(value) => setGptImageOutputFormat(value as typeof gptImageOutputFormat)}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WEBP' },
          ]}
        />
      </div>
      <div>
        <div className="mb-1 text-[10px] text-gray-500">压缩率</div>
        <input
          type="number"
          min={0}
          max={100}
          disabled={gptImageOutputFormat === 'png'}
          value={gptImageOutputCompression ?? ''}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              setGptImageOutputCompression(null);
              return;
            }
            const parsed = Number(raw);
            if (!Number.isNaN(parsed)) {
              setGptImageOutputCompression(Math.max(0, Math.min(100, Math.round(parsed))));
            }
          }}
          placeholder="0-100"
          className="min-h-[40px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 disabled:opacity-40"
        />
      </div>
      <div>
        <div className="mb-1 text-[10px] text-gray-500">审核</div>
        <DropUpSelect
          value={gptImageModeration}
          onChange={(value) => setGptImageModeration(value as typeof gptImageModeration)}
          options={[
            { value: 'auto', label: 'auto' },
            { value: 'low', label: 'low' },
          ]}
        />
      </div>
      <div>
        <div className="mb-1 text-[10px] text-gray-500">数量</div>
        <div className="min-h-[40px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/50">
          auto
        </div>
      </div>
    </div>
  );
}

export default function AgentWorkspace({ onOpenSettings, onOpenHistory }: AgentWorkspaceProps) {
  const isMobile = useIsMobile();
  const {
    appMode,
    setAppMode,
    agentConversations,
    activeConversationId,
    agentWindow,
    setAgentWindow,
    createConversation,
    setActiveConversationId,
    deleteConversation,
    renameConversation,
    submitAgentMessage,
    stopAgentResponse,
    isResponding,
    error,
  } = useAgentStore();
  const openLightbox = useSelectionStore((s) => s.openLightbox);

  const panelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: agentWindow.x, y: agentWindow.y });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const conversation = useMemo(
    () => agentConversations.find((item) => item.id === activeConversationId) ?? null,
    [agentConversations, activeConversationId],
  );
  const references = useMemo(() => getAgentReferencesForConversation(conversation), [conversation]);
  const rounds = useMemo(() => {
    if (!conversation) return [];
    return conversation.rounds.map((round) => ({
      round,
      userMessage: conversation.messages.find((message) => message.id === round.id && message.role === 'user') ?? null,
      assistantMessage: conversation.messages.find((message) => message.id === `${round.id}:assistant` && message.role === 'assistant') ?? null,
    }));
  }, [conversation]);

  useEffect(() => {
    if (appMode !== 'agent') return;
    if (activeConversationId) return;
    createConversation();
  }, [appMode, activeConversationId, createConversation]);

  useEffect(() => {
    if (isMobile) return;
    const panel = panelRef.current;
    if (!panel) return;
    posRef.current = { x: agentWindow.x, y: agentWindow.y };
    panel.style.transform = `translate3d(${agentWindow.x}px, ${agentWindow.y}px, 0)`;
  }, [isMobile, agentWindow.x, agentWindow.y]);

  const updatePanelTransform = useCallback((x: number, y: number) => {
    if (!panelRef.current) return;
    panelRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (isMobile) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX - posRef.current.x,
      y: clientY - posRef.current.y,
    };
    document.body.style.userSelect = 'none';
  }, [isMobile]);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      let nextX = event.clientX - dragStartRef.current.x;
      let nextY = event.clientY - dragStartRef.current.y;
      nextX = Math.max(10, Math.min(nextX, window.innerWidth - panel.offsetWidth - 10));
      nextY = Math.max(10, Math.min(nextY, window.innerHeight - panel.offsetHeight - 10));
      posRef.current = { x: nextX, y: nextY };
      updatePanelTransform(nextX, nextY);
      setAgentWindow({ x: nextX, y: nextY });
    };

    const onMouseUp = () => endDrag();

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, endDrag, updatePanelTransform]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );
    setAttachedImages((current) => [...current, ...next.filter(Boolean)]);
  };

  const handleSubmit = async () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt('');
    setAttachedImages([]);
    await submitAgentMessage(text, attachedImages);
  };

  if (appMode !== 'agent') return null;

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '88dvh',
        zIndex: 55,
      }
    : {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '360px',
        zIndex: 45,
        cursor: isDragging ? 'grabbing' : 'default',
      };

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className={`bg-[#121212]/95 backdrop-blur-xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.6)] flex flex-col ${
        isMobile ? 'rounded-t-[24px] overflow-hidden' : 'rounded-[28px] overflow-hidden'
      }`}
    >
      <div
        className="border-b border-white/5 bg-white/5 backdrop-blur-md select-none"
        onMouseDown={(e) => {
          if (isMobile) return;
          handleDragStart(e.clientX, e.clientY);
        }}
      >
        <div className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors">
          <div className="w-16 h-1.5 rounded-full bg-white/20"></div>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <MessageSquare size={18} className="text-cyan-300" />
              AIGC Agent
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAgentWindow({ pinned: !agentWindow.pinned })}
                className={`p-1.5 rounded-full transition-colors ${agentWindow.pinned ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title={agentWindow.pinned ? '取消固定' : '固定面板'}
              >
                <Pin size={14} className={agentWindow.pinned ? 'fill-current' : ''} />
              </button>
              <button
                onClick={() => setAgentWindow({ minimized: !agentWindow.minimized })}
                className="text-gray-400 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition-colors"
                title={agentWindow.minimized ? '展开' : '最小化'}
              >
                {agentWindow.minimized ? <Maximize2 size={14} /> : <Minus size={14} />}
              </button>
              <button
                onClick={() => setAppMode('gallery')}
                className="text-gray-400 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition-colors"
                title="关闭 Agent"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {!agentWindow.minimized && (
        <div className={`flex flex-col gap-4 overflow-y-auto p-4 ${isMobile ? 'max-h-[calc(88dvh-84px)]' : 'max-h-[82vh]'}`}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAgentWindow({ showConversationList: !agentWindow.showConversationList })}
                className="flex items-center gap-2 text-xs font-medium text-gray-300"
              >
                <span>对话</span>
                {agentWindow.showConversationList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const id = createConversation();
                    setActiveConversationId(id);
                  }}
                  className="rounded-lg bg-white/6 p-2 text-gray-300 hover:bg-white/10 hover:text-white"
                  title="新建对话"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="rounded-lg bg-white/6 p-2 text-gray-300 hover:bg-white/10 hover:text-white"
                  title="历史"
                >
                  <History size={14} />
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="rounded-lg bg-white/6 p-2 text-gray-300 hover:bg-white/10 hover:text-white"
                  title="设置"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>

            {agentWindow.showConversationList && (
              <div className="mt-3 space-y-2">
                {agentConversations.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border px-3 py-2 ${item.id === activeConversationId ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-white/10 bg-white/[0.03]'}`}
                  >
                    <button type="button" onClick={() => setActiveConversationId(item.id)} className="w-full text-left">
                      <div className="line-clamp-1 text-sm text-white">{item.title}</div>
                      <div className="mt-1 text-[11px] text-white/40">{item.rounds.length} 轮对话</div>
                    </button>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = window.prompt('重命名对话', item.title);
                          if (next?.trim()) renameConversation(item.id, next.trim());
                        }}
                        className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10"
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConversation(item.id)}
                        className="rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAgentWindow({ showReferences: !agentWindow.showReferences })}
                className="flex items-center gap-2 text-xs font-medium text-gray-300"
              >
                <span>可用引用</span>
                {agentWindow.showReferences ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <span className="text-[11px] text-white/35">{references.length}</span>
            </div>
            {agentWindow.showReferences && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {references.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-[11px] text-white/35">
                    生成后可插入 `<ref />`
                  </div>
                )}
                {references.map((ref) => (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => setPrompt((current) => `${current}${current ? ' ' : ''}${getReferenceTag(ref.id)}`)}
                    className="w-24 shrink-0 rounded-xl border border-white/10 bg-black/25 p-2 text-left hover:border-cyan-400/35"
                  >
                    <div className="h-14 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                      {ref.assetId ? (
                        <AgentAssetThumb assetId={ref.assetId} />
                      ) : ref.dataUrl ? (
                        <img src={ref.dataUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/30">
                          <ImageIcon size={14} />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 line-clamp-1 text-[11px] text-white/85">{ref.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-3 text-xs font-medium text-gray-300">Agent 过程</div>
            <div className="max-h-[26vh] space-y-4 overflow-y-auto pr-1">
              {rounds.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/40">
                  这里会显示每一轮的生成过程和结果卡片
                </div>
              )}
              {rounds.map(({ round, userMessage, assistantMessage }) => (
                <div key={round.id} className="space-y-3">
                  {userMessage && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">User</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/88">{userMessage.content}</div>
                    </div>
                  )}

                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Agent</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/88">
                      {assistantMessage?.content || (round.status === 'running' ? '正在生成中...' : '已完成')}
                    </div>

                    {round.status === 'running' && (
                      <div className="mt-3 space-y-2">
                        {Array.from({ length: getRoundTaskCount(round) }).map((_, index) => (
                          <AgentTaskPlaceholder
                            key={`${round.id}:running:${index}`}
                            label={`第${round.index}轮任务${index + 1}`}
                            prompt={round.prompt}
                            state="running"
                          />
                        ))}
                      </div>
                    )}

                    {assistantMessage && assistantMessage.imageIds.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {assistantMessage.imageIds.map((assetId, index) => (
                          <AgentImageCard
                            key={assetId}
                            assetId={assetId}
                            roundIndex={round.index}
                            imageIndex={index}
                            prompt={round.prompt}
                            onOpen={() => assetStorage.getAssetUrl(assetId).then((url) => url && openLightbox(url))}
                          />
                        ))}
                      </div>
                    )}

                    {round.status === 'error' && round.error && (
                      <div className="mt-3 space-y-2">
                        {Array.from({ length: Math.max(1, getRoundTaskCount(round)) }).map((_, index) => (
                          <AgentTaskPlaceholder
                            key={`${round.id}:error:${index}`}
                            label={`第${round.index}轮任务${index + 1}`}
                            prompt={round.prompt}
                            state="error"
                          />
                        ))}
                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                          {round.error}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachedImages.map((src, index) => (
                <div key={`${src.slice(0, 24)}-${index}`} className="relative">
                  <img src={src} alt="" className="h-14 w-14 rounded-xl border border-white/10 object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachedImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="absolute -right-2 -top-2 rounded-full bg-black/85 p-1 text-white shadow-lg"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想生成的内容，支持继续细化、引用历史图、追加参考图。"
              className="min-h-28 w-full resize-none bg-transparent text-sm leading-7 text-white outline-none placeholder:text-white/30"
            />

            <AgentComposerParameters />

            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="cursor-pointer rounded-xl bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleUpload(e.target.files)}
                />
                <span className="flex items-center gap-2">
                  <Upload size={15} /> 上传参考图
                </span>
              </label>

              {isResponding ? (
                <button
                  type="button"
                  onClick={stopAgentResponse}
                  className="rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-100 hover:bg-red-500/30"
                >
                  <span className="flex items-center gap-2">
                    <Square size={14} /> 停止
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-300"
                >
                  <span className="flex items-center gap-2">
                    <Send size={14} /> 发送
                  </span>
                </button>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
