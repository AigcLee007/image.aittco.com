# Nano Banana 线路一协议适配设计

## 目标

只调整 Nano Banana Pro 线路一，使其通过现有的 `POST /api/generate` 代理调用 `max.aittco.com` 时，向上游发送正确的 `size` / `resolution` 字段，并正确处理上游的新任务响应、任务轮询响应和图片结果结构。线路二、线路三保持现状。

## 现状与问题

当前线路一前端请求使用了内部字段名：

```json
{
  "model": "Nano_Banana_Pro",
  "aspect_ratio": "16:9",
  "imageSize": "2K",
  "size": "2k"
}
```

上游协议要求比例和分辨率分别使用：

```json
{
  "model": "Nano_Banana_Pro",
  "size": "16:9",
  "resolution": "2K"
}
```

当前服务端还存在三处协议解析不一致：

1. 新提交响应的任务 ID 位于 `data[0].task_id`。
2. 新任务查询地址为 `/v1/tasks/{task_id}`，而不是旧的 `/v1/images/tasks/{task_id}`。
3. 成功图片地址位于 `data.result.images[0].url[0]`。

当前任务状态也可能嵌套在 `data.status`，不能只读取顶层 `status` / `state`。

## 设计方案

### 1. 前端线路一请求构造

在 `components/ControlPanel.tsx` 中，仅在线路一分支构造上游协议字段：

- 保留模型名 `Nano_Banana_Pro`，不影响当前中转站的模型映射。
- 将界面比例 `effectiveRatio` 映射到上游 `size`。
- 将界面分辨率 `imageSize` 大写后映射到上游 `resolution`。
- 删除线路一请求中的 `aspect_ratio`、`imageSize` 和用于表达分辨率的旧 `size`。
- 保留提示词、数量和参考图数据的现有行为；若线路一带参考图，继续使用上游支持的 `images` 字段。

线路二、线路三的 payload 构造不变。

### 2. 服务端任务提交与任务 ID

在 `server.cjs` 中增加线路一专用的协议识别和任务 ID 提取逻辑：

- 线路一请求继续从 `/api/generate` 进入，并继续使用 `UPSTREAM_URL` 指向 `max.aittco.com`。
- 线路一上游提交地址仍为 `${UPSTREAM_URL}/v1/images/generations`。
- 优先从 `payload.data[0].task_id` 提取任务 ID。
- 同时保留当前 `id`、`task_id`、字符串 `data` 和 `data.task_id` 解析，以兼容已经提交的旧任务和其他模型。
- 为新任务记录线路一的轮询协议标记，供后续 `/api/task/:taskId` 选择查询路径。

### 3. 任务轮询路由选择

`GET /api/task/:taskId` 继续作为前端唯一轮询入口。

- 线路一新任务查询 `${UPSTREAM_URL}/v1/tasks/${taskId}`。
- 线路二、线路三继续使用原有 `${UPSTREAM_URL}/v1/images/tasks/${taskId}`。
- 对服务重启后无法从内存识别协议的旧任务，保留原有查询路径兜底，避免影响其他线路和已有任务。
- 轮询结果同时读取顶层和 `data` 内的 `status` / `state` / 失败原因。

### 4. 成功结果解析

线路一成功时优先读取：

```js
payload.data.result.images[0].url[0]
```

服务端或前端保留现有通用 URL 递归解析作为兼容兜底，确保旧格式结果不被破坏。状态判定支持 `SUCCESS`、`SUCCEEDED`、`COMPLETED` 等成功状态，以及 `FAILURE`、`FAILED`、`ERROR`、取消状态等失败状态。

## 错误处理

- HTTP 错误继续透传上游状态和响应内容。
- 业务失败优先使用 `data.fail_reason`、`failure_reason` 或嵌套错误消息作为错误信息。
- `data.status` 存在时不得被错误记录为 `status: null`。
- 不把线路一的协议错误处理扩展到线路二、线路三。

## 测试设计

新增或补充纯函数测试，覆盖：

1. 线路一 payload 将 `16:9` 和 `2k` 转换为 `size: "16:9"`、`resolution: "2K"`。
2. 从 `data[0].task_id` 提取线路一任务 ID。
3. 从 `data.status` 读取任务状态。
4. 从 `data.result.images[0].url[0]` 提取成功图片地址。
5. 旧格式任务 ID、状态和 URL 解析仍然兼容。
6. 线路二、线路三请求字段和旧轮询路径不发生变化。

验证命令至少包括：

```bash
npm test -- --run
npm run build
```

## 非目标

- 不修改 `max.aittco.com` 的部署配置或 API Key。
- 不将前端请求改成直接访问 `api.visionary.beer`。
- 不修改 Nano Banana 线路二、线路三。
- 不修改 GPT-image-2 的文生图或图生图流程。
