import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  let fixture: ComponentFixture<Skeleton>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Skeleton] }).compileComponents();
    fixture = TestBed.createComponent(Skeleton);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('is hidden from assistive tech and defaults to a full-width rect', () => {
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.classList.contains('skeleton--rect')).toBe(true);
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('');
  });

  it('reflects shape, width and height inputs onto the host', () => {
    fixture.componentRef.setInput('shape', 'circle');
    fixture.componentRef.setInput('width', '48px');
    fixture.componentRef.setInput('height', '48px');
    fixture.detectChanges();

    expect(host.classList.contains('skeleton--circle')).toBe(true);
    expect(host.style.width).toBe('48px');
    expect(host.style.height).toBe('48px');
  });
});
