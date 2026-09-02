import type { NextConfig } from "next";

import { serverEnv } from "./src/env/server";

const sharpRuntimeFiles = [
  "./node_modules/@img/sharp-linux-x64/**/*",
  "./node_modules/@img/sharp-libvips-linux-x64/**/*",
];

const discordEnabled = Boolean(
  serverEnv.DISCORD_CLIENT_ID && serverEnv.DISCORD_CLIENT_SECRET,
);

/**
 * Response headers.
 *
 * HSTS was already set by the platform; nothing else was. A site that accepts user-submitted
 * content and runs an auth flow has reasons for the rest that have nothing to do with SEO.
 *
 * The CSP is deliberately `Report-Only`. Next's streaming hydration injects inline scripts, so an
 * enforced policy without nonces breaks the page; run it in report mode, read the violations, then
 * decide. `unsafe-inline` is listed so the report describes real problems rather than every
 * framework script.
 *
 * Report mode only means something if the reports are collected somewhere, so the policy names an
 * endpoint twice: `report-uri` for Safari and Firefox, and `report-to` -- paired with the
 * `Reporting-Endpoints` header that defines the name -- for Chrome, which deprecated the first.
 * Both are relative, so a report is same-origin by construction on production, preview and local
 * alike; an absolute URL would make every preview deployment post cross-origin and need CORS.
 */
const cspReportPath = "/api/csp-report";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "upgrade-insecure-requests",
  `report-uri ${cspReportPath}`,
  "report-to csp-endpoint",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Reporting-Endpoints", value: `csp-endpoint="${cspReportPath}"` },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  redirects: async () => [{ source: "/servers", destination: "/", permanent: true }],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
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
