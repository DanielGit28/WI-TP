import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { GithubUser } from '../github/github-api.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Called after every OAuth login — keeps login/avatar/token fresh even
  // if the user already had an account from a previous login.
  async upsertFromGithub(githubUser: GithubUser, accessToken: string): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { githubId: githubUser.id },
    });

    const user = existing ?? this.usersRepository.create({ githubId: githubUser.id });
    user.githubLogin = githubUser.login;
    user.avatarUrl = githubUser.avatar_url;
    user.accessToken = accessToken;

    return this.usersRepository.save(user);
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }
}
