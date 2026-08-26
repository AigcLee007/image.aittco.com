
export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  size: number;
  color: string;
}

export type NodeType = 'IMAGE' | 'VIDEO';

export interface HistoryItem {
  src: string;
  prompt?: string;
}

export interface NodeData {
  id: string;
  type: NodeType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  locked?: boolean;

  // Image/Video specific
  src?: string; // Video URL for video nodes
  assetId?: string; // ID for Blob storage (IndexedDB)
  prompt?: string;

  // Video specific
  videoModel?: string;
  videoAspectRatio?: string; // "16:9" | "9:16"
  videoHd?: boolean;
  videoDuration?: string; // "10" | "15" | "25"

  // Loading / Error States for async generation
  taskId?: string; // Task ID for polling
  loading?: boolean;
  progress?: number; // Real-time generation progress (0-100)
  error?: boolean;
  errorMessage?: string;

  // Grouping
  groupId?: string;

  // Selection / Dragging
  dragging?: boolean;
  
  // Inpainting Masks (Strokes)
  maskStrokes?: Stroke[];
  
  // Image History
  history?: HistoryItem[];
  historyIndex?: number;
}

export enum ToolMode {
  PAN = 'PAN',
  SELECT = 'SELECT',
  GENERATE = 'GENERATE',
  VIDEO = 'VIDEO',
  INPAINT = 'INPAINT',
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR',
}

export interface CanvasState {
  offset: Point;
  scale: number;
}

export type AppMode = 'gallery' | 'agent';

export interface AgentImageReference {
  id: string;
  assetId?: string;
  dataUrl?: string;
  label: string;
  source: 'upload' | 'generated';
  roundId?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  imageIds: string[];
}

export type AgentRoundStatus = 'running' | 'done' | 'error';

export interface AgentRound {
  id: string;
  index: number;
  prompt: string;
  status: AgentRoundStatus;
  createdAt: number;
  finishedAt: number | null;
  error: string | null;
  inputImageIds: string[];
  outputImageIds: string[];
  responseId?: string;
  responseOutput?: ResponsesOutputItem[];
}

export interface AgentConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rounds: AgentRound[];
  messages: AgentMessage[];
}

export interface AgentWindowState {
  x: number;
  y: number;
  pinned: boolean;
  minimized: boolean;
  showConversationList: boolean;
  showReferences: boolean;
}

export interface ResponsesOutputTextAnnotation {
  type?: string;
  start_index?: number;
  end_index?: number;
  url?: string;
  title?: string;
}

export interface ResponsesOutputContentItem {
  type?: string;
  text?: string;
  annotations?: ResponsesOutputTextAnnotation[];
}

export interface ResponsesOutputItem {
  id?: string;
  type?: string;
  status?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
  content?: ResponsesOutputContentItem[];
  result?:
    | string
    | {
        b64_json?: string;
        base64?: string;
        image?: string;
        data?: string;
      };
  image_url?: string;
  url?: string;
}

export interface ResponsesApiResponse {
  id?: string;
  output?: ResponsesOutputItem[];
}
