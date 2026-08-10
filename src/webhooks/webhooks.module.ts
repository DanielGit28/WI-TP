import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GithubSignatureGuard } from './guards/github-signature.guard';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [EventsModule],
  controllers: [WebhooksController],
  providers: [GithubSignatureGuard],
})
export class WebhooksModule {}
