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

// Explicit field whitelist rather than Omit<Repository, 'webhookSecret'>
// — an Omit still carries `owner: User` in its type, which would let a
// decrypted accessToken (the `from` transformer runs on hydration) ride
// along in the response the moment anything eager-loads that relation.
// webhookSecret itself never leaves this service either way — it's only
// used internally by GithubSignatureGuard to verify deliveries.
type PublicRepository = Pick<
  Repository,
  'id' | 'ownerUserId' | 'githubRepoId' | 'fullName' | 'visibility' | 'webhookId' | 'createdAt'
>;

function toPublicRepository(repository: Repository): PublicRepository {
  const { id, ownerUserId, githubRepoId, fullName, visibility, webhookId, createdAt } =
    repository;
  return { id, ownerUserId, githubRepoId, fullName, visibility, webhookId, createdAt };
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
