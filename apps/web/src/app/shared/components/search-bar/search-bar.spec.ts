import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SearchBar, SuggestionGroup } from './search-bar';

describe('SearchBar', () => {
  let fixture: ComponentFixture<SearchBar>;
  let component: SearchBar;

  const suggestions: SuggestionGroup[] = [
    {
      label: 'Products',
      items: [
        { id: 'p1', label: 'Organic Fynbos Honey' },
        { id: 'p2', label: 'Marula Face Oil' },
      ],
    },
    {
      label: 'Vendors',
      items: [{ id: 'v1', label: 'Leko Organics' }],
    },
  ];

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [SearchBar] }).compileComponents();
    fixture = TestBed.createComponent(SearchBar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function getInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('.search-bar__input');
  }

  function typeInto(value: string): void {
    const input = getInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('debounces termChange emissions by 300ms', async () => {
    await setup();
    const spy = vi.fn();
    component.termChange.subscribe(spy);

    typeInto('honey');
    fixture.detectChanges();
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    fixture.detectChanges();
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith('honey');
  });

  it('gates termChange to length 0 or >= 2 characters', async () => {
    await setup();
    const spy = vi.fn();
    component.termChange.subscribe(spy);

    typeInto('h');
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(spy).not.toHaveBeenCalled();

    typeInto('ho');
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith('ho');
  });

  it('emits termChange with an empty string when cleared to length 0', async () => {
    await setup();
    const spy = vi.fn();
    component.termChange.subscribe(spy);

    typeInto('');
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith('');
  });

  it('emits search with the current term on Enter when nothing is highlighted', async () => {
    await setup();
    const spy = vi.fn();
    component.search.subscribe(spy);

    typeInto('honey');
    fixture.detectChanges();

    const input = getInput();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(spy).toHaveBeenCalledWith('honey');
  });

  it('navigates the suggestion list with ArrowDown/ArrowUp and highlights accordingly', async () => {
    await setup();
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.detectChanges();
    component.onFocus();
    fixture.detectChanges();

    const input = getInput();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(component.activeIndex()).toBe(0);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(component.activeIndex()).toBe(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    fixture.detectChanges();
    expect(component.activeIndex()).toBe(0);
  });

  it('selects the highlighted suggestion on Enter', async () => {
    await setup();
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.detectChanges();
    component.onFocus();
    fixture.detectChanges();

    const spy = vi.fn();
    component.suggestionSelected.subscribe(spy);

    const input = getInput();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(spy).toHaveBeenCalledWith({
      group: 'Products',
      item: { id: 'p1', label: 'Organic Fynbos Honey' },
    });
  });

  it('closes the panel on Escape', async () => {
    await setup();
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.detectChanges();
    component.onFocus();
    fixture.detectChanges();
    expect(component.panelOpen()).toBe(true);

    const input = getInput();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.panelOpen()).toBe(false);
  });

  it('emits suggestionSelected on click and closes the panel', async () => {
    await setup();
    fixture.componentRef.setInput('suggestions', suggestions);
    fixture.detectChanges();
    component.onFocus();
    fixture.detectChanges();

    const spy = vi.fn();
    component.suggestionSelected.subscribe(spy);

    const options = fixture.nativeElement.querySelectorAll('.search-bar__option');
    (options[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith({
      group: 'Products',
      item: { id: 'p2', label: 'Marula Face Oil' },
    });
    expect(component.panelOpen()).toBe(false);
  });

  it('clears the term, emits cleared, and re-focuses the input', async () => {
    await setup();
    typeInto('honey');
    fixture.detectChanges();

    const spy = vi.fn();
    component.cleared.subscribe(spy);

    const clearBtn = fixture.nativeElement.querySelector('.search-bar__clear') as HTMLButtonElement;
    clearBtn.click();
    fixture.detectChanges();

    expect(component.term()).toBe('');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not render a clear button when the term is empty', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('.search-bar__clear')).toBeNull();
  });
});
