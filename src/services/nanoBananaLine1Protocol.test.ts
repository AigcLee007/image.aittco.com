import { describe, expect, it } from 'vitest';
import {
  buildNanoBananaLine1Payload,
  extractNanoBananaLine1TaskId,
  extractNanoBananaLine1ImageUrl,
} from './nanoBananaLine1Protocol';

describe('Nano Banana line one protocol', () => {
  it('maps UI ratio and resolution to upstream size and resolution fields', () => {
    expect(buildNanoBananaLine1Payload({
      prompt: '一只小猫',
      aspectRatio: '16:9',
      imageSize: '2k',
    })).toEqual({
      model: 'Nano_Banana_Pro',
      prompt: '一只小猫',
      size: '16:9',
      resolution: '2K',
    });
  });

  it('preserves optional reference images without sending legacy field names', () => {
    const payload = buildNanoBananaLine1Payload({
      prompt: '编辑图片',
      aspectRatio: '1:1',
      imageSize: '4K',
      images: ['data:image/png;base64,abc'],
    });
    expect(payload).toEqual({
      model: 'Nano_Banana_Pro',
      prompt: '编辑图片',
      images: ['data:image/png;base64,abc'],
      size: '1:1',
      resolution: '4K',
    });
  });

  it('extracts the new task id from data[0].task_id', () => {
    expect(extractNanoBananaLine1TaskId({
      data: [
        { task_id: 'task_new_123' },
        { task_id: 'task_interference_456' },
      ],
    })).toBe('task_new_123');
  });

  it('extracts the first URL from data.result.images[0].url[0]', () => {
    expect(extractNanoBananaLine1ImageUrl({
      data: {
        result: {
          images: [
            { url: ['https://visionary.beer/image.png', 'https://visionary.beer/image-interference.png'] },
            { url: ['https://visionary.beer/second-image-interference.png'] },
          ],
        },
      },
    })).toBe('https://visionary.beer/image.png');
  });
});
