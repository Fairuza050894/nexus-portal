import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const envName of ['.env', '.env.local']) {
  const envPath = resolve(process.cwd(), envName);
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // abaikan error parse jika file kosong atau sudah termuat
    }
  }
}

import { createApiServer } from './server.js';
import { defaultRunManager, RunManager } from './runs.js';
import { defaultEventStream, EventStreamManager } from './events.js';
import { parseAuthHeader, hasMinimumRole, type AuthUser, type UserRole } from './auth.js';

export {
  createApiServer,
  defaultRunManager,
  RunManager,
  defaultEventStream,
  EventStreamManager,
  parseAuthHeader,
  hasMinimumRole,
};

export type { AuthUser, UserRole };

// If executed directly: start listening on PORT (default 3000)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApiServer();
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`Nexus Portal API Server listening on http://${host}:${port}`);
  });
}
