const MISSING_WINDOW_MS = 300000;
const MISSING_LIMIT = 3;

const isNotFound = (error) => Number(error?.response?.status) === 404;

const createTaskPoller = ({ protocols, now = () => Date.now() } = {}) => {
  const missing = new Map();
  const keyFor = (taskId, userKey) => `${String(userKey || '').slice(0, 16)}:${taskId}`;
  const cleanup = (time) => {
    for (const [key, value] of missing) {
      if (time - value.updatedAt > MISSING_WINDOW_MS) missing.delete(key);
    }
  };

  return async ({ taskId, userKey, request }) => {
    const time = now();
    cleanup(time);
    const key = keyFor(taskId, userKey);
    const blocked = missing.get(key);
    if (blocked && blocked.count >= MISSING_LIMIT && time - blocked.updatedAt <= MISSING_WINDOW_MS) {
      return {
        response: {
          status: 200,
          data: {
            status: 'FAILED',
            state: 'FAILED',
            task_id: taskId,
            error: { code: 'TASK_POLL_UNAVAILABLE', message: '任务查询连续返回 404，已停止自动轮询' },
          },
        },
        stopped: true,
      };
    }

    const preferred = protocols?.get(taskId) === 'nano-line1'
      ? `/v1/tasks/${taskId}`
      : `/v1/images/tasks/${taskId}`;
    const paths = [preferred];
    if (!protocols?.has(taskId)) paths.push(`/v1/tasks/${taskId}`);

    let lastError;
    for (const path of paths) {
      try {
        const response = await request(path);
        missing.delete(key);
        if (!protocols?.has(taskId) && path === `/v1/tasks/${taskId}`) protocols?.set(taskId, 'nano-line1');
        return { response, path };
      } catch (error) {
        lastError = error;
        if (!isNotFound(error)) {
          missing.delete(key);
          throw error;
        }
      }
    }

    const next = { count: (missing.get(key)?.count || 0) + 1, updatedAt: time };
    missing.set(key, next);
    if (next.count >= MISSING_LIMIT) {
      return {
        response: {
          status: 200,
          data: {
            status: 'FAILED',
            state: 'FAILED',
            task_id: taskId,
            error: { code: 'TASK_POLL_UNAVAILABLE', message: '任务查询连续返回 404，已停止自动轮询' },
          },
        },
        stopped: true,
      };
    }
    throw lastError;
  };
};

module.exports = { createTaskPoller };
