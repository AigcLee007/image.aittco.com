import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createTaskPoller } = require('./taskPolling.cjs');
const missing = () => Object.assign(new Error('not found'), { response: { status: 404 } });

describe('task polling recovery', () => {
  it('recovers the line-one endpoint after the protocol map is lost', async () => {
    const protocols = new Map();
    const poll = createTaskPoller({ protocols });
    const response = { status: 200, data: { status: 'PROCESSING' } };
    const request = vi.fn().mockRejectedValueOnce(missing()).mockResolvedValue(response);
    await expect(poll({ taskId: 'task_one', userKey: 'key-a', request })).resolves.toMatchObject({ response });
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/v1/images/tasks/task_one', '/v1/tasks/task_one']);
    request.mockClear();
    await poll({ taskId: 'task_one', userKey: 'key-a', request });
    expect(request.mock.calls).toEqual([['/v1/tasks/task_one']]);
  });

  it('stops old clients after three missing polls, isolates credentials and expires the pause', async () => {
    let clock = 0;
    const poll = createTaskPoller({ protocols: new Map(), now: () => clock });
    const request = vi.fn().mockRejectedValue(missing());
    const args = { taskId: 'old', userKey: 'key-a', request };
    await expect(poll(args)).rejects.toMatchObject({ response: { status: 404 } });
    await expect(poll(args)).rejects.toMatchObject({ response: { status: 404 } });
    const result = await poll(args);
    expect(result.response).toMatchObject({ status: 200, data: { status: 'FAILED', task_id: 'old', error: { code: 'TASK_POLL_UNAVAILABLE' } } });
    expect(request).toHaveBeenCalledTimes(6);
    await poll(args);
    expect(request).toHaveBeenCalledTimes(6);
    await expect(poll({ ...args, userKey: 'key-b' })).rejects.toMatchObject({ response: { status: 404 } });
    clock = 300001;
    await expect(poll(args)).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('does not switch routes on an authentication error or timeout', async () => {
    const poll = createTaskPoller({ protocols: new Map() });
    for (const error of [Object.assign(new Error('unauthorized'), { response: { status: 401 } }), new Error('timeout')]) {
      const request = vi.fn().mockRejectedValue(error);
      await expect(poll({ taskId: 'old', userKey: 'key', request })).rejects.toBe(error);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('resets missing counts after a successful query', async () => {
    const poll = createTaskPoller({ protocols: new Map() });
    const request = vi.fn().mockRejectedValue(missing());
    const args = { taskId: 'old', userKey: 'key', request };
    await expect(poll(args)).rejects.toThrow();
    request.mockResolvedValueOnce({ status: 200, data: { status: 'PROCESSING' } });
    await poll(args);
    await expect(poll(args)).rejects.toThrow();
    await expect(poll(args)).rejects.toThrow();
  });
});
