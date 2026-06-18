import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { getRequiredConfig } from '../../common/config/config.utils';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request): string | null =>
          (request?.cookies as Record<string, string> | undefined)?.['RefreshToken'] ?? null,
      ]),
      secretOrKey: getRequiredConfig(config, 'JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: { sub: string; email: string; role: string },
  ): { sub: string; email: string; role: string; refreshToken: string } {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.['RefreshToken'];
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

    return { ...payload, refreshToken };
  }
}
