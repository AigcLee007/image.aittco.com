import type { ReferenceImage } from '../store/selectionStore';

interface VisonReferenceOptions {
  references: ReferenceImage[];
  toDataUrl: (reference: ReferenceImage) => Promise<string | null>;
  upload: (images: string[]) => Promise<string[]>;
}

export async function prepareVisonReferencePayload({ references, toDataUrl, upload }: VisonReferenceOptions) {
  if (!references.length) throw new Error('Vison线路缺少参考图');
  const images = await Promise.all(references.map(toDataUrl));
  if (images.some((image) => !image?.startsWith('data:image/'))) {
    throw new Error('Vison线路参考图处理失败，请重新上传后再试');
  }
  const urls = await upload(images as string[]);
  if (urls.length !== references.length) throw new Error('Vison线路参考图上传结果不完整');
  for (const value of urls) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Vison线路上传接口未返回有效图片地址');
    }
    if (url.protocol !== 'https:' || /^(localhost|127\..*|0\.0\.0\.0|\[::1\])$/.test(url.hostname)) {
      throw new Error('Vison线路上传成功，但服务器未返回公网 HTTPS 图片地址；请检查 PUBLIC_BASE_URL 和反向代理配置');
    }
  }
  return {
    image: urls.length === 1 ? urls[0] : urls,
    images: urls,
    reference_image: urls[0],
    reference_images: urls,
  };
}
