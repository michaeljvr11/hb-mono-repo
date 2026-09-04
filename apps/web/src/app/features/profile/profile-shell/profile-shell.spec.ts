import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';

import { ProfileShell } from './profile-shell';
import { AuthService } from '../../../core/auth/auth.service';

interface AuthServiceStub {
  currentUser$: Observable<unknown>;
  logout: ReturnType<typeof vi.fn>;
}

describe('ProfileShell', () => {
  let component: ProfileShell;
  let fixture: ComponentFixture<ProfileShell>;
  let authService: AuthServiceStub;

  beforeEach(async () => {
    authService = {
      currentUser$: of(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ProfileShell],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileShell);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all three nav labels', () => {
    const labels = ['Details', 'Orders', 'Addresses'];
    const el: HTMLElement = fixture.nativeElement;
    for (const label of labels) {
      expect(el.textContent).toContain(label);
    }
  });

  it('shows the wordmark and My Account badge in the top bar', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('H&B E-Commerce');
    expect(el.textContent).toContain('My Account');
  });

  it('links the wordmark to the storefront', () => {
    const el: HTMLElement = fixture.nativeElement;
    const wordmark = el.querySelector('a.wordmark');
    expect(wordmark?.getAttribute('href')).toBe('/shop');
    expect(wordmark?.getAttribute('aria-label')).toBe('H&B E-Commerce storefront home');
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

  it('exposes exactly three nav items', () => {
    expect(component.navItems.length).toBe(3);
  });

  it('nav items have the expected paths', () => {
    const paths = component.navItems.map(i => i.path);
    expect(paths).toEqual(['details', 'orders', 'addresses']);
  });
});
