import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import {
  AuthResponse,
  AuthUser,
  ForgotPasswordRequest,
  LoginRequest,
  LogoutResponse,
  MessageResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UserDto,
  UserRole,
  VerifyEmailRequest,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly API_URL = environment.apiBaseUrl;
  private readonly ACCESS_TOKEN_KEY = 'access_token';
  // SSR: no localStorage on the server — storage access is platform-guarded.
  private readonly platformId = inject(PLATFORM_ID);
  private currentUserSubject = new BehaviorSubject<AuthUser | UserDto | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    this.loadUserFromStorage();
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.API_URL}/auth/login`, credentials, { withCredentials: true })
      .pipe(tap((response) => this.handleAuthentication(response)));
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.API_URL}/auth/register`, data, { withCredentials: true })
      .pipe(tap((response) => this.handleAuthentication(response)));
  }

  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.API_URL}/auth/refresh`, {}, { withCredentials: true })
      .pipe(tap((response) => this.handleAuthentication(response)));
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    const body: ForgotPasswordRequest = { email };
    return this.http.post<MessageResponse>(`${this.API_URL}/auth/forgot-password`, body);
  }

  resetPassword(token: string, password: string): Observable<MessageResponse> {
    const body: ResetPasswordRequest = { token, password };
    return this.http.post<MessageResponse>(`${this.API_URL}/auth/reset-password`, body);
  }

  verifyEmail(token: string): Observable<MessageResponse> {
    const body: VerifyEmailRequest = { token };
    return this.http.post<MessageResponse>(`${this.API_URL}/auth/verify-email`, body);
  }

  resendVerification(): Observable<MessageResponse> {
    // Authenticated — the auth interceptor attaches the access token.
    return this.http.post<MessageResponse>(
      `${this.API_URL}/auth/resend-verification`,
      {},
      { withCredentials: true },
    );
  }

  logout(): void {
    const clearSession = () => {
      if (this.isBrowser()) {
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
      }
      this.currentUserSubject.next(null);
      this.router.navigate(['/login']);
    };

    if (!this.getToken()) {
      clearSession();
      return;
    }

    this.http
      .post<LogoutResponse>(`${this.API_URL}/auth/logout`, {}, { withCredentials: true })
      .subscribe({
        next: clearSession,
        error: clearSession,
      });
  }

  getToken(): string | null {
    return this.isBrowser() ? localStorage.getItem(this.ACCESS_TOKEN_KEY) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  hasRole(role: UserRole): boolean {
    return this.currentUserSubject.value?.role === role;
  }

  hasAnyRole(roles: UserRole[]): boolean {
    const currentRole = this.currentUserSubject.value?.role;
    return currentRole ? roles.includes(currentRole) : false;
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private handleAuthentication(response: AuthResponse): void {
    if (this.isBrowser()) {
      localStorage.setItem(this.ACCESS_TOKEN_KEY, response.access_token);
    }
    this.currentUserSubject.next(response.user);
  }

  private loadUserFromStorage(): void {
    if (!this.getToken()) {
      return;
    }

    this.http.get<UserDto>(`${this.API_URL}/users/me`).subscribe({
      next: (user) => this.currentUserSubject.next(user),
      error: () => this.logout(),
    });
  }
}
