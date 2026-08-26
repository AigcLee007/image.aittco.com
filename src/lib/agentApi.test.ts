import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { callAgentResponsesApi, parseBatchImageCallArguments } from './agentApi';

describe('callAgentResponsesApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'resp_1',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'done' }] },
        ],
      }),
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts to /api/responses without previous_response_id or store false', async () => {
    await callAgentResponsesApi({
      apiKey: 'sk-test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.model).toBe('gpt-5.5');
    expect(body.previous_response_id).toBeUndefined();
    expect(body.store).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('"previous_response_id"');
    expect(JSON.stringify(body)).not.toContain('"store":false');
  });
});

describe('parseBatchImageCallArguments', () => {
  it('extracts valid batch items', () => {
    expect(
      parseBatchImageCallArguments(
        JSON.stringify({
          images: [
            { id: 'a', prompt: 'one' },
            { prompt: 'two' },
          ],
        }),
      ),
    ).toEqual([
      { id: 'a', prompt: 'one' },
      { id: 'image_2', prompt: 'two' },
    ]);
  });
});
