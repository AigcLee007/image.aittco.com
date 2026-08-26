# Vison 参考图上传与画布性能设计

## 目标

确保 Vison 线路在存在参考图时必定先调用 `/api/reference/images`，再把服务器返回的公网 HTTPS 地址提交到 `/api/generate`；同时降低画布在约 10 张图片时的重绘和缓存开销。

## 方案

将 Vison 参考图预处理抽成独立、可测试的函数：读取 `ReferenceImage` 的 Blob 或 URL，调用现有上传 API，校验返回数量和 HTTPS 地址，再构造线路一 payload。ControlPanel 只在 Vison 分支调用该函数，避免被通用线路分支或线路状态判断跳过，并保留现有错误提示。

画布继续使用视口裁剪，但缩小非低端设备的缓冲区，并让 CanvasNode 的高成本缓存只在资源已加载、节点静止且位于视口时启用；进度计时器仅为加载节点创建，减少静态图片造成的定时器和重绘。

## 验证

新增线路一预处理单元测试，覆盖上传调用所需的参考图、HTTPS URL 校验和 payload 字段；新增视口缓冲测试，确认裁剪边界和较小缓冲行为。运行相关 Vitest 测试及 TypeScript/Vite 构建。
