import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminUserDto, SetUserActiveRequest, UpdateUserRoleRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  listUsers(): Observable<AdminUserDto[]> {
    return this.http.get<AdminUserDto[]>(`${this.base}/users`);
  }

  updateUserRole(id: string, data: UpdateUserRoleRequest): Observable<AdminUserDto> {
    return this.http.patch<AdminUserDto>(`${this.base}/users/${id}/role`, data);
  }

  setUserActive(id: string, data: SetUserActiveRequest): Observable<AdminUserDto> {
    return this.http.patch<AdminUserDto>(`${this.base}/users/${id}/active`, data);
  }
}
