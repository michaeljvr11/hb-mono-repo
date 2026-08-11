import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { RadialNav } from './radial-nav';

describe('RadialNav', () => {
  let fixture: ComponentFixture<RadialNav>;
  let component: RadialNav;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RadialNav],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RadialNav);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('starts collapsed', async () => {
    await setup();
    expect(component.open()).toBe(false);
    expect(fixture.nativeElement.querySelector('.radial-nav').classList.contains('radial-nav--open')).toBe(false);
  });

  it('expands when the FAB is clicked, and collapses on a second click', async () => {
    await setup();
    const fab = fixture.nativeElement.querySelector('.radial-nav__fab') as HTMLButtonElement;

    fab.click();
    fixture.detectChanges();
    expect(component.open()).toBe(true);
    expect(fixture.nativeElement.querySelector('.radial-nav').classList.contains('radial-nav--open')).toBe(true);

    fab.click();
    fixture.detectChanges();
    expect(component.open()).toBe(false);
  });

  it('collapses when the scrim (backdrop) is clicked', async () => {
    await setup();
    component.toggle();
    fixture.detectChanges();
    expect(component.open()).toBe(true);

    const scrim = fixture.nativeElement.querySelector('.radial-nav__scrim') as HTMLElement;
    scrim.click();
    fixture.detectChanges();

    expect(component.open()).toBe(false);
  });

  it('collapses on Escape', async () => {
    await setup();
    component.toggle();
    fixture.detectChanges();
    expect(component.open()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.open()).toBe(false);
  });

  it('renders Home, Search, Profile, and Wishlist as routerLinks to /shop, /discover, /profile, and /wishlist', async () => {
    await setup();
    const links = fixture.nativeElement.querySelectorAll('a.radial-nav__item');
    const hrefs = Array.from(links).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    expect(hrefs).toContain('/shop');
    expect(hrefs).toContain('/discover');
    expect(hrefs).toContain('/profile');
    expect(hrefs).toContain('/wishlist');
  });

  it('emits itemSelected for non-routed items (orders/cart) and collapses', async () => {
    await setup();
    const spy = vi.fn();
    component.itemSelected.subscribe(spy);
    component.toggle();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button.radial-nav__item');
    const cartButton = Array.from(buttons).find(
      (b) => (b as HTMLElement).getAttribute('aria-label') === 'Cart',
    ) as HTMLButtonElement;

    cartButton.click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('cart');
    expect(component.open()).toBe(false);
  });

  it('does not emit itemSelected for the wishlist item — it navigates via routerLink instead', async () => {
    // Exercised via selectItem() directly rather than a real anchor click:
    // clicking a routerLink anchor triggers async navigation that can outlive
    // the test's TestBed teardown (NG0205 in an unrelated later test).
    await setup();
    const spy = vi.fn();
    component.itemSelected.subscribe(spy);

    const wishlistItem = component.positionedItems().find((item) => item.id === 'wishlist');
    expect(wishlistItem?.routerLink).toBe('/wishlist');

    component.selectItem(wishlistItem!);

    expect(spy).not.toHaveBeenCalled();
  });

  // ── Wishlist badge ───────────────────────────────────────────────────────

  it('renders the wishlist badge when wishlistCount > 0', async () => {
    await setup();
    fixture.componentRef.setInput('wishlistCount', 3);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.radial-nav__item');
    const wishlistLink = Array.from(links).find(
      (a) => (a as HTMLElement).getAttribute('aria-label') === 'Wishlist',
    ) as HTMLElement;

    const badge = wishlistLink.querySelector('.radial-nav__badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('3');
  });

  it('hides the wishlist badge when wishlistCount is 0', async () => {
    await setup();
    fixture.componentRef.setInput('wishlistCount', 0);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.radial-nav__item');
    const wishlistLink = Array.from(links).find(
      (a) => (a as HTMLElement).getAttribute('aria-label') === 'Wishlist',
    ) as HTMLElement;

    expect(wishlistLink.querySelector('.radial-nav__badge')).toBeNull();
  });

  it('marks the active item per the active input', async () => {
    await setup();
    fixture.componentRef.setInput('active', 'search');
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.radial-nav__item');
    const searchLink = Array.from(links).find(
      (a) => (a as HTMLElement).getAttribute('aria-label') === 'Search',
    ) as HTMLElement;

    expect(searchLink.classList.contains('radial-nav__item--active')).toBe(true);
  });

  it('defaults to home as the active item', async () => {
    await setup();
    const links = fixture.nativeElement.querySelectorAll('a.radial-nav__item');
    const homeLink = Array.from(links).find(
      (a) => (a as HTMLElement).getAttribute('aria-label') === 'Home',
    ) as HTMLElement;

    expect(homeLink.classList.contains('radial-nav__item--active')).toBe(true);
  });
});
