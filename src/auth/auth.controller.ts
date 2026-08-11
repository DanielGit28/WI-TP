import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

const STATE_COOKIE = 'gh_oauth_state';
const STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

@ApiTags('auth')
@Controller('auth/github')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Not documented in Swagger — it's a browser redirect flow, not a JSON API call.
  @ApiExcludeEndpoint()
  @Get()
  login(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: STATE_COOKIE_MAX_AGE_MS,
    });
    res.redirect(this.authService.buildAuthorizeUrl(state));
  }

  @ApiExcludeEndpoint()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expectedState: string | undefined = (req.cookies as Record<string, string>)?.[
      STATE_COOKIE
    ];
    res.clearCookie(STATE_COOKIE);

    // Guards against login CSRF: without this, an attacker could trick a
    // victim's browser into completing an OAuth flow initiated by the
    // attacker, linking the victim's session to the attacker's GitHub
    // account.
    if (!code || !state || !expectedState || state !== expectedState) {
      throw new UnauthorizedException('Invalid or missing OAuth state');
    }

    const { token } = await this.authService.handleCallback(code);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (frontendUrl) {
      res.redirect(`${frontendUrl}/auth/callback#token=${token}`);
      return;
    }

    // No frontend configured yet — hand the token back directly so the
    // flow is testable from a browser on its own.
    res.json({ token });
  }
}
