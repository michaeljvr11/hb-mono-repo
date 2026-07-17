import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { SynonymCreateRequest, SynonymDto, SynonymUpdateRequest } from '@hb/shared';
import { AdminSearchSynonymsService } from '../../../../core/api/admin-search-synonyms.service';

const TERM_MAX_LENGTH = 100;
const EQUIVALENTS_MAX = 20;

/** Rejects duplicate equivalents (case/whitespace-insensitive), mirroring the
 *  server's `@ArrayUnique()` + trim/lowercase normalization. */
function uniqueEquivalentsValidator(control: AbstractControl): ValidationErrors | null {
  const arr = control as FormArray;
  const values = arr.controls
    .map(c => (c.value ?? '').toString().trim().toLowerCase())
    .filter(v => v.length > 0);
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return { duplicateEquivalents: true };
    seen.add(v);
  }
  return null;
}

function minEquivalentsValidator(control: AbstractControl): ValidationErrors | null {
  const arr = control as FormArray;
  const nonEmpty = arr.controls.filter(c => (c.value ?? '').toString().trim().length > 0);
  return nonEmpty.length >= 1 ? null : { minEquivalents: true };
}

@Component({
  selector: 'app-admin-search-synonyms',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './admin-search-synonyms.html',
  styleUrl: './admin-search-synonyms.scss',
})
export class AdminSearchSynonyms implements OnInit {
  private readonly synonymsService = inject(AdminSearchSynonymsService);
  private readonly fb = inject(FormBuilder);

  readonly synonyms = signal<SynonymDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Id of the synonym currently being created/updated/deleted, or null. */
  readonly saving = signal(false);
  readonly actionError = signal<string | null>(null);

  /** Id of the synonym being edited; null means the form is in "create" mode. */
  readonly editingId = signal<string | null>(null);

  /** Id awaiting delete confirmation, or null. */
  readonly confirmDeleteId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    term: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(TERM_MAX_LENGTH)]),
    equivalents: this.fb.array(
      [this.newEquivalentControl()],
      [minEquivalentsValidator, uniqueEquivalentsValidator],
    ),
    bidirectional: this.fb.nonNullable.control(false),
    enabled: this.fb.nonNullable.control(true),
  });

  get equivalents(): FormArray {
    return this.form.controls.equivalents;
  }

  private newEquivalentControl() {
    return this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(TERM_MAX_LENGTH)]);
  }

  ngOnInit(): void {
    this.loadSynonyms();
  }

  loadSynonyms(): void {
    this.loading.set(true);
    this.error.set(null);
    this.synonymsService.list().subscribe({
      next: (synonyms) => {
        this.synonyms.set(synonyms);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load synonyms. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  addEquivalent(): void {
    if (this.equivalents.length >= EQUIVALENTS_MAX) return;
    this.equivalents.push(this.newEquivalentControl());
  }

  removeEquivalent(index: number): void {
    if (this.equivalents.length <= 1) return;
    this.equivalents.removeAt(index);
    this.equivalents.updateValueAndValidity();
  }

  startEdit(synonym: SynonymDto): void {
    this.editingId.set(synonym.id);
    this.actionError.set(null);
    this.confirmDeleteId.set(null);

    this.equivalents.clear();
    for (const equivalent of synonym.equivalents.length ? synonym.equivalents : ['']) {
      this.equivalents.push(this.newEquivalentControl());
    }
    this.form.setValue({
      term: synonym.term,
      equivalents: synonym.equivalents.length ? synonym.equivalents : [''],
      bidirectional: synonym.bidirectional,
      enabled: synonym.enabled,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.actionError.set(null);
    this.resetForm();
  }

  private resetForm(): void {
    this.equivalents.clear();
    this.equivalents.push(this.newEquivalentControl());
    this.form.reset({ term: '', bidirectional: false, enabled: true });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: SynonymCreateRequest = {
      term: raw.term.trim().toLowerCase(),
      equivalents: raw.equivalents
        .map(v => v.trim().toLowerCase())
        .filter(v => v.length > 0),
      bidirectional: raw.bidirectional,
      enabled: raw.enabled,
    };

    this.saving.set(true);
    this.actionError.set(null);

    const id = this.editingId();
    if (id) {
      this.synonymsService.update(id, payload as SynonymUpdateRequest).subscribe({
        next: (updated) => {
          this.synonyms.update(list => list.map(s => (s.id === id ? updated : s)));
          this.saving.set(false);
          this.editingId.set(null);
          this.resetForm();
        },
        error: () => {
          this.actionError.set('Failed to save changes. Please try again.');
          this.saving.set(false);
        },
      });
    } else {
      this.synonymsService.create(payload).subscribe({
        next: (created) => {
          this.synonyms.update(list => [created, ...list]);
          this.saving.set(false);
          this.resetForm();
        },
        error: () => {
          this.actionError.set('Failed to create synonym. Please try again.');
          this.saving.set(false);
        },
      });
    }
  }

  requestDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  confirmDelete(id: string): void {
    if (this.deletingId()) return;
    this.deletingId.set(id);
    this.actionError.set(null);

    this.synonymsService.remove(id).subscribe({
      next: () => {
        this.synonyms.update(list => list.filter(s => s.id !== id));
        this.deletingId.set(null);
        this.confirmDeleteId.set(null);
        if (this.editingId() === id) {
          this.editingId.set(null);
          this.resetForm();
        }
      },
      error: () => {
        this.actionError.set('Failed to delete synonym. Please try again.');
        this.deletingId.set(null);
        this.confirmDeleteId.set(null);
      },
    });
  }
}
