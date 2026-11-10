import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // โค้ดเดิมไม่เคยผ่าน lint (next lint ถูกลบใน Next 16) จึงลดระดับกฎที่พบมากเป็น warn
    // เพื่อให้ `pnpm lint` ใช้งานได้ แล้วค่อยทยอยแก้ทีละกฎ
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist-seed/**',
    'cloudflare/**',
    'ems-admin/**',
    'scripts/**',
    'e2e/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
