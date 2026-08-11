import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuardsModule } from './jwt-guards.module';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [GithubModule, UsersModule, JwtGuardsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
