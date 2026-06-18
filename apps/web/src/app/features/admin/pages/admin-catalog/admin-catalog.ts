import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-catalog',
  standalone: true,
  template: `<section class="admin-page"><h1>Catalog</h1><p>Coming soon.</p></section>`,
  styles: [`.admin-page{padding:24px} h1{font:600 32px/40px Inter,system-ui,sans-serif;margin:0 0 8px;color:var(--hb-on-surface)} p{margin:0;color:var(--hb-on-surface-variant)}`],
})
export class AdminCatalog {}
