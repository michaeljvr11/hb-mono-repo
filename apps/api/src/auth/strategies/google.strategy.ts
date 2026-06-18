import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  email?: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    // Fall back to placeholders when unset so the app still boots without Google
    // credentials configured — the /auth/google route simply won't complete a
    // real sign-in until GOOGLE_CLIENT_ID/SECRET are provided (mirrors MailService).
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'google-client-id-not-set',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'google-client-secret-not-set',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });

    if (!config.get<string>('GOOGLE_CLIENT_ID')) {
      new Logger(GoogleStrategy.name).warn(
        'GOOGLE_CLIENT_ID is not set — /auth/google will not complete a real sign-in.',
      );
    }
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const user: GoogleProfile = {
      email: profile.emails?.[0]?.value,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
    };
    done(null, user);
  }
}
