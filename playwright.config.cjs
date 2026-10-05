const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests/browser', workers: 1, use: { baseURL: 'http://127.0.0.1:8080',
  launchOptions: { executablePath: process.env.PLAYERIUM_BROWSER_PATH || undefined, args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'python3 -m http.server 8080 --bind 127.0.0.1', url: 'http://127.0.0.1:8080', reuseExistingServer: !process.env.CI } });
