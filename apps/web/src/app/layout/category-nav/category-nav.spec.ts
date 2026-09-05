import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { CategoryDto } from '@hb/shared';

import { BAR_LIMIT, CategoryNav, HOVER_INTENT_MS, LEAVE_GRACE_MS } from './category-nav';
import { CategoryNavState, CategoryNavStore } from './category-nav.store';

describe('CategoryNav', () => {
  let fixture: ComponentFixture<CategoryNav>;
  let component: CategoryNav;
  let storeStub: {
    categories: ReturnType<typeof signal<CategoryDto[]>>;
    state: ReturnType<typeof signal<CategoryNavState>>;
    load: ReturnType<typeof vi.fn>;
  };

  const flat: CategoryDto[] = [
    { id: 'c3', name: 'Health & Beauty', displayOrder: 2, description: 'Natural wellness.' },
    { id: 'c1', name: 'Agriculture', displayOrder: 0 },
    { id: 'c4', name: 'Textiles', displayOrder: 3 },
    { id: 'c2', name: 'Handicrafts', displayOrder: 1 },
  ];

  const nested: CategoryDto[] = [
    { id: 'p1', name: 'Food', displayOrder: 0 },
    { id: 'p2', name: 'Crafts', displayOrder: 1 },
    { id: 'k1', name: 'Honey', displayOrder: 0, parentId: 'p1' },
    { id: 'k2', name: 'Rooibos', displayOrder: 1, parentId: 'p1' },
    { id: 'k3', name: 'Beadwork', displayOrder: 0, parentId: 'p2' },
    { id: 'orphan', name: 'Orphan', displayOrder: 5, parentId: 'missing' },
  ];

  async function setup(categories: CategoryDto[], state: CategoryNavState = 'loaded'): Promise<void> {
    storeStub = {
      categories: signal<CategoryDto[]>(categories),
      state: signal<CategoryNavState>(state),
      load: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [CategoryNav],
      providers: [provideRouter([]), { provide: CategoryNavStore, useValue: storeStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(CategoryNav);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement;
  }

  function trigger(): HTMLButtonElement {
    return el().querySelector('.category-nav__trigger') as HTMLButtonElement;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the store to load on construction', async () => {
    await setup(flat);
    expect(storeStub.load).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while loading, on error, or when the list is empty', async () => {
    await setup(flat, 'loading');
    expect(el().querySelector('.category-nav')).toBeNull();

    storeStub.state.set('error');
    fixture.detectChanges();
    expect(el().querySelector('.category-nav')).toBeNull();

    storeStub.categories.set([]);
    storeStub.state.set('loaded');
    fixture.detectChanges();
    expect(el().querySelector('.category-nav')).toBeNull();
  });

  it('renders the bar links in displayOrder, each pointing at /discover?categoryId=', async () => {
    await setup(flat);
    const links = Array.from(el().querySelectorAll('a.category-nav__link')) as HTMLAnchorElement[];
    expect(links.map((l) => l.textContent?.trim())).toEqual([
      'Agriculture',
      'Handicrafts',
      'Health & Beauty',
      'Textiles',
    ]);
    expect(links[0].getAttribute('href')).toBe('/discover?categoryId=c1');
  });

  it('caps the bar at BAR_LIMIT top-level categories', async () => {
    const many: CategoryDto[] = Array.from({ length: BAR_LIMIT + 3 }, (_, i) => ({
      id: `c${i}`,
      name: `Category ${i}`,
      displayOrder: i,
    }));
    await setup(many);
    expect(el().querySelectorAll('a.category-nav__link').length).toBe(BAR_LIMIT);
    expect(component.topLevel().length).toBe(BAR_LIMIT + 3);
  });

  it('feeds the chip strip every category and routes a chip selection to /discover', async () => {
    await setup(flat);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const chips = Array.from(el().querySelectorAll('.category-chips__chip')) as HTMLButtonElement[];
    // Leading "All" chip plus one per category.
    expect(chips.length).toBe(flat.length + 1);

    chips[1].click();
    expect(navigate).toHaveBeenCalledWith(['/discover'], { queryParams: { categoryId: 'c1' } });

    chips[0].click();
    expect(navigate).toHaveBeenCalledWith(['/discover'], { queryParams: {} });
  });

  it('opens the flyout on click with aria-expanded, and closes it again', async () => {
    await setup(flat);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('.category-nav__panel')).toBeNull();

    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(el().querySelector('#category-nav-panel')).toBeTruthy();
    expect(trigger().getAttribute('aria-controls')).toBe('category-nav-panel');

    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('.category-nav__panel')).toBeNull();
  });

  it('lists every category in the flat panel with descriptions and a browse-all link', async () => {
    await setup(flat);
    trigger().click();
    fixture.detectChanges();

    const panel = el().querySelector('.category-nav__panel') as HTMLElement;
    expect(panel.classList.contains('category-nav__panel--flat')).toBe(true);
    const titles = Array.from(panel.querySelectorAll('.category-nav__group-title')) as HTMLAnchorElement[];
    expect(titles.length).toBe(4);
    expect(titles[2].getAttribute('href')).toBe('/discover?categoryId=c3');
    expect(panel.querySelector('.category-nav__group-desc')?.textContent).toContain('Natural wellness.');
    expect(panel.querySelector('.category-nav__browse-all')?.getAttribute('href')).toBe('/discover');
  });

  it('groups children under their parent and promotes orphans to top level', async () => {
    await setup(nested);
    expect(component.isFlat()).toBe(false);
    expect(component.topLevel().map((c) => c.id)).toEqual(['p1', 'p2', 'orphan']);

    trigger().click();
    fixture.detectChanges();
    const groups = Array.from(el().querySelectorAll('.category-nav__group')) as HTMLElement[];
    expect(groups.length).toBe(3);
    const foodChildren = Array.from(groups[0].querySelectorAll('.category-nav__child')).map((a) =>
      a.textContent?.trim(),
    );
    expect(foodChildren).toEqual(['Honey', 'Rooibos']);
    expect(groups[2].querySelector('.category-nav__group-list')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    await setup(flat);
    trigger().click();
    fixture.detectChanges();
    expect(component.open()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.open()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes when a category link inside the panel is clicked', async () => {
    await setup(flat);
    // The link is a real routerLink; there is no /discover route in this harness.
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    trigger().click();
    fixture.detectChanges();

    const link = el().querySelector('.category-nav__group-title') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(component.open()).toBe(false);
  });

  it('closes when the scrim is clicked', async () => {
    await setup(flat);
    trigger().click();
    fixture.detectChanges();

    (el().querySelector('.category-nav__scrim') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.open()).toBe(false);
  });

  it('wraps Tab and Shift+Tab inside the open panel', async () => {
    await setup(flat);
    trigger().click();
    fixture.detectChanges();

    const panel = el().querySelector('.category-nav__panel') as HTMLElement;
    const focusables = Array.from(panel.querySelectorAll('a[href]')) as HTMLElement[];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    panel.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    panel.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('opens on hover only after the intent delay, and not if the pointer leaves first', async () => {
    vi.useFakeTimers();
    await setup(flat);

    component.onTriggerEnter();
    vi.advanceTimersByTime(HOVER_INTENT_MS - 1);
    expect(component.open()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(component.open()).toBe(true);

    component.close();
    component.onTriggerEnter();
    vi.advanceTimersByTime(HOVER_INTENT_MS / 2);
    component.onTriggerLeave();
    vi.advanceTimersByTime(HOVER_INTENT_MS);
    expect(component.open()).toBe(false);
  });

  it('closes after the grace period when the pointer leaves the nav, unless it comes back', async () => {
    vi.useFakeTimers();
    await setup(flat);
    component.openPanel(false);
    expect(component.open()).toBe(true);

    component.onNavLeave();
    vi.advanceTimersByTime(LEAVE_GRACE_MS - 1);
    component.onNavEnter();
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    expect(component.open()).toBe(true);

    component.onNavLeave();
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    expect(component.open()).toBe(false);
  });
});
