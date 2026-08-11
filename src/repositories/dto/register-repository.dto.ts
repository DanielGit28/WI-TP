import { IsString, IsNotEmpty } from 'class-validator';

export class RegisterRepositoryDto {
  @IsString()
  @IsNotEmpty()
  repoUrl!: string; // accepts 'owner/repo' or a full github.com URL
}
