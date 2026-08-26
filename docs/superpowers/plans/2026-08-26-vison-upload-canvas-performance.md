# Vison Upload and Canvas Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vison reference-image submissions upload before generation and keep the canvas responsive with ten images.

**Architecture:** Extract Vison reference preparation into a pure/injectable service helper used by ControlPanel. Keep the existing server upload and upstream protocol unchanged. Reduce viewport buffer and skip expensive CanvasNode timers/cache work for offscreen or static nodes.

**Tech Stack:** React, TypeScript, Zustand, react-konva, Vitest, Vite.

---

### Task 1: Lock the Vison upload contract with tests

**Files:**
- Create: `src/services/visonReference.ts`
- Create: `src/services/visonReference.test.ts`

- [ ] **Step 1: Write failing tests** for a helper that converts references to data URLs, calls an injected uploader once, rejects missing references, rejects non-HTTPS results, and returns `{ image, images, reference_image, reference_images }`.
- [ ] **Step 2: Run `npm test -- --run src/services/visonReference.test.ts` and confirm failure because the helper is absent.
- [ ] **Step 3: Implement the minimal helper with an injected `toDataUrl` and `upload` dependency, preserving reference order.
- [ ] **Step 4: Re-run the focused test and confirm it passes.

### Task 2: Route ControlPanel through the explicit Vison helper

**Files:**
- Modify: `components/ControlPanel.tsx`

- [ ] **Step 1: Add a failing integration-oriented assertion to the helper test showing the uploader receives the selected reference images before payload construction.
- [ ] **Step 2: Run the focused test and confirm the assertion fails against the current inline flow.
- [ ] **Step 3: Replace the inline Vison conversion/upload block with the helper, await its result, log the selected line and upload count, then call the existing `processSubmission` with the returned fields.
- [ ] **Step 4: Run focused tests and `npm run build`.

### Task 3: Reduce canvas work for larger node sets

**Files:**
- Modify: `components/InfiniteCanvas.tsx`
- Modify: `src/hooks/useViewportCulling.ts`
- Modify: `components/CanvasNode.tsx`
- Create: `src/hooks/useViewportCulling.test.ts`

- [ ] **Step 1: Write failing viewport tests for a 700px buffer and boundary inclusion/exclusion.
- [ ] **Step 2: Run `npm test -- --run src/hooks/useViewportCulling.test.ts` and confirm failure if the hook does not expose a testable filter.
- [ ] **Step 3: Extract/export the pure filter, use a 700px normal buffer and 400px low-end buffer, and pass the exact in-viewport flag to CanvasNode.
- [ ] **Step 4: Guard CanvasNode progress interval and cache rebuild behind `node.loading`/`isInViewport` and preserve selected-node hit areas.
- [ ] **Step 5: Run focused tests, the existing service tests, and `npm run build`.

### Task 4: Review the final diff

- [ ] **Step 1:** Inspect `git diff` for unrelated changes and verify the Vison branch still uses `/api/generate` after upload.
- [ ] **Step 2:** Run the full test command available in `package.json` and report any pre-existing failures separately.
