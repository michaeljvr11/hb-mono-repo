import { Component } from '@angular/core';

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  template: `<section class="vendor-page"><h1>Profile</h1><p>Coming soon.</p></section>`,
  styles: [`.vendor-page{padding:24px} h1{font:600 32px/40px Inter,system-ui,sans-serif;margin:0 0 8px;color:var(--hb-on-surface)} p{margin:0;color:var(--hb-on-surface-variant)}`],
})
export class VendorProfile {}
