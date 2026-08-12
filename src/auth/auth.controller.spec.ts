import { UnauthorizedException } from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

function makeResponse() {
  const mock = {
    cookie: jest.fn<void, [string, string, CookieOptions]>(),
    clearCookie: jest.fn<void, [string]>(),
    redirect: jest.fn<void, [string]>(),
    json: jest.fn<void, [unknown]>(),
  };
  return { res: mock as unknown as Response, mock };
}

function makeRequest(cookies: Record<string, string> = {}): Request {
  return { cookies } as unknown as Request;
}

describe('AuthController', () => {
  let authService: { buildAuthorizeUrl: jest.Mock; handleCallback: jest.Mock };
  let configService: { get: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    authService = { buildAuthorizeUrl: jest.fn(), handleCallback: jest.fn() };
    configService = { get: jest.fn() };
    controller = new AuthController(
      authService as unknown as AuthService,
      configService as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('sets a state cookie and redirects using that same state', () => {
      authService.buildAuthorizeUrl.mockImplementation(
        (state: string) => `https://github.com/authorize?state=${state}`,
      );
      const { res, mock } = makeResponse();

      controller.login(res);

      const [cookieName, cookieValue, cookieOptions] = mock.cookie.mock.calls[0];
      expect(cookieName).toBe('gh_oauth_state');
      expect(cookieValue).toMatch(/^[0-9a-f]{32}$/);
      expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax' });

      expect(authService.buildAuthorizeUrl).toHaveBeenCalledWith(cookieValue);
      expect(mock.redirect).toHaveBeenCalledWith(`https://github.com/authorize?state=${cookieValue}`);
    });
  });

  describe('callback', () => {
    it('rejects when the code query param is missing', async () => {
      const { res, mock } = makeResponse();
      const req = makeRequest({ gh_oauth_state: 'abc' });

      await expect(
        controller.callback(undefined as unknown as string, 'abc', req, res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.handleCallback).not.toHaveBeenCalled();
      expect(mock.clearCookie).toHaveBeenCalledWith('gh_oauth_state');
    });

    it('rejects when there is no state cookie at all', async () => {
      const { res } = makeResponse();
      const req = makeRequest({}); // no gh_oauth_state cookie

      await expect(controller.callback('code-1', 'abc', req, res)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authService.handleCallback).not.toHaveBeenCalled();
    });

    it('rejects when the query state does not match the cookie state', async () => {
      const { res } = makeResponse();
      const req = makeRequest({ gh_oauth_state: 'expected-state' });

      await expect(
        controller.callback('code-1', 'different-state', req, res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.handleCallback).not.toHaveBeenCalled();
    });

    it('returns the token as JSON when no FRONTEND_URL is configured', async () => {
      const { res, mock } = makeResponse();
      const req = makeRequest({ gh_oauth_state: 'matching-state' });
      authService.handleCallback.mockResolvedValue({ token: 'jwt-token', user: {} });
      configService.get.mockReturnValue(undefined);

      await controller.callback('code-1', 'matching-state', req, res);

      expect(authService.handleCallback).toHaveBeenCalledWith('code-1');
      expect(mock.json).toHaveBeenCalledWith({ token: 'jwt-token' });
      expect(mock.redirect).not.toHaveBeenCalled();
    });

    it('redirects to the frontend with the token when FRONTEND_URL is configured', async () => {
      const { res, mock } = makeResponse();
      const req = makeRequest({ gh_oauth_state: 'matching-state' });
      authService.handleCallback.mockResolvedValue({ token: 'jwt-token', user: {} });
      configService.get.mockReturnValue('https://frontend.example.com');

      await controller.callback('code-1', 'matching-state', req, res);

      expect(mock.redirect).toHaveBeenCalledWith(
        'https://frontend.example.com/auth/callback#token=jwt-token',
      );
      expect(mock.json).not.toHaveBeenCalled();
    });
  });
});
