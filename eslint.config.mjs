import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['design/artifact-v2/.shots/**', '.next/**', 'out/**', 'node_modules/**', 'lib/api/schema.d.ts', 'next-env.d.ts']),
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
]);
