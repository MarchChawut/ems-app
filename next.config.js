/** @type {import('next').NextConfig} */

// เปิดการวิเคราะห์ bundle size ด้วย ANALYZE=true (ทำงานผ่าน webpack เท่านั้น
// เพราะ @next/bundle-analyzer ยังไม่รองรับ Turbopack: `ANALYZE=true next build --webpack`)
const path = require('path');

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  // หมายเหตุ: ไม่ใช้ `env:` ของ Next.js เพื่อ inline DATABASE_URL/NEXTAUTH_SECRET — ค่านี้จะถูกฝังลงใน bundle ตอน build
  // (โค้ดฝั่ง server อ่าน process.env ตอนรันอยู่แล้ว ไม่จำเป็นต้องฝัง และไม่ควรมี secret อยู่ใน build artifact)
  // การตั้งค่าความปลอดภัย
  async headers() {
    return [
      {
        // ฟอนต์ THSarabun ใน public/fonts ไม่เปลี่ยนเนื้อหาภายใต้ชื่อเดิม — cache ยาวเพื่อไม่ให้ดาวน์โหลดซ้ำทุกครั้งที่สั่งพิมพ์
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: "Content-Security-Policy",
            // production ไม่ใช้ 'unsafe-eval' (Next production ไม่ต้องใช้; dev ต้องใช้สำหรับ HMR/React refresh)
            // 'unsafe-inline' ของ script ยังจำเป็นสำหรับ inline script ของ Next จนกว่าจะทำ nonce-based CSP (ดู docs/SECURITY.md)
            value:
              "default-src 'self'; " +
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://static.cloudflareinsights.com; ` +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; " +
              "font-src 'self' https://fonts.gstatic.com; " +
              "connect-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com; " +
              "object-src 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'; " +
              "frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
  // ปิดการใช้งาน powered by header เพื่อความปลอดภัย
  poweredByHeader: false,
  // ไม่ให้ bundler พยายาม bundle pino (มี internal dynamic require ที่ webpack/Turbopack จัดการไม่ได้)
  serverExternalPackages: ['pino'],
  // ลด bundle size ของไลบรารีที่ import แบบ barrel file (ตัด tree-shaking ที่ import เฉพาะ icon/component ที่ใช้จริง)
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
  },
  // Turbopack config สำหรับ @react-pdf/renderer (Next.js 16+)
  turbopack: {
    // ปักหมุด workspace root ไว้ที่โปรเจกต์ ป้องกัน Next เดา root ไปที่ ~ จาก lockfile อื่น
    root: path.resolve(__dirname),
    resolveAlias: {
      canvas: './empty-module.js',
    },
  },
  // webpack config สำหรับ @react-pdf/renderer (fallback ถ้าใช้ --webpack)
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
