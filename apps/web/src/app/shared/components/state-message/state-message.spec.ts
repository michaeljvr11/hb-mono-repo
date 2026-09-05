import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StateMessage } from './state-message';

@Component({
  imports: [StateMessage],
  template: `
    <app-state-message [kind]="kind" [message]="message" [heading]="heading" [icon]="icon">
      @if (withAction) {
        <button stateAction type="button" class="state-message__btn">Try again</button>
      }
    </app-state-message>
  `,
})
class HostComponent {
  kind: 'loading' | 'empty' | 'error' = 'empty';
  message = 'Nothing here yet.';
  heading: string | null = null;
  icon: string | null = null;
  withAction = false;
}

describe('StateMessage', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HTMLElement;

  const root = () => host.querySelector('.state-message')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement;
  });

  it('renders an empty state as a status with the default glyph', () => {
    fixture.detectChanges();

    expect(root().getAttribute('role')).toBe('status');
    expect(root().getAttribute('aria-busy')).toBeNull();
    expect(root().classList.contains('state-message--empty')).toBe(true);
    expect(host.querySelector('.state-message__icon')!.textContent!.trim()).toBe('inventory_2');
    expect(host.querySelector('.state-message__body')!.textContent!.trim()).toBe('Nothing here yet.');
  });

  it('renders an error state as an alert with the error glyph and tone class', () => {
    fixture.componentInstance.kind = 'error';
    fixture.componentInstance.message = 'Could not load products.';
    fixture.detectChanges();

    expect(root().getAttribute('role')).toBe('alert');
    expect(root().classList.contains('state-message--error')).toBe(true);
    expect(host.querySelector('.state-message__icon')!.textContent!.trim()).toBe('error_outline');
  });

  it('renders a spinner rather than a glyph while loading, and announces politely', () => {
    fixture.componentInstance.kind = 'loading';
    fixture.componentInstance.message = 'Loading product…';
    fixture.detectChanges();

    expect(root().getAttribute('role')).toBe('status');
    expect(root().getAttribute('aria-live')).toBe('polite');
    expect(root().getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.state-message__spinner')).not.toBeNull();
    expect(host.querySelector('.state-message__icon')).toBeNull();
  });

  it('honours an icon override and renders an optional heading', () => {
    fixture.componentInstance.icon = 'search_off';
    fixture.componentInstance.heading = 'No results';
    fixture.detectChanges();

    expect(host.querySelector('.state-message__icon')!.textContent!.trim()).toBe('search_off');
    expect(host.querySelector('.state-message__heading')!.textContent!.trim()).toBe('No results');
  });

  it('projects an action into the action slot', () => {
    fixture.componentInstance.withAction = true;
    fixture.detectChanges();

    const slot = host.querySelector('.state-message__action')!;
    expect(slot.querySelector('button')!.textContent!.trim()).toBe('Try again');
  });

  it('has no heading element when none is given', () => {
    fixture.detectChanges();

    expect(host.querySelector('.state-message__heading')).toBeNull();
  });
});
