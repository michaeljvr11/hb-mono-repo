import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { GoogleProfile } from './strategies/google.strategy';
import { Public } from '../common/decorators/public.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { resolveRefreshCookieSecurity } from './refresh-cookie';

const REFRESH_COOKIE = 'RefreshToken';

// Shape attached to req.user by the refresh strategy (decoded JWT + cookie token).
interface RefreshPayload {
  sub: string;
  refreshToken: string;
  rememberMe?: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.register(registerDto);
    this.setRefreshCookie(res, tokens.refresh_token, tokens.refresh_max_age_ms);
    return { access_token: tokens.access_token, user: tokens.user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refresh_token, tokens.refresh_max_age_ms);
    return { access_token: tokens.access_token, user: tokens.user };
  }

  @Public()
  @UseGuards(AuthGuard('refresh'))
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @GetUser() user: RefreshPayload,
  ) {
    const { sub, refreshToken, rememberMe } = user;

    const tokens = await this.authService.refreshTokens(sub, refreshToken, !!rememberMe);
    this.setRefreshCookie(res, tokens.refresh_token, tokens.refresh_max_age_ms);
    return { access_token: tokens.access_token, user: tokens.user };
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    // The guard redirects to Google's consent screen; nothing to do here.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@GetUser() profile: GoogleProfile, @Res() res: Response) {
    const tokens = await this.authService.validateOAuthLogin(profile);
    this.setRefreshCookie(res, tokens.refresh_token, tokens.refresh_max_age_ms);
    // Tokens never travel in the URL: the refresh cookie is set above, and the
    // web /auth/callback page exchanges it for an access token via /auth/refresh.
    const webUrl = this.config.get<string>('APP_WEB_URL') || 'http://localhost:4200';
    res.redirect(`${webUrl}/auth/callback`);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@GetUser() user: User) {
    return this.authService.resendVerification(user.id);
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

  private setRefreshCookie(res: Response, refreshToken: string, maxAgeMs: number): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      // httpOnly + secure + sameSite are topology-driven (defaults to 'strict');
      // see resolveRefreshCookieSecurity and the "Auth & Roles" note. Affects
      // every refresh flow — login/register/refresh and Google callback alike.
      ...resolveRefreshCookieSecurity(
        this.config.get<string>('REFRESH_COOKIE_SAMESITE'),
        process.env.NODE_ENV,
      ),
      maxAge: maxAgeMs, // mirrors the refresh JWT expiry (remember-me: 30d, else 24h)
    });
  }
}
