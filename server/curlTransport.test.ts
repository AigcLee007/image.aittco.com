import { describe, expect, it } from 'vitest';
import { resolveCurlExecutable } from './curlTransport.cjs';

describe('resolveCurlExecutable', () => {
  it('resolves a portable curl executable by platform', () => {
    expect(resolveCurlExecutable({ platform: 'win32', env: {} })).toBe('curl.exe');
    expect(resolveCurlExecutable({ platform: 'linux', env: {} })).toBe('curl');
  });

  it('allows an explicit curl executable override', () => {
    expect(
      resolveCurlExecutable({ platform: 'linux', env: { CURL_BIN: '/usr/local/bin/curl' } }),
    ).toBe('/usr/local/bin/curl');
  });
});
