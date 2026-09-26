import { defineConfig } from 'drizzle-kit';

// driver 'expo'는 마이그레이션을 앱 번들에 넣는 migrations.js를 만든다. op-sqlite도 같은 형식을 쓴다
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
