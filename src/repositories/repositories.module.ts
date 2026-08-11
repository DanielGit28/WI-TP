import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from './entities/repository.entity';
import { RepositoriesService } from './repositories.service';
import { RepositoriesController } from './repositories.controller';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Repository]), GithubModule, UsersModule, AuthModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [TypeOrmModule], // so WebhooksModule/EventsModule can inject the Repository entity repo too
})
export class RepositoriesModule {}
