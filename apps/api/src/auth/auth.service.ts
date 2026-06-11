import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, ...rest } = registerDto;

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const user = await this.usersService.create({
      email,
      password,
      ...rest,
    });

    // Same flow as login: issue both tokens and persist the refresh hash,
    // so a freshly registered user gets a working session immediately.
    return this.getTokensAndUpdateRefresh(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.getTokensAndUpdateRefresh(user);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findOneFull(userId);
    if (!user || !user.currentRefreshToken) {
      throw new ForbiddenException('Access denied');
    }

    const refreshMatches = await bcrypt.compare(refreshToken, user.currentRefreshToken);
    if (!refreshMatches) {
      throw new ForbiddenException('Invalid refresh token');
    }

    // Rotation: issue new pair, invalidate old
    return this.getTokensAndUpdateRefresh(user);
  }

  private async getTokensAndUpdateRefresh(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRATION'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRATION'),
    });

    const hashedRefresh = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, hashedRefresh);

    return {
      access_token: accessToken,
      refresh_token: refreshToken, // sent once; controller moves it into an httpOnly cookie
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // Helper for strategies/guards
  async validateUser(payload: any): Promise<User> {
    const user = await this.usersService.findOneFull(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
