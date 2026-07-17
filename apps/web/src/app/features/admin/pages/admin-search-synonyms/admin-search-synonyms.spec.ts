import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SynonymDto } from '@hb/shared';

import { AdminSearchSynonyms } from './admin-search-synonyms';
import { AdminSearchSynonymsService } from '../../../../core/api/admin-search-synonyms.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_SYNONYMS: SynonymDto[] = [
  {
    id: 's1',
    term: 'moisturiser',
    equivalents: ['moisturizer'],
    bidirectional: true,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 's2',
    term: 'trainers',
    equivalents: ['sneakers', 'tekkies'],
    bidirectional: false,
    enabled: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface SynonymsServiceStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

async function setup(stub: SynonymsServiceStub) {
  await TestBed.configureTestingModule({
    imports: [AdminSearchSynonyms],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AdminSearchSynonymsService, useValue: stub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminSearchSynonyms);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, component };
}

describe('AdminSearchSynonyms component', () => {
  let component: AdminSearchSynonyms;
  let fixture: ComponentFixture<AdminSearchSynonyms>;
  let stub: SynonymsServiceStub;

  beforeEach(async () => {
    stub = {
      list: vi.fn(() => of([...MOCK_SYNONYMS])),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    ({ fixture, component } = await setup(stub));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads synonyms on init and clears loading flag', () => {
    expect(stub.list).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.synonyms().length).toBe(2);
  });

  it('create happy path: valid form calls service.create and prepends the result', async () => {
    const created: SynonymDto = {
      id: 's3',
      term: 'sofa',
      equivalents: ['couch'],
      bidirectional: false,
      enabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    stub.create.mockReturnValue(of(created));

    component.form.controls.term.setValue('sofa');
    component.equivalents.at(0).setValue('couch');
    component.submit();
    await fixture.whenStable();

    expect(stub.create).toHaveBeenCalledWith({
      term: 'sofa',
      equivalents: ['couch'],
      bidirectional: false,
      enabled: true,
    });
    expect(component.synonyms()[0]).toEqual(created);
    expect(component.saving()).toBe(false);
  });

  it('term and equivalents are trimmed and lowercased on submit', async () => {
    stub.create.mockReturnValue(of(MOCK_SYNONYMS[0]));

    component.form.controls.term.setValue('  Sofa ');
    component.equivalents.at(0).setValue('  Couch ');
    component.submit();
    await fixture.whenStable();

    expect(stub.create).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'sofa', equivalents: ['couch'] }),
    );
  });

  it('startEdit pre-fills the form and edit happy path calls service.update', async () => {
    component.startEdit(MOCK_SYNONYMS[1]);

    expect(component.editingId()).toBe('s2');
    expect(component.form.controls.term.value).toBe('trainers');
    expect(component.equivalents.value).toEqual(['sneakers', 'tekkies']);
    expect(component.form.controls.bidirectional.value).toBe(false);
    expect(component.form.controls.enabled.value).toBe(false);

    const updated: SynonymDto = { ...MOCK_SYNONYMS[1], enabled: true };
    stub.update.mockReturnValue(of(updated));

    component.form.controls.enabled.setValue(true);
    component.submit();
    await fixture.whenStable();

    expect(stub.update).toHaveBeenCalledWith('s2', {
      term: 'trainers',
      equivalents: ['sneakers', 'tekkies'],
      bidirectional: false,
      enabled: true,
    });
    expect(component.synonyms().find(s => s.id === 's2')).toEqual(updated);
    expect(component.editingId()).toBeNull();
  });

  it('delete happy path: confirm flow removes the synonym from the list', async () => {
    stub.remove.mockReturnValue(of(undefined));

    component.requestDelete('s1');
    expect(component.confirmDeleteId()).toBe('s1');

    component.confirmDelete('s1');
    await fixture.whenStable();

    expect(stub.remove).toHaveBeenCalledWith('s1');
    expect(component.synonyms().find(s => s.id === 's1')).toBeUndefined();
    expect(component.confirmDeleteId()).toBeNull();
  });

  it('cancelDelete clears the confirm state without calling remove', () => {
    component.requestDelete('s1');
    component.cancelDelete();
    expect(component.confirmDeleteId()).toBeNull();
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it('validation: empty term blocks submit and marks the control invalid', () => {
    component.form.controls.term.setValue('');
    component.equivalents.at(0).setValue('couch');
    component.submit();

    expect(stub.create).not.toHaveBeenCalled();
    expect(component.form.controls.term.invalid).toBe(true);
    expect(component.form.controls.term.touched).toBe(true);
  });

  it('validation: zero non-empty equivalents blocks submit', () => {
    component.form.controls.term.setValue('sofa');
    component.equivalents.at(0).setValue('');
    component.submit();

    expect(stub.create).not.toHaveBeenCalled();
    expect(component.equivalents.hasError('minEquivalents')).toBe(true);
  });

  it('validation: duplicate equivalents blocks submit', () => {
    component.form.controls.term.setValue('sofa');
    component.equivalents.at(0).setValue('couch');
    component.addEquivalent();
    component.equivalents.at(1).setValue('Couch');
    component.submit();

    expect(stub.create).not.toHaveBeenCalled();
    expect(component.equivalents.hasError('duplicateEquivalents')).toBe(true);
  });

  it('submit while saving is in-flight is a no-op', () => {
    stub.create.mockReturnValueOnce(NEVER);
    component.form.controls.term.setValue('sofa');
    component.equivalents.at(0).setValue('couch');
    component.submit();
    expect(component.saving()).toBe(true);

    component.form.controls.term.setValue('other');
    component.submit();
    expect(stub.create).toHaveBeenCalledTimes(1);
  });

  it('create error path sets actionError and clears saving', async () => {
    stub.create.mockReturnValue(throwError(() => new Error('500')));
    component.form.controls.term.setValue('sofa');
    component.equivalents.at(0).setValue('couch');
    component.submit();
    await fixture.whenStable();

    expect(component.actionError()).toBeTruthy();
    expect(component.saving()).toBe(false);
  });
});

// ─── Error loading test (isolated setup) ─────────────────────────────────────

describe('AdminSearchSynonyms — load error path', () => {
  it('sets error signal and clears loading when list() fails', async () => {
    const failStub: SynonymsServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const { component } = await setup(failStub);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
  });
});
