import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export interface TestPostgres {
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  stop: () => Promise<void>;
}

// Real Postgres per e2e spec file rather than a mocked/in-memory DB — this
// app leans on Postgres-specific behavior (jsonb columns, unique-constraint
// idempotency, query-builder joins/brackets for visibility scoping) that a
// stand-in database wouldn't exercise faithfully.
export async function startTestPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  return {
    container,
    databaseUrl: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
