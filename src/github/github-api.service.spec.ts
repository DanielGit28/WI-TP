import { InternalServerErrorException } from '@nestjs/common';
import { GithubApiService } from './github-api.service';

function mockFetchResponse(overrides: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    ...overrides,
  } as Response;
}

describe('GithubApiService', () => {
  let configService: { get: jest.Mock };
  let service: GithubApiService;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    configService = { get: jest.fn() };
    service = new GithubApiService(configService as any);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getRepo', () => {
    it('URL-encodes owner/repo so they cannot break out of their path segment', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ json: () => Promise.resolve({ id: 1, full_name: 'x/y', private: false }) }),
      );

      // Not a realistic GitHub owner/repo name, but proves the encoding
      // happens regardless of what upstream validation would normally
      // reject — defense in depth at the actual HTTP call site.
      await service.getRepo('token', 'weird owner', 'repo/with/slashes');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://api.github.com/repos/weird%20owner/repo%2Fwith%2Fslashes',
      );
    });

    it('throws with the response status and body when GitHub returns a non-2xx', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('{"message":"Not Found"}'),
        }),
      );

      await expect(service.getRepo('token', 'octocat', 'missing-repo')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('createWebhook', () => {
    it('posts the expected hook config to the repo hooks endpoint', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ json: () => Promise.resolve({ id: 42 }) }));

      const result = await service.createWebhook(
        'token',
        'octocat',
        'hello-world',
        'https://app.example.com/webhooks/github',
        'the-secret',
      );

      expect(result).toEqual({ id: 42 });
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/octocat/hello-world/hooks');
      const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(body).toMatchObject({
        config: {
          url: 'https://app.example.com/webhooks/github',
          content_type: 'json',
          secret: 'the-secret',
        },
      });
    });
  });

  describe('deleteWebhook', () => {
    it('treats a 404 as success (already gone)', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: false, status: 404 }));

      await expect(
        service.deleteWebhook('token', 'octocat', 'hello-world', 42),
      ).resolves.toBeUndefined();
    });

    it('throws on other non-2xx statuses', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: false, status: 500 }));

      await expect(
        service.deleteWebhook('token', 'octocat', 'hello-world', 42),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('returns the access token on success', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ json: () => Promise.resolve({ access_token: 'gho_abc123' }) }),
      );

      await expect(service.exchangeCodeForToken('code-1')).resolves.toBe('gho_abc123');
    });

    it('throws when GitHub returns an error instead of a token', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ json: () => Promise.resolve({ error: 'bad_verification_code' }) }),
      );

      await expect(service.exchangeCodeForToken('bad-code')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
