/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/trpc/:path*',
        destination: `${process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://127.0.0.1:8787'}/trpc/:path*`,
      },
      {
        source: '/ws',
        destination: `${process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://127.0.0.1:8787'}/ws`,
      },
      {
        source: '/api/auth/:path*',
        destination: `${process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://127.0.0.1:8787'}/api/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
