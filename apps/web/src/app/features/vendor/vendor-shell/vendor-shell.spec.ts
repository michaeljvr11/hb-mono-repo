import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';

import { VendorShell } from './vendor-shell';
import { AuthService } from '../../../core/auth/auth.service';

interface AuthServiceStub {
  currentUser$: Observable<unknown>;
  logout: ReturnType<typeof vi.fn>;
}

describe('VendorShell', () => {
  let component: VendorShell;
  let fixture: ComponentFixture<VendorShell>;
  let authService: AuthServiceStub;

  beforeEach(async () => {
    authService = {
      currentUser$: of(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [VendorShell],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorShell);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all four nav labels', () => {
    const labels = ['Dashboard', 'Products', 'Orders', 'Profile'];
    const el: HTMLElement = fixture.nativeElement;
    for (const label of labels) {
      expect(el.textContent).toContain(label);
    }
  });

  it('shows the wordmark and Vendor Portal badge in the top bar', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('H&B Market');
    expect(el.textContent).toContain('Vendor Portal');
  });

  it('toggles sidebar open and closed', () => {
    expect(component.sidebarOpen()).toBe(false);
    component.toggleSidebar();
    expect(component.sidebarOpen()).toBe(true);
    component.toggleSidebar();
    expect(component.sidebarOpen()).toBe(false);
  });

  it('closeSidebar() sets sidebarOpen to false', () => {
    component.toggleSidebar(); // open it
    component.closeSidebar();
    expect(component.sidebarOpen()).toBe(false);
  });

  it('calls AuthService.logout() when signOut() is invoked', () => {
    component.signOut();
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('exposes exactly four nav items', () => {
    expect(component.navItems.length).toBe(4);
  });

  it('nav items have the expected paths', () => {
    const paths = component.navItems.map(i => i.path);
    expect(paths).toEqual(['dashboard', 'products', 'orders', 'profile']);
  });
});
