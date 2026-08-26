import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Docker image', () => {
  it('installs curl for the HTTP fallback transport', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/RUN apk add --no-cache curl/);
  });
});
