import { Injectable, inject, signal } from '@angular/core';
import { CategoryDto } from '@hb/shared';
import { CategoriesService } from '../../core/api/categories.service';

export type CategoryNavState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * One category fetch per app lifetime, shared by every page's header.
 *
 * `<app-nav-bar>` (and so `<app-category-nav>`) is re-created on every route change because
 * each feature template mounts its own. Without this store every navigation would issue a
 * fresh `GET /categories`. Root-provided, so the list survives route changes on the client;
 * on the server each request gets its own injector, and the response rides the hydration
 * transfer cache so the client does not fetch it again. A failed load drops back to `idle`
 * semantics (see `load()`) so the next page mount retries.
 *
 * Deliberately not part of `CategoriesService`: that service is the plain API surface used
 * by admin screens, which need fresh data after a create/update.
 */
@Injectable({ providedIn: 'root' })
export class CategoryNavStore {
  private readonly categoriesService = inject(CategoriesService);

  readonly categories = signal<CategoryDto[]>([]);
  readonly state = signal<CategoryNavState>('idle');

  load(): void {
    const state = this.state();
    if (state === 'loading' || state === 'loaded') return;
    this.state.set('loading');
    this.categoriesService.list().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.state.set('loaded');
      },
      error: () => this.state.set('error'),
    });
  }
}
