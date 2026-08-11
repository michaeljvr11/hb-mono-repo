import { Injectable, inject } from '@angular/core';
import {
  MatSnackBar,
  MatSnackBarConfig,
  MatSnackBarRef,
  TextOnlySnackBar,
} from '@angular/material/snack-bar';

type NotificationSeverity = 'success' | 'info' | 'error';

/**
 * Bottom-center, per the Material spec — this placement can never overlap
 * the sticky nav bar (top) or the PDP sticky add-to-cart bar / mobile
 * radial nav (both fixed at the bottom but inset from the edges; the CDK
 * overlay container renders at z-index 1000, well above both).
 */
const DEFAULT_CONFIG: MatSnackBarConfig = {
  duration: 4000,
  horizontalPosition: 'center',
  verticalPosition: 'bottom',
};

/** Panel classes are defined once in styles.scss (rendered at the CDK overlay root). */
const SEVERITY_CONFIG: Record<NotificationSeverity, MatSnackBarConfig> = {
  success: { panelClass: ['hb-success-snackbar'] },
  info: { panelClass: ['hb-info-snackbar'] },
  // Errors get a longer read time — matches the duration most existing
  // error toasts already used before this service existed.
  error: { panelClass: ['hb-error-snackbar'], duration: 5000 },
};

/**
 * Single owner of `MatSnackBarConfig` (position, duration, panel class) —
 * no call site should pass those inline. Returns the `MatSnackBarRef` so
 * callers that need `.onAction()` (e.g. "View cart") keep working.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string, action = 'Close'): MatSnackBarRef<TextOnlySnackBar> {
    return this.open(message, action, 'success');
  }

  info(message: string, action = 'Close'): MatSnackBarRef<TextOnlySnackBar> {
    return this.open(message, action, 'info');
  }

  error(message: string, action = 'Close'): MatSnackBarRef<TextOnlySnackBar> {
    return this.open(message, action, 'error');
  }

  private open(
    message: string,
    action: string,
    severity: NotificationSeverity,
  ): MatSnackBarRef<TextOnlySnackBar> {
    return this.snackBar.open(message, action, {
      ...DEFAULT_CONFIG,
      ...SEVERITY_CONFIG[severity],
    });
  }
}
