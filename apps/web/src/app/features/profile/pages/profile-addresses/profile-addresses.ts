import { Component } from '@angular/core';

@Component({
  selector: 'app-profile-addresses',
  standalone: true,
  template: `<section class="profile-page"><h1>Addresses</h1><p>Coming soon.</p></section>`,
  styles: [`.profile-page{padding:24px} h1{font:600 32px/40px Inter,system-ui,sans-serif;margin:0 0 8px;color:var(--hb-on-surface)} p{margin:0;color:var(--hb-on-surface-variant)}`],
})
export class ProfileAddresses {}
