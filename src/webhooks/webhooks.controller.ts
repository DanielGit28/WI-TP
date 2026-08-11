import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Headers,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventsService } from '../events/events.service';
import { GithubEventDto } from './dto/github-event.dto';
import { GithubSignatureGuard } from './guards/github-signature.guard';
import { RequestWithGithubDelivery } from './guards/github-signature.guard';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly eventsService: EventsService) {}

  @Post('github')
  @UseGuards(GithubSignatureGuard) // runs before the body is even validated — no point
  // validating/transforming a payload from a caller who isn't verified.
  @HttpCode(200) // GitHub expects a 2xx to consider the delivery successful.
  async handleGithubWebhook(
    @Headers('x-github-event') eventType: string,
    @Headers('x-github-delivery') deliveryId: string,
    @Body() payload: GithubEventDto,
    @Req() request: RequestWithGithubDelivery,
  ) {
    if (!eventType || !deliveryId) {
      throw new BadRequestException(
        'Missing required X-GitHub-Event or X-GitHub-Delivery header',
      );
    }

    // Set by GithubSignatureGuard, which already looked this repo up to
    // pick the right secret — no need to query it again here.
    const repositoryId = request.repository?.id ?? null;

    const result = await this.eventsService.ingestGithubEvent(
      deliveryId,
      eventType,
      payload,
      repositoryId,
    );

    this.logger.log(`${eventType} webhook -> ${result.status}`);
    return { received: true, ...result };
  }
}
