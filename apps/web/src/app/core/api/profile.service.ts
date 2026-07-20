import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChangePasswordRequest, UpdateProfileRequest, UserDto } from '@hb/shared';
import { environment } from '../../../environments/environment';

/** Self-service profile client — the authenticated user acting on their own account. */
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/users/me`;

  getMe(): Observable<UserDto> {
    return this.http.get<UserDto>(this.API_URL);
  }

  updateProfile(data: UpdateProfileRequest): Observable<UserDto> {
    return this.http.patch<UserDto>(this.API_URL, data);
  }

  changePassword(data: ChangePasswordRequest): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.API_URL}/password`, data);
  }
}
