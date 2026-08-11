import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string | null;
}

export interface GithubRepo {
  id: number;
  full_name: string;
  private: boolean;
  permissions?: { admin?: boolean };
}

export interface GithubWebhook {
  id: number;
}

const GITHUB_API_BASE = 'https://api.github.com';

// owner/repo ultimately come from user-supplied input (POST /repositories
// repoUrl). Encoding each segment keeps them confined to a single path
// segment — an embedded '/', '?', or '#' can't redirect the request to a
// different GitHub API path than the one intended.
function repoPath(owner: string, repo: string): string {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/**
 * Thin wrapper around the handful of GitHub REST/OAuth calls this app
 * needs. Uses Node's built-in global fetch rather than adding an HTTP
 * client dependency (axios/@nestjs/axios) for what's a small, fixed set
 * of calls.
 */
@Injectable()
export class GithubApiService {
  constructor(private readonly configService: ConfigService) {}

  async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.configService.get<string>('GITHUB_OAUTH_CLIENT_ID'),
        client_secret: this.configService.get<string>('GITHUB_OAUTH_CLIENT_SECRET'),
        code,
      }),
    });

    const data = (await response.json()) as { access_token?: string; error?: string };
    if (!response.ok || !data.access_token) {
      throw new InternalServerErrorException(
        `GitHub OAuth token exchange failed: ${data.error ?? response.statusText}`,
      );
    }
    return data.access_token;
  }

  async getAuthenticatedUser(accessToken: string): Promise<GithubUser> {
    return this.get<GithubUser>('/user', accessToken);
  }

  async getRepo(accessToken: string, owner: string, repo: string): Promise<GithubRepo> {
    return this.get<GithubRepo>(`/repos/${repoPath(owner, repo)}`, accessToken);
  }

  async createWebhook(
    accessToken: string,
    owner: string,
    repo: string,
    url: string,
    secret: string,
  ): Promise<GithubWebhook> {
    return this.post<GithubWebhook>(`/repos/${repoPath(owner, repo)}/hooks`, accessToken, {
      name: 'web',
      active: true,
      events: ['*'],
      config: { url, content_type: 'json', secret },
    });
  }

  async deleteWebhook(
    accessToken: string,
    owner: string,
    repo: string,
    hookId: number,
  ): Promise<void> {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${repoPath(owner, repo)}/hooks/${encodeURIComponent(hookId)}`,
      { method: 'DELETE', headers: this.headers(accessToken) },
    );
    if (!response.ok && response.status !== 404) {
      throw new InternalServerErrorException(
        `Failed to delete GitHub webhook: ${response.status} ${response.statusText}`,
      );
    }
  }

  private async get<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: this.headers(accessToken),
    });
    return this.parse<T>(response);
  }

  private async post<T>(path: string, accessToken: string, body: unknown): Promise<T> {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify(body),
    });
    return this.parse<T>(response);
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `GitHub API request failed: ${response.status} ${response.statusText} — ${body}`,
      );
    }
    return response.json() as Promise<T>;
  }
}
