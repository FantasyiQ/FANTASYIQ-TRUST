import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'sleepercdn.com',
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
    // Suppress Sentry CLI output during builds
    silent: true,
    // Disable source map upload when no auth token is configured
    sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
    },
    // Automatically tree-shake Sentry logger statements
    disableLogger: true,
    // Hides Sentry telemetry from build logs
    telemetry: false,
});
