import type { NextConfig } from "next";

import { serverEnv } from "./src/env/server";

const discordEnabled = Boolean(
  serverEnv.DISCORD_CLIENT_ID && serverEnv.DISCORD_CLIENT_SECRET,
);

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["minecraft-protocol"],
  env: {
    NEXT_PUBLIC_DISCORD_ENABLED: discordEnabled ? "true" : "false",
  },
};

export default nextConfig;
