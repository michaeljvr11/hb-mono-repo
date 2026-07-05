import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CategoryDto } from '@hb/shared';

/**
 * Horizontal-scroll category chip row with a leading "All" chip. Selecting
 * the already-active chip clears the selection (toggles back to "All").
 */
@Component({
  selector: 'app-category-chips',
  imports: [],
  templateUrl: './category-chips.html',
  styleUrl: './category-chips.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryChips {
  readonly categories = input.required<CategoryDto[]>();
  readonly selectedId = input<string | null>(null);

  readonly selectedIdChange = output<string | null>();

  selectAll(): void {
    this.selectedIdChange.emit(null);
  }

  selectCategory(id: string): void {
    this.selectedIdChange.emit(this.selectedId() === id ? null : id);
  }
}
