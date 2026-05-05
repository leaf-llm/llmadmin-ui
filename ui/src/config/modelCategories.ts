import { ModelCategory } from '../types/models';

export const MODEL_CATEGORY_MAP: Record<string, ModelCategory> = {
  // OpenAI
  'gpt-4o': 'text',
  'gpt-4o-mini': 'text',
  'gpt-4-turbo': 'text',
  'gpt-4': 'text',
  'gpt-3.5-turbo': 'text',
  'dall-e-3': 'image',
  'dall-e-2': 'image',
  'tts-1': 'audio',
  'tts-1-hd': 'audio',
  'whisper-1': 'audio',
  // Anthropic
  'claude-3-5-sonnet': 'text',
  'claude-3-5-haiku': 'text',
  'claude-3-opus': 'text',
  'claude-3-sonnet': 'text',
  'claude-3-haiku': 'text',
  // Google
  'gemini-1.5-pro': 'text',
  'gemini-1.5-flash': 'text',
  'gemini-1.5-flash-8b': 'text',
  'gemini-2.0-flash': 'text',
  'gemini-2.0-flash-thinking-exp': 'text',
  'gemini-2.0-pro': 'text',
  'gemini-2.5-flash': 'text',
  'gemini-2.5-pro': 'text',
  'gemini-pro': 'text',
  'gemini-pro-vision': 'text',
  'imagen-3': 'image',
  'imagen-2': 'image',
  'imagen-3-generate': 'image',
  'veo-2': 'video',
  veo: 'video',
  'chirp-3-5': 'audio',
  'chirp-3': 'audio',
  // Azure OpenAI
  'gpt-4o-azure': 'text',
  'gpt-4-azure': 'text',
  'dall-e-3-azure': 'image',
  // Mistral
  'mistral-large': 'text',
  'mistral-small': 'text',
  'mistral-medium': 'text',
  'mistral-7b': 'text',
  'pixtral-12b': 'image',
  // Cohere
  'command-r-plus': 'text',
  'command-r': 'text',
  command: 'text',
  // AI21
  'jurassic-2-ultra': 'text',
  'jurassic-2-mid': 'text',
  // Stability AI
  'stable-diffusion-xl': 'image',
  'stable-diffusion-3': 'image',
  'stable-audio': 'audio',
  // Midjourney
  midjourney: 'image',
  // Runway
  'runway-gen-3': 'video',
  // Replicate
  'llama-3-70b': 'text',
  'llama-3-8b': 'text',
  'mixtral-8x7b': 'text',
  // Zhipu (智谱 GLM)
  'glm-4': 'text',
  'glm-4v': 'text',
  'glm-3': 'text',
  // Dashscope (通义千问 Qwen)
  'qwen-2-72b': 'text',
  'qwen-2-7b': 'text',
  'qwen-2-vl-72b': 'text',
  'qwen-2-vl-7b': 'text',
  'qwen-audio': 'audio',
  'qwen-vl': 'text',
  'wanx-2-1': 'image',
  // Moonshot (Kimi)
  'moonshot-v1-8k': 'text',
  'moonshot-v1-32k': 'text',
  'moonshot-v1-128k': 'text',
  // Minimax
  'minimax-01': 'text',
  'minimax-ablate': 'text',
  'minimax-video': 'video',
  'minimax-t2v': 'video',
  // Doubao (豆包)
  'doubao-pro-32k': 'text',
  'doubao-pro-128k': 'text',
  'doubao-pro-256k': 'text',
  'doubao-lite-32k': 'text',
  // DeepSeek
  'deepseek-chat': 'text',
  'deepseek-coder': 'text',
  // LM Studio / Ollama / LocalAI
  'ollama-llama3': 'text',
  'ollama-mistral': 'text',
  'ollama-codellama': 'text',
  'lmstudio-llama-3': 'text',
  'lmstudio-mistral': 'text',
  'localai-gpt-4': 'text',
};

export function getModelsByCategory(category: ModelCategory): string[] {
  return Object.entries(MODEL_CATEGORY_MAP)
    .filter(([, cat]) => cat === category)
    .map(([model]) => model);
}

const PROVIDER_MODEL_PREFIXES: Record<string, string[]> = {
  openai: ['gpt-', 'dall-e', 'tts', 'whisper'],
  anthropic: ['claude-'],
  google: ['gemini', 'imagen', 'veo', 'chirp'],
  zhipu: ['glm-'],
  dashscope: ['qwen-', 'wanx-'],
  moonshot: ['moonshot-'],
  minimax: ['minimax-'],
  doubao: ['doubao-'],
  deepseek: ['deepseek-'],
};

export function getModelsByProvider(
  provider: string
): Array<{ model: string; category: ModelCategory }> {
  const prefixes = PROVIDER_MODEL_PREFIXES[provider.toLowerCase()];
  if (!prefixes) return [];

  const results: Array<{ model: string; category: ModelCategory }> = [];
  for (const [model, category] of Object.entries(MODEL_CATEGORY_MAP)) {
    for (const prefix of prefixes) {
      if (model.toLowerCase().startsWith(prefix)) {
        results.push({ model, category });
        break;
      }
    }
  }
  return results;
}
