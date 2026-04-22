export type ModelCategory = 'text' | 'image' | 'video' | 'audio' | 'mcp';

export const MODEL_CATEGORIES: ModelCategory[] = [
  'text',
  'image',
  'video',
  'audio',
  'mcp',
];

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  mcp: 'MCP',
};
