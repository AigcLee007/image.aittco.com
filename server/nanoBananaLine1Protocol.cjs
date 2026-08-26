const asRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;

const firstString = (...values) =>
  values.find((value) => typeof value === "string" && value.length > 0);

const extractTaskId = (payload) => {
  const root = asRecord(payload);
  const data = root?.data;
  const dataItems = Array.isArray(data) ? data : [];
  const dataRecord = asRecord(data);

  return firstString(
    asRecord(dataItems[0])?.task_id,
    root?.id,
    root?.task_id,
    typeof data === "string" ? data : undefined,
    dataRecord?.task_id,
  );
};

const getTaskStatus = (payload) => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);

  return firstString(data?.status, data?.state, root?.status, root?.state);
};

const getTaskFailureReason = (payload) => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);

  for (const value of [
    data?.failure_reason,
    data?.fail_reason,
    root?.failure_reason,
    root?.fail_reason,
    data?.error,
    root?.error,
  ]) {
    if (typeof value === "string") return value;
  }
  return undefined;
};

const getTaskImageUrl = (payload) => {
  const root = asRecord(payload);
  const data = root?.data;
  const dataRecord = asRecord(data);
  const result = asRecord(dataRecord?.result);
  const images = Array.isArray(result?.images) ? result.images : [];
  const firstImage = asRecord(images[0]);
  const firstImageUrl = Array.isArray(firstImage?.url) ? firstImage.url[0] : undefined;
  const dataItems = Array.isArray(data) ? data : [];
  const firstDataItem = asRecord(dataItems[0]);

  return firstString(
    firstImageUrl,
    root?.url,
    root?.image_url,
    firstDataItem?.url,
    firstDataItem?.image_url,
    typeof dataItems[0] === "string" ? dataItems[0] : undefined,
    dataRecord?.url,
    dataRecord?.image_url,
  );
};

const getTaskPollPath = (taskId, taskProtocolById) =>
  taskProtocolById.get(taskId) === "nano-line1"
    ? `/v1/tasks/${taskId}`
    : `/v1/images/tasks/${taskId}`;

module.exports = {
  extractTaskId,
  getTaskFailureReason,
  getTaskImageUrl,
  getTaskPollPath,
  getTaskStatus,
};
