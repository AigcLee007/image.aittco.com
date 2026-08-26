# Nano Banana 线路一协议适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Nano Banana Pro 线路一通过现有 `POST /api/generate` 中转时使用 `size` / `resolution`，并正确处理 `data[0].task_id`、`/v1/tasks/{task_id}` 和 `data.result.images[0].url[0]` 协议，同时保持线路二、线路三不变。

**Architecture:** 保留浏览器到 `max.aittco.com` 的现有代理边界。线路一在前端生成上游字段，服务端记录新任务使用的轮询协议并走 `/v1/tasks`；未标记的旧任务和其他模型继续走旧 `/v1/images/tasks`。协议解析提取为可测试的纯函数，成功结果优先使用官方嵌套路径并保留旧格式兜底。

**Tech Stack:** React/TypeScript, Node.js CommonJS (`server.cjs`), Vitest, Vite.

---

### Task 1: Add failing tests for the line-one payload and response contract

**Files:**
- Create: `src/services/nanoBananaLine1Protocol.test.ts`
- Test target to be created in Task 2: `src/services/nanoBananaLine1Protocol.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for the exact line-one contract:

```ts
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
    expect(buildNanoBananaLine1Payload({
      prompt: '编辑图片',
      aspectRatio: '1:1',
      imageSize: '4K',
      images: ['data:image/png;base64,abc'],
    })).toMatchObject({
      images: ['data:image/png;base64,abc'],
      size: '1:1',
      resolution: '4K',
    });
    const payload = buildNanoBananaLine1Payload({ prompt: 'x', aspectRatio: '1:1', imageSize: '2K' }) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('aspect_ratio');
    expect(payload).not.toHaveProperty('imageSize');
  });

  it('extracts the new task id from data[0].task_id', () => {
    expect(extractNanoBananaLine1TaskId({ data: [{ task_id: 'task_new_123' }] })).toBe('task_new_123');
  });

  it('extracts the first successful image URL from data.result.images[0].url[0]', () => {
    expect(extractNanoBananaLine1ImageUrl({
      data: { result: { images: [{ url: ['https://visionary.beer/image.png'] }] } },
    })).toBe('https://visionary.beer/image.png');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the intended reason**

Run:

```bash
npm test -- --run src/services/nanoBananaLine1Protocol.test.ts
```

Expected: FAIL because `src/services/nanoBananaLine1Protocol.ts` and its exported functions do not exist yet.

### Task 2: Implement and wire the line-one frontend payload helper

**Files:**
- Create: `src/services/nanoBananaLine1Protocol.ts`
- Modify: `components/ControlPanel.tsx:840-866` and `components/ControlPanel.tsx:1013-1036`
- Test: `src/services/nanoBananaLine1Protocol.test.ts`

- [ ] **Step 1: Implement the minimal pure helpers**

Implement a typed helper that keeps the existing UI state names internal and emits only the upstream line-one fields:

```ts
export interface NanoBananaLine1PayloadInput {
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  images?: string[];
}

export const buildNanoBananaLine1Payload = ({ prompt, aspectRatio, imageSize, images }: NanoBananaLine1PayloadInput) => ({
  model: 'Nano_Banana_Pro',
  prompt,
  size: aspectRatio || '1:1',
  resolution: imageSize.toUpperCase() === '4K' ? '4K' : '2K',
  ...(images && images.length > 0 ? { images } : {}),
});
```

Export `extractNanoBananaLine1TaskId` with `data[0].task_id` as the first lookup and `extractNanoBananaLine1ImageUrl` with `data.result.images[0].url[0]` as the first lookup. Keep their legacy fallbacks local to this helper.

- [ ] **Step 2: Replace only the line-one branches in `ControlPanel.tsx`**

Use the helper for both normal text-to-image submission paths. The line-one branch must no longer construct `aspect_ratio`, `imageSize`, or resolution-valued `size`; line two, line three, GPT-image-2, and reference-edit branches remain unchanged.

- [ ] **Step 3: Run the focused tests and verify they pass**

Run:

```bash
npm test -- --run src/services/nanoBananaLine1Protocol.test.ts
```

Expected: all line-one payload, task ID, and URL extraction tests PASS.

### Task 3: Add failing tests for service-side response parsing and route selection

**Files:**
- Create: `server/nanoBananaLine1Protocol.cjs`
- Create: `server/nanoBananaLine1Protocol.test.ts`
- Modify: `server.cjs`

- [ ] **Step 1: Write failing tests for server protocol helpers**

Test the CommonJS helper through Vitest with `createRequire`:

```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  extractTaskId,
  getTaskStatus,
  getTaskFailureReason,
  getTaskImageUrl,
  getTaskPollPath,
} = require('./nanoBananaLine1Protocol.cjs');

describe('server Nano Banana line one protocol', () => {
  it('uses data[0].task_id and /v1/tasks for a new line-one task', () => {
    const response = { data: [{ task_id: 'task_new_123' }] };
    expect(extractTaskId(response)).toBe('task_new_123');
    expect(getTaskPollPath('task_new_123', new Map([['task_new_123', 'nano-line1']]))).toBe('/v1/tasks/task_new_123');
  });

  it('reads nested status, failure reason, and result image URL', () => {
    const response = {
      data: {
        status: 'succeeded',
        failure_reason: '',
        result: { images: [{ url: ['https://visionary.beer/image.png'] }] },
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
```

- [ ] **Step 2: Run the focused server test and verify the expected failure**

Run:

```bash
npm test -- --run server/nanoBananaLine1Protocol.test.ts
```

Expected: FAIL because the helper module and exports are not implemented.

### Task 4: Implement server-side line-one submission, polling, and result handling

**Files:**
- Create: `server/nanoBananaLine1Protocol.cjs`
- Modify: `server.cjs:211-219`, `server.cjs:640-751`, `server.cjs:948-1039`
- Test: `server/nanoBananaLine1Protocol.test.ts`

- [ ] **Step 1: Implement pure CommonJS protocol helpers**

Implement these functions with the new contract first and legacy fallbacks second:

```js
extractTaskId(payload)
getTaskStatus(payload)
getTaskFailureReason(payload)
getTaskImageUrl(payload)
getTaskPollPath(taskId, taskProtocolById)
```

`getTaskPollPath` returns `/v1/tasks/${taskId}` only when the task map marks the ID as `nano-line1`; otherwise it returns `/v1/images/tasks/${taskId}`.

- [ ] **Step 2: Wire task extraction and protocol metadata into `/api/generate`**

Add a `Map` for new line-one task IDs. After the upstream submission response is logged, extract the task ID with the new helper. When `requestBody.model === 'Nano_Banana_Pro'`, record `nano-line1` before storing the retry payload. Continue using the existing extraction path for other models.

- [ ] **Step 3: Wire the selected poll path into `/api/task/:taskId`**

Build the upstream URL from `getTaskPollPath`. For marked line-one tasks use `/v1/tasks/{taskId}`; for all other tasks preserve `/v1/images/tasks/{taskId}`. Keep the existing retry and HTTP error forwarding behavior.

- [ ] **Step 4: Normalize nested status and image result without changing other routes**

Use `getTaskStatus`, `getTaskFailureReason`, and `getTaskImageUrl` for logging and failure decisions. Return the upstream payload unchanged so the existing client can still inspect raw fields, but ensure the server’s summary reports nested `data.status` rather than `null`.

- [ ] **Step 5: Run the focused server tests and verify they pass**

Run:

```bash
npm test -- --run server/nanoBananaLine1Protocol.test.ts
```

Expected: all nested-response and route-selection tests PASS.

### Task 5: Update client task/result parsing with backward-compatible priority rules

**Files:**
- Modify: `services/api.ts:121-210`
- Modify: `src/hooks/useGlobalPolling.ts:35-73`
- Extend: `src/services/nanoBananaLine1Protocol.test.ts`

- [ ] **Step 1: Add failing client parsing tests**

Add this test to `src/services/nanoBananaLine1Protocol.test.ts` so the public client request parser is proven to accept the new submission response before changing `services/api.ts`:

```ts
import { vi } from 'vitest';
import { generateImageApi } from '../../services/api';

it('generateImageApi returns data[0].task_id from the line-one submission response', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ data: [{ task_id: 'task_new_123' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);

  await expect(generateImageApi('test-api-key', {
    model: 'Nano_Banana_Pro',
    prompt: '一只小猫',
    size: '16:9',
    resolution: '2K',
  })).resolves.toMatchObject({ taskId: 'task_new_123' });

  vi.unstubAllGlobals();
});
```

The explicit `data.result.images[0].url[0]` assertion remains in the pure helper test from Task 1; this keeps the React polling hook test-free while still testing the exact result path used by it.

- [ ] **Step 2: Implement the minimal parsing changes**

Update the task ID extraction in `services/api.ts` to check `resJson.data?.[0]?.task_id` before the existing legacy fields. Import the explicit image URL helper in `useGlobalPolling.ts`, use `data.result.images[0].url[0]` first, and call `findAllUrlsInObject` only when the explicit path is absent.

- [ ] **Step 3: Run client parsing tests**

Run:

```bash
npm test -- --run src/services/nanoBananaLine1Protocol.test.ts
```

Expected: all client parsing tests PASS and existing legacy fallback assertions remain green.

### Task 6: Run full verification and inspect the diff

**Files:**
- Verify only: `components/ControlPanel.tsx`, `server.cjs`, `services/api.ts`, `src/hooks/useGlobalPolling.ts`, `src/services/nanoBananaLine1Protocol.ts`, `server/nanoBananaLine1Protocol.cjs`, and their tests.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test -- --run
```

Expected: Vitest exits with code 0 and no failed tests.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite exits with code 0 and produces the build output.

- [ ] **Step 3: Inspect the final diff for scope**

Run:

```bash
git diff --check
git status --short
git diff -- components/ControlPanel.tsx server.cjs services/api.ts src/hooks/useGlobalPolling.ts src/services/nanoBananaLine1Protocol.ts server/nanoBananaLine1Protocol.cjs
```

Confirm that no existing user changes outside the listed files were staged or overwritten, and that line two and line three payload branches are unchanged.

- [ ] **Step 4: Perform a deployment-side smoke check after the code is deployed**

In the server terminal, watch only the relevant logs while making one line-one request:

```bash
docker logs --since 1m -f huabu-app 2>&1 | grep --line-buffered -E '\[Generate\]|\[Task Poll\]'
```

The expected evidence is a line-one submission with `size: '16:9'` and `resolution: '2K'`, a task ID extracted from the new response, polling through `/v1/tasks/{task_id}`, and a successful URL under `data.result.images[0].url[0]`.
