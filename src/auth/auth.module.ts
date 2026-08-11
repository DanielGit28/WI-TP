import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';

// Kept as a reference so it can be re-exported below — modules that import
// AuthModule for JwtAuthGuard/OptionalJwtGuard need JwtService visible too,
// since @UseGuards(SomeGuard) instantiates the guard via the *consuming*
// module's injector, not the module the guard class was declared in.
const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_SECRET'),
    signOptions: { expiresIn: '7d' },
  }),
});

@Module({
  imports: [GithubModule, UsersModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtGuard],
  exports: [JwtAuthGuard, OptionalJwtGuard, jwtModule],
})
export class AuthModule {}
