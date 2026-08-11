import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventsService, EventTypeCount } from './events.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { FindEventsDto } from './dto/find-events.dto';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUserId } from '../auth/decorators/current-user-id.decorator';

@ApiTags('events')
@UseGuards(OptionalJwtGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findEvents(
    @Query() query: FindEventsDto,
    @CurrentUserId() userId?: string,
  ): Promise<WebhookEvent[]> {
    return this.eventsService.findEvents(query, userId);
  }

  @Get('stats')
  getStats(@CurrentUserId() userId?: string): Promise<EventTypeCount[]> {
    return this.eventsService.getStats(userId);
  }
}
