import { describe, test, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const GATEWAY_URL = 'http://localhost:8700';
const CHAT_COMPLETIONS_URL = `${GATEWAY_URL}/v1/chat/completions`;
const MESSAGES_URL = `${GATEWAY_URL}/v1/messages`;

interface ProviderConfig {
  id: string;
  apiKey: string;
  baseUrl?: string;
  lastSyncedAt?: string;
  remark?: string;
}

interface ConfUiConfig {
  providers: {
    [key: string]: ProviderConfig[];
  };
  text?: { routing: unknown[]; userConfig: unknown };
}

const confPath = path.join(process.cwd(), 'conf.ui.json');
let confUi: ConfUiConfig;

try {
  const content = fs.readFileSync(confPath, 'utf-8');
  confUi = JSON.parse(content);
} catch {
  confUi = { providers: {} };
}

const chineseProviders = [
  { name: 'zhipu', model: 'glm-4.7' },
  { name: 'dashscope', model: 'qwen3.6-plus' },
  { name: 'minimax', model: 'MiniMax-M2.7' },
  { name: 'doubao', model: 'doubao-seed-2.0-lite' },
  { name: 'deepseek', model: 'deepseek-v4-flash' },
] as const;

const createHeaders = (provider: string, apiKey: string, baseUrl?: string) => {
  const config: Record<string, unknown> = {
    provider,
    api_key: apiKey,
  };
  if (baseUrl) {
    config.customHost = baseUrl;
  }
  return {
    'x-portkey-config': JSON.stringify(config),
    'Content-Type': 'application/json',
  };
};

const chatCompletionRequest = (model: string) =>
  JSON.stringify({
    model,
    max_tokens: 20,
    stream: false,
    messages: [{ role: 'user', content: 'Hello' }],
  });

const messagesRequest = (model: string) =>
  JSON.stringify({
    model,
    max_tokens: 20,
    messages: [{ role: 'user', content: 'Hello' }],
  });

describe('Chinese Providers Forwarding Tests', () => {
  for (const provider of chineseProviders) {
    const configs = confUi.providers[provider.name];

    if (!configs || configs.length === 0) {
      test.skip(`${provider.name} - no config found in conf.ui.json`, () => {});
      continue;
    }

    const config = configs[0];

    describe(`${provider.name} (model: ${provider.model}, config: ${config.remark || config.id})`, () => {
      test(`/v1/chat/completions - should return 200`, async () => {
        const res = await fetch(CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: createHeaders(provider.name, config.apiKey, config.baseUrl),
          body: chatCompletionRequest(provider.model),
        });
        expect(res.status).toEqual(200);
        const json = await res.json();
        expect(json).toHaveProperty('choices');
      });

      test(`/v1/messages - should return 200`, async () => {
        const res = await fetch(MESSAGES_URL, {
          method: 'POST',
          headers: createHeaders(
            provider.name,
            config.apiKey,
            config.baseUrl
          ),
          body: messagesRequest(provider.model),
        });
        expect(res.status).toEqual(200);
        const json = await res.json();
        expect(json).toHaveProperty('content');
      });
    });
  }
});
