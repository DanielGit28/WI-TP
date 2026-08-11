import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';

// Split out from AuthModule so any module needing just the guards (Events,
// Repositories, Users) can import this without pulling in AuthModule's own
// dependencies (GithubModule, UsersModule) — and, more importantly,
// without creating a cycle: AuthModule depends on UsersModule, so
// UsersModule can't depend back on AuthModule for its own guarded routes.
const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_SECRET'),
    signOptions: { expiresIn: '7d' },
  }),
});

@Module({
  imports: [jwtModule],
  providers: [JwtAuthGuard, OptionalJwtGuard],
  exports: [JwtAuthGuard, OptionalJwtGuard, jwtModule],
})
export class JwtGuardsModule {}
