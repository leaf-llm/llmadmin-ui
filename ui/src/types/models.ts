export type ModelCategory = 'text' | 'image' | 'video' | 'audio' | 'mcp';

export const MODEL_CATEGORIES: ModelCategory[] = [
  'text',
  'image',
  'video',
  'audio',
  'mcp',
];

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  audio: '音频',
  mcp: 'MCP',
};
