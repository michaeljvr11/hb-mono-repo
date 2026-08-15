import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UpdatePlatformSettingsRequest } from '@hb/shared';
import { SettingsService } from '../../../../core/api/settings.service';

const MAX_EMAILS = 50;
// Convenience client-side shape check only — the server (@IsEmail) is the authority.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss',
})
export class AdminSettings implements OnInit {
  private readonly settingsService = inject(SettingsService);

  readonly emails = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** New-address input field. */
  readonly newEmail = signal<string>('');
  /** Inline error for the add-address control. */
  readonly addError = signal<string | null>(null);

  /** In-flight save guard for the "Save changes" action. */
  readonly pending = signal(false);
  /** Inline error near the save action — client-side or server-rejected (e.g. 400). */
  readonly saveError = signal<string | null>(null);
  /** Success confirmation shown after a save completes. */
  readonly saveSuccess = signal(false);

  readonly maxEmails = MAX_EMAILS;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.settingsService.get().subscribe({
      next: (data) => {
        this.emails.set(data.notificationEmails);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load platform settings. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  addEmail(): void {
    this.addError.set(null);
    this.saveSuccess.set(false);

    const value = this.newEmail().trim().toLowerCase();
    if (!value) {
      this.addError.set('Enter an email address.');
      return;
    }
    if (!EMAIL_RE.test(value)) {
      this.addError.set('Enter a valid email address.');
      return;
    }
    if (this.emails().includes(value)) {
      this.addError.set('That address is already in the list.');
      return;
    }
    if (this.emails().length >= MAX_EMAILS) {
      this.addError.set(`You can add up to ${MAX_EMAILS} addresses.`);
      return;
    }

    this.emails.update(list => [...list, value]);
    this.newEmail.set('');
  }

  removeEmail(email: string): void {
    this.saveSuccess.set(false);
    this.emails.update(list => list.filter(e => e !== email));
  }

  save(): void {
    if (this.pending()) return;

    this.saveError.set(null);
    this.saveSuccess.set(false);

    // PATCH replaces the full list — always send the whole array, never a delta.
    const payload: UpdatePlatformSettingsRequest = { notificationEmails: this.emails() };

    this.pending.set(true);
    this.settingsService.update(payload).subscribe({
      next: (data) => {
        this.emails.set(data.notificationEmails);
        this.pending.set(false);
        this.saveSuccess.set(true);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 400) {
          const rawMessage = err.error?.message;
          const message = typeof rawMessage === 'string'
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(' ')
              : 'One or more addresses are invalid.';
          this.saveError.set(message);
        } else {
          this.saveError.set('Failed to save settings. Please try again.');
        }
        this.pending.set(false);
      },
    });
  }
}
