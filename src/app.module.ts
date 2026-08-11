import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from './events/events.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RepositoriesModule } from './repositories/repositories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // synchronize is convenient for a demo project (no migrations to
        // manage) but is NOT safe for a real production database — it can
        // drop/alter columns based on entity changes. Use migrations there.
        synchronize: true,
        // Neon requires SSL; a local Postgres instance for dev/testing
        // typically doesn't support it. Toggle via env instead of
        // hardcoding, so the same code works against both.
        ssl:
          config.get<string>('DB_SSL', 'true') === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    EventsModule,
    WebhooksModule,
    AuthModule,
    UsersModule,
    RepositoriesModule,
  ],
})
export class AppModule {}
