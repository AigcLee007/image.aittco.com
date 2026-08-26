import { describe, expect, it, vi } from 'vitest';
import { prepareVisonReferencePayload } from './visonReference';
import { uploadReferenceImagesApi } from './api';

describe('Vison reference preparation', () => {
  it('uploads selected references before returning the line-one payload fields', async () => {
    const upload = vi.fn().mockResolvedValue([
      'https://image.example/uploads/one.png',
      'https://image.example/uploads/two.png',
    ]);
    const toDataUrl = vi.fn()
      .mockResolvedValueOnce('data:image/png;base64,one')
      .mockResolvedValueOnce('data:image/jpeg;base64,two');

    await expect(prepareVisonReferencePayload({
      references: [{ id: '1', src: 'blob:one', type: 'blob' }, { id: '2', src: 'blob:two', type: 'blob' }],
      toDataUrl,
      upload,
    })).resolves.toEqual({
      image: ['https://image.example/uploads/one.png', 'https://image.example/uploads/two.png'],
      images: ['https://image.example/uploads/one.png', 'https://image.example/uploads/two.png'],
      reference_image: 'https://image.example/uploads/one.png',
      reference_images: ['https://image.example/uploads/one.png', 'https://image.example/uploads/two.png'],
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith([
      'data:image/png;base64,one',
      'data:image/jpeg;base64,two',
    ]);
  });

  it('rejects a response that is not a public HTTPS URL', async () => {
    await expect(prepareVisonReferencePayload({
      references: [{ id: '1', src: 'blob:one', type: 'blob' }],
      toDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,one'),
      upload: vi.fn().mockResolvedValue(['http://localhost/uploads/one.png']),
    })).rejects.toThrow('公网 HTTPS');
  });

  it('uses the reference upload endpoint before image generation can proceed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ urls: ['https://image.example/uploads/one.png'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadReferenceImagesApi('test-api-key', ['data:image/png;base64,one']))
      .resolves.toEqual(['https://image.example/uploads/one.png']);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/reference\/images$/);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    vi.unstubAllGlobals();
  });
});
