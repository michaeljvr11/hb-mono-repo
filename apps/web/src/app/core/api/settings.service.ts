import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PlatformSettingsDto, UpdatePlatformSettingsRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/settings`;

  get(): Observable<PlatformSettingsDto> {
    return this.http.get<PlatformSettingsDto>(this.base);
  }

  update(data: UpdatePlatformSettingsRequest): Observable<PlatformSettingsDto> {
    return this.http.patch<PlatformSettingsDto>(this.base, data);
  }
}
