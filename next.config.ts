import type { NextConfig } from "next";

import { serverEnv } from "./src/env/server";

const sharpRuntimeFiles = [
  "./node_modules/@img/sharp-linux-x64/**/*",
  "./node_modules/@img/sharp-libvips-linux-x64/**/*",
];

const discordEnabled = Boolean(
  serverEnv.DISCORD_CLIENT_ID && serverEnv.DISCORD_CLIENT_SECRET,
);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["@tabler/icons-react", "lucide-react"],
  },
  // Keep Sharp external so Node loads its native binding at runtime.
  serverExternalPackages: ["minecraft-protocol", "sharp"],
  // Sharp 0.35 ships native bindings and libvips in separate Linux packages.
  // Keep this list narrow so Next's own Sharp copy is not traced.
  outputFileTracingIncludes: {
    "/api/servers/*/media": sharpRuntimeFiles,
    "/api/account/avatar": sharpRuntimeFiles,
  },
  env: {
    NEXT_PUBLIC_DISCORD_ENABLED: discordEnabled ? "true" : "false",
  },
};

export default nextConfig;
