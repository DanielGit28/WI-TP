import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RepositoriesService } from './repositories.service';
import { RegisterRepositoryDto } from './dto/register-repository.dto';
import { Repository } from './entities/repository.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user-id.decorator';

// webhookSecret never leaves this service — it's only used internally by
// GithubSignatureGuard to verify deliveries.
type PublicRepository = Omit<Repository, 'webhookSecret'>;

function toPublicRepository(repository: Repository): PublicRepository {
  const { id, ownerUserId, owner, githubRepoId, fullName, visibility, webhookId, createdAt } =
    repository;
  return { id, ownerUserId, owner, githubRepoId, fullName, visibility, webhookId, createdAt };
}

@ApiTags('repositories')
@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  async register(
    @CurrentUserId() userId: string,
    @Body() dto: RegisterRepositoryDto,
  ): Promise<PublicRepository> {
    const repository = await this.repositoriesService.register(userId, dto.repoUrl);
    return toPublicRepository(repository);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    return this.repositoriesService.remove(userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async findMine(@CurrentUserId() userId: string): Promise<PublicRepository[]> {
    const repositories = await this.repositoriesService.findMine(userId);
    return repositories.map(toPublicRepository);
  }

  @Get('public')
  async findPublic(): Promise<PublicRepository[]> {
    const repositories = await this.repositoriesService.findPublic();
    return repositories.map(toPublicRepository);
  }
}
