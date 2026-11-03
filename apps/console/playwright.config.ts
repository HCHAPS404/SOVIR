import { defineConfig } from "@playwright/test";

// Visual/a11y CI scaffold. NOT_RUN yet: requires `npx playwright install
// chromium` and a running console + API (SOVIR_API_URL). Kept offline by
// default — serve `next start` on :3001 against the local API.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.SOVIR_CONSOLE_URL ?? "http://127.0.0.1:3001",
    colorScheme: "dark",
  },
  webServer: process.env.SOVIR_CONSOLE_URL
    ? undefined
    : {
        command: "npm run start",
        port: 3001,
        reuseExistingServer: true,
      },
});
