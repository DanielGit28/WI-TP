import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { WebhookEvent } from './entities/webhook-event.entity';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findRecent(@Query('limit') limit?: string): Promise<WebhookEvent[]> {
    return this.eventsService.findRecent(limit ? parseInt(limit, 10) : undefined);
  }
}
