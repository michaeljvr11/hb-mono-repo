import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CategoryDto } from '@hb/shared';

import { CategoryChips } from './category-chips';

describe('CategoryChips', () => {
  let fixture: ComponentFixture<CategoryChips>;
  let component: CategoryChips;

  const categories: CategoryDto[] = [
    { id: 'c1', name: 'Agriculture', displayOrder: 0 },
    { id: 'c2', name: 'Handicrafts', displayOrder: 1 },
  ];

  async function setup(selectedId: string | null = null): Promise<void> {
    await TestBed.configureTestingModule({ imports: [CategoryChips] }).compileComponents();
    fixture = TestBed.createComponent(CategoryChips);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('categories', categories);
    fixture.componentRef.setInput('selectedId', selectedId);
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('renders the leading "All" chip plus one chip per category', async () => {
    await setup();
    const chips = fixture.nativeElement.querySelectorAll('.category-chips__chip');
    expect(chips.length).toBe(3);
    expect(chips[0].textContent.trim()).toBe('All');
    expect(chips[1].textContent.trim()).toBe('Agriculture');
    expect(chips[2].textContent.trim()).toBe('Handicrafts');
  });

  it('marks "All" active when selectedId is null', async () => {
    await setup(null);
    const chips = fixture.nativeElement.querySelectorAll('.category-chips__chip');
    expect(chips[0].classList.contains('category-chips__chip--active')).toBe(true);
    expect(chips[1].classList.contains('category-chips__chip--active')).toBe(false);
  });

  it('marks the matching category chip active', async () => {
    await setup('c1');
    const chips = fixture.nativeElement.querySelectorAll('.category-chips__chip');
    expect(chips[0].classList.contains('category-chips__chip--active')).toBe(false);
    expect(chips[1].classList.contains('category-chips__chip--active')).toBe(true);
  });

  it('emits the category id on selection', async () => {
    await setup(null);
    const spy = vi.fn();
    component.selectedIdChange.subscribe(spy);

    const chips = fixture.nativeElement.querySelectorAll('.category-chips__chip');
    chips[1].click();

    expect(spy).toHaveBeenCalledWith('c1');
  });

  it('emits null when re-selecting the already active chip', async () => {
    await setup('c1');
    const spy = vi.fn();
    component.selectedIdChange.subscribe(spy);

    const chips = fixture.nativeElement.querySelectorAll('.category-chips__chip');
    chips[1].click();

    expect(spy).toHaveBeenCalledWith(null);
  });

  it('emits null when the "All" chip is clicked', async () => {
    await setup('c1');
    const spy = vi.fn();
    component.selectedIdChange.subscribe(spy);

    const chips = fixture.nativeElement.querySelectorAll('.category-chips__chip');
    chips[0].click();

    expect(spy).toHaveBeenCalledWith(null);
  });
});
