/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Tauri bundles a static frontend (`frontendDist: ../out`): only the
  // `tauri:build` script sets TAURI_BUILD=1, so the web gate
  // (`npm run build`) keeps its current server build untouched.
  ...(process.env.TAURI_BUILD ? { output: "export" } : {}),
};

export default nextConfig;
