import { randomBytes } from 'crypto';

// Dummy values for everything the app's config reads via getOrThrow at
// bootstrap. Set on process.env *before* the Nest app (and therefore
// ConfigModule) is created — dotenv doesn't overwrite already-set
// process.env keys, so these win over whatever's in a local .env.
// None of these ever touch real Neon or live GitHub.
export function setTestEnv(databaseUrl: string): void {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DB_SSL = 'false';
  process.env.PORT = '0';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
  process.env.APP_BASE_URL = 'http://localhost:8080';
  delete process.env.FRONTEND_URL;
}
