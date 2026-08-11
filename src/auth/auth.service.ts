import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GithubApiService } from '../github/github-api.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

// `admin:repo_hook` alone only manages webhooks on repos the token can
// already fully read — it does NOT grant metadata access to *private*
// repos by itself (GitHub 404s private repos rather than revealing they
// exist to an under-scoped token). Since this app needs to support
// private repos, `repo` (full control of private repos) is required —
// GitHub's OAuth Apps have no narrower scope for "read private repo
// metadata + manage its webhooks" than that.
const OAUTH_SCOPE = 'read:user,repo';

export interface JwtPayload {
  sub: string; // User.id
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly githubApiService: GithubApiService,
    private readonly usersService: UsersService,
  ) {}

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GITHUB_OAUTH_CLIENT_ID'),
      redirect_uri: `${this.configService.getOrThrow<string>('APP_BASE_URL')}/auth/github/callback`,
      scope: OAUTH_SCOPE,
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{ user: User; token: string }> {
    const accessToken = await this.githubApiService.exchangeCodeForToken(code);
    const githubUser = await this.githubApiService.getAuthenticatedUser(accessToken);
    const user = await this.usersService.upsertFromGithub(githubUser, accessToken);
    const token = this.jwtService.sign({ sub: user.id } satisfies JwtPayload);
    return { user, token };
  }
}
