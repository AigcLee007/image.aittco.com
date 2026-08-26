const resolveCurlExecutable = ({ platform = process.platform, env = process.env } = {}) => {
  const override = typeof env.CURL_BIN === 'string' ? env.CURL_BIN.trim() : '';
  if (override) return override;
  return platform === 'win32' ? 'curl.exe' : 'curl';
};

module.exports = { resolveCurlExecutable };
