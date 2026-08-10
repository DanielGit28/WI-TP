import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventsService, EventTypeCount } from './events.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { FindEventsDto } from './dto/find-events.dto';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findEvents(@Query() query: FindEventsDto): Promise<WebhookEvent[]> {
    return this.eventsService.findEvents(query);
  }

  @Get('stats')
  getStats(): Promise<EventTypeCount[]> {
    return this.eventsService.getStats();
  }
}
