import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from './entities/webhook-event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtGuardsModule } from '../auth/jwt-guards.module';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), JwtGuardsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
