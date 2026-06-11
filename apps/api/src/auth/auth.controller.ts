import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

const REFRESH_COOKIE = 'RefreshToken';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.register(registerDto);
    this.setRefreshCookie(res, tokens.refresh_token);
    return { access_token: tokens.access_token, user: tokens.user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refresh_token);
    return { access_token: tokens.access_token, user: tokens.user };
  }

  @Public()
  @UseGuards(AuthGuard('refresh'))
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @GetUser() user: any,
  ) {
    const { refreshToken } = user;

    const tokens = await this.authService.refreshTokens(user.sub, refreshToken);
    this.setRefreshCookie(res, tokens.refresh_token);
    return { access_token: tokens.access_token, user: tokens.user };
  }

  @Post('logout')
  async logout(@GetUser() user: User, @Res({ passthrough: true }) res: Response) {
    await this.usersService.updateRefreshToken(user.id, null);
    res.clearCookie(REFRESH_COOKIE);
    return { message: 'Logged out' };
  }

  @Get('test')
  getTest(@GetUser() user: User) {
    return {
      message: 'You are authenticated!',
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d, matches JWT_REFRESH_EXPIRATION
    });
  }
}
