import { spawnSync } from "node:child_process";

process.env.TAURI_BUILD = "1";
const isWin = process.platform === "win32";
const result = spawnSync(isWin ? "npm.cmd" : "npm", ["run", "build"], {
  stdio: "inherit",
  shell: isWin,
  env: process.env,
});

process.exit(result.status ?? 0);
