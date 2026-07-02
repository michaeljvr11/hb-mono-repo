import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Profile, Strategy, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';
import { CookieOAuthStateStore } from './cookie-oauth-state.store';

export interface GoogleProfile {
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    // Fall back to placeholders when unset so the app still boots without Google
    // credentials configured — the /auth/google route simply won't complete a
    // real sign-in until GOOGLE_CLIENT_ID/SECRET are provided (mirrors MailService).
    const options: StrategyOptions = {
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'google-client-id-not-set',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'google-client-secret-not-set',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    };

    // CSRF protection for the OAuth handshake (see docs/security M2). A cookie-backed
    // state store avoids requiring express-session; the callback rejects any response
    // whose `state` doesn't match the cookie set at initiation. passport-oauth2
    // dispatches store/verify on argument arity (store=2, verify=3), which is the
    // correct runtime contract but narrower than the overloaded StateStore type —
    // hence the unknown cast.
    super({
      ...options,
      store: new CookieOAuthStateStore(config.get<string>('NODE_ENV') === 'production'),
    } as unknown as StrategyOptions);

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
    // Google returns per-address verification; treat the login as verified only
    // when Google says so (see docs/security M2). Enforcement lives in
    // AuthService.validateOAuthLogin so it's covered by the auth unit tests.
    const emails = profile.emails as
      | ReadonlyArray<{ value: string; verified?: boolean }>
      | undefined;
    const rawJson = profile._json as { email_verified?: boolean } | undefined;
    const primaryEmail = emails?.[0];

    const user: GoogleProfile = {
      email: primaryEmail?.value,
      emailVerified: primaryEmail?.verified === true || rawJson?.email_verified === true,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
    };
    done(null, user);
  }
}
