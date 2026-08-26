export interface NanoBananaLine1PayloadInput {
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  images?: string[];
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value !== null && typeof value === 'object' ? value as UnknownRecord : undefined;

const firstString = (...values: unknown[]): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.length > 0);

export const buildNanoBananaLine1Payload = ({
  prompt,
  aspectRatio,
  imageSize,
  images,
}: NanoBananaLine1PayloadInput) => ({
  model: 'Nano_Banana_Pro' as const,
  prompt,
  ...(images && images.length > 0 ? { images } : {}),
  size: aspectRatio || '1:1',
  resolution: imageSize.toUpperCase() === '4K' ? '4K' as const : '2K' as const,
});

export const extractNanoBananaLine1TaskId = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const data = root?.data;
  const dataItems = Array.isArray(data) ? data : [];
  const dataRecord = asRecord(data);

  return firstString(
    asRecord(dataItems[0])?.task_id,
    root?.id,
    root?.task_id,
    typeof data === 'string' ? data : undefined,
    dataRecord?.task_id,
  );
};

export const extractNanoBananaLine1ImageUrl = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const data = root?.data;
  const dataItems = Array.isArray(data) ? data : [];
  const dataRecord = asRecord(data);
  const resultRecord = asRecord(dataRecord?.result);
  const resultImages = Array.isArray(resultRecord?.images) ? resultRecord.images : [];
  const firstResultImage = asRecord(resultImages[0]);
  const firstResultUrl = Array.isArray(firstResultImage?.url) ? firstResultImage.url[0] : undefined;
  const firstDataItem = asRecord(dataItems[0]);

  return firstString(
    firstResultUrl,
    root?.url,
    root?.image_url,
    firstDataItem?.url,
    firstDataItem?.image_url,
    typeof dataItems[0] === 'string' ? dataItems[0] : undefined,
    dataRecord?.url,
    dataRecord?.image_url,
  );
};
