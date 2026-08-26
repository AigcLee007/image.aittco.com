async (page) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"items":[]}' }));
  await page.goto('http://127.0.0.1:3322');
  await page.waitForSelector('canvas');
  const result = await page.evaluate(async () => {
    const appSource = await (await fetch('/App.tsx')).text();
    const load = (name) => import(appSource.match(new RegExp('from "([^"]*/' + name + '\\.ts[^"\\n]*)"'))[1]);
    const { useCanvasStore } = await load('canvasStore');
    const { useSelectionStore } = await load('selectionStore');
    const { assetStorage } = await load('assetStorage');
    useSelectionStore.getState().setApiKey('test-local-only-no-upstream');
    useSelectionStore.getState().setControlPanelOpen(false);
    useSelectionStore.getState().selectAll([]);
    const nodes = [];
    for (let i = 0; i < 10; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2048;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 2048, 2048);
      gradient.addColorStop(0, `hsl(${i * 36},70%,50%)`);
      gradient.addColorStop(1, '#101020');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2048, 2048);
      ctx.font = '200px sans-serif'; ctx.fillStyle = 'white'; ctx.fillText(`Image ${i}`, 100, 1000);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const assetId = await assetStorage.storeBlob(blob);
      const src = await assetStorage.getAssetUrl(assetId);
      nodes.push({ id: `smoke-${i}`, type: 'IMAGE', x: (i % 5) * 540, y: Math.floor(i / 5) * 540, width: 512, height: 512, src, assetId });
      const img = new Image(); img.src = src; await img.decode();
    }
    useCanvasStore.getState().setNodes(nodes, true);
    useCanvasStore.getState().setCanvasTransform({ x: 10, y: 10 }, 0.4);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const samples = [];
    let last = performance.now();
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now(); samples.push(now - last); last = now;
      useCanvasStore.getState().setCanvasTransform({ x: 10 + i, y: 10 + i / 2 }, 0.4 + i / 1000);
    }
    samples.sort((a,b) => a-b);
    return { nodes: useCanvasStore.getState().nodes.length, frameMedianMs: samples[30], frameP95Ms: samples[57], maxFrameMs: samples[59] };
  });
  console.log(JSON.stringify(result));
  await page.screenshot({ path: 'output/playwright/canvas-ten-images.png' });
  return result;
}
