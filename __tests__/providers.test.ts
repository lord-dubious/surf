import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchAvailableModels, getProviderCapabilities, supportsNativeComputerUse } from '@/lib/providers';

describe('provider utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses OpenAI-compatible model payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4.1', name: 'GPT 4.1', owned_by: 'openai' }],
        }),
      }),
    );

    const models = await fetchAvailableModels('https://api.example.com/v1/', 'secret');

    expect(models).toEqual([{ id: 'gpt-4.1', name: 'GPT 4.1', ownedBy: 'openai' }]);
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/models', expect.any(Object));
  });

  it('uses google key query param endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'gemini-2.5-flash' }] }),
      }),
    );

    const models = await fetchAvailableModels('https://googleapis.com/v1beta', 'my-key', 'google');

    expect(models[0]?.id).toBe('gemini-2.5-flash');
    expect(fetch).toHaveBeenCalledWith(
      'https://googleapis.com/v1beta/models?key=my-key',
      expect.any(Object),
    );
  });

  it('returns safe defaults for custom capability checks', () => {
    const capabilities = getProviderCapabilities('custom', 'some-model');

    expect(capabilities.hasVision).toBe(true);
    expect(capabilities.hasToolCalling).toBe(true);
    expect(capabilities.hasStreaming).toBe(true);
    expect(capabilities.hasNativeComputerUse).toBe(supportsNativeComputerUse('some-model'));
  });
});
