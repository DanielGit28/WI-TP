import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { GithubSignatureGuard } from './guards/github-signature.guard';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [EventsModule, RepositoriesModule],
  controllers: [WebhooksController],
  providers: [GithubSignatureGuard],
})
export class WebhooksModule {}
