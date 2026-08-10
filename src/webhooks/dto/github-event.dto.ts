import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * GitHub's payload shape differs by event type (push vs pull_request vs
 * issues, etc.), so we don't lock down every field. Instead we validate
 * the handful of fields we actually rely on downstream, and let
 * everything else pass through untouched into the raw payload column.
 */
export class GithubEventDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsObject()
  repository?: { full_name?: string; [key: string]: unknown };

  @IsOptional()
  @IsObject()
  sender?: { login?: string; [key: string]: unknown };

  // Index signature lets the rest of GitHub's payload through so it can
  // still be stored in full, even though we don't validate its shape.
  [key: string]: unknown;
}
