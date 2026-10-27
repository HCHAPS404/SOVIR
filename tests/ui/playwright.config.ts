import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  webServer: [
    {
      command: "pnpm --dir ../.. dev:website",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --dir ../.. dev:console",
      url: "http://127.0.0.1:3001/sign-in",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  use: { baseURL: "http://127.0.0.1:3000" },
});
