import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';

import { AdminShell } from './admin-shell';
import { AuthService } from '../../../core/auth/auth.service';

interface AuthServiceStub {
  currentUser$: Observable<unknown>;
  logout: ReturnType<typeof vi.fn>;
}

describe('AdminShell', () => {
  let component: AdminShell;
  let fixture: ComponentFixture<AdminShell>;
  let authService: AuthServiceStub;

  beforeEach(async () => {
    authService = {
      currentUser$: of(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminShell);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all six nav labels', () => {
    const labels = ['Dashboard', 'Vendors', 'Catalog', 'Users', 'Orders', 'Logs'];
    const el: HTMLElement = fixture.nativeElement;
    for (const label of labels) {
      expect(el.textContent).toContain(label);
    }
  });

  it('shows the wordmark and Admin Console badge in the top bar', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('H&B E-Commerce');
    expect(el.textContent).toContain('Admin Console');
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

  it('exposes exactly eleven nav items', () => {
    expect(component.navItems.length).toBe(11);
  });

  it('nav items have the expected paths', () => {
    const paths = component.navItems.map(i => i.path);
    expect(paths).toEqual(['dashboard', 'vendors', 'catalog', 'users', 'orders', 'search-synonyms', 'commission-rates', 'shipping-fee', 'earnings', 'logs', 'settings']);
  });
});
