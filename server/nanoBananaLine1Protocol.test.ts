import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  extractTaskId,
  getTaskFailureReason,
  getTaskImageUrl,
  getTaskPollPath,
  getTaskStatus,
} = require('./nanoBananaLine1Protocol.cjs');

describe('server Nano Banana line one protocol', () => {
  it('uses data[0].task_id and /v1/tasks for a marked line-one task', () => {
    const response = {
      data: [
        { task_id: 'task_new_123' },
        { task_id: 'task_interference_456' },
      ],
    };
    const protocols = new Map([['task_new_123', 'nano-line1']]);

    expect(extractTaskId(response)).toBe('task_new_123');
    expect(getTaskPollPath('task_new_123', protocols)).toBe('/v1/tasks/task_new_123');
  });

  it('reads the nested status, failure reason, and first result URL', () => {
    const response = {
      status: 'failed-interference',
      data: {
        status: 'succeeded',
        failure_reason: '',
        result: {
          images: [
            { url: ['https://visionary.beer/image.png', 'https://visionary.beer/interference.png'] },
            { url: ['https://visionary.beer/second-interference.png'] },
          ],
        },
      },
    };

    expect(getTaskStatus(response)).toBe('succeeded');
    expect(getTaskFailureReason(response)).toBe('');
    expect(getTaskImageUrl(response)).toBe('https://visionary.beer/image.png');
  });

  it('keeps unmarked tasks on the legacy poll path', () => {
    expect(getTaskPollPath('old_task', new Map())).toBe('/v1/images/tasks/old_task');
  });
});
