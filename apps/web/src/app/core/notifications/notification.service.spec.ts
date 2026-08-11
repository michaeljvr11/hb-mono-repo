import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let snackBar: MatSnackBar;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations()],
    });
    service = TestBed.inject(NotificationService);
    snackBar = TestBed.inject(MatSnackBar);
    openSpy = vi.spyOn(snackBar, 'open');
  });

  it('success() opens with the hb-success-snackbar panel class, bottom-center, and returns the ref', () => {
    const ref = service.success('Added to cart.');

    expect(openSpy).toHaveBeenCalledWith('Added to cart.', 'Close', {
      duration: 4000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['hb-success-snackbar'],
    });
    expect(ref).toBeDefined();
  });

  it('info() opens with the hb-info-snackbar panel class, bottom-center', () => {
    service.info('Orders is coming soon.');

    expect(openSpy).toHaveBeenCalledWith('Orders is coming soon.', 'Close', {
      duration: 4000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['hb-info-snackbar'],
    });
  });

  it('error() opens with the hb-error-snackbar panel class, bottom-center, and a longer duration', () => {
    service.error('Could not update your cart.');

    expect(openSpy).toHaveBeenCalledWith('Could not update your cart.', 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['hb-error-snackbar'],
    });
  });

  it('accepts a custom action label (needed for "View cart" / "View wishlist" actions)', () => {
    service.success('Added to cart.', 'View cart');

    expect(openSpy).toHaveBeenCalledWith('Added to cart.', 'View cart', expect.anything());
  });

  it('returns the MatSnackBarRef so callers can chain .onAction()', () => {
    const ref = service.success('Added to cart.', 'View cart');

    expect(typeof ref.onAction).toBe('function');
  });
});
