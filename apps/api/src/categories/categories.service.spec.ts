import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { Product } from '../products/entities/product.entity';

const makeCategory = (overrides: Partial<Category> = {}): Category =>
  ({
    id: 'c1',
    name: 'Electronics',
    slug: 'electronics',
    description: undefined,
    displayOrder: 0,
    parentId: undefined,
    products: [],
    children: [],
    ...overrides,
  }) as Category;

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    categoryRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('remove', () => {
    it('deletes a category with no products and no children', async () => {
      const empty = makeCategory({ products: [], children: [] });
      categoryRepo.findOne.mockResolvedValue(empty);
      categoryRepo.remove.mockResolvedValue(empty);

      await expect(service.remove('c1')).resolves.toBeUndefined();

      expect(categoryRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'c1' },
        relations: { products: true, children: true },
      });
      expect(categoryRepo.remove).toHaveBeenCalledWith(empty);
    });

    it('throws NotFoundException for an unknown id', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(categoryRepo.remove).not.toHaveBeenCalled();
    });

    it('throws ConflictException (409) when the category has linked products', async () => {
      const inUse = makeCategory({
        products: [{ id: 'p1' } as Product],
        children: [],
      });
      categoryRepo.findOne.mockResolvedValue(inUse);

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
      await expect(service.remove('c1')).rejects.toThrow(
        'Cannot delete a category that has products; reassign them first',
      );
      expect(categoryRepo.remove).not.toHaveBeenCalled();
    });

    it('throws ConflictException (409) when the category has child subcategories', async () => {
      const parent = makeCategory({ products: [], children: [makeCategory({ id: 'c2' })] });
      categoryRepo.findOne.mockResolvedValue(parent);

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
      await expect(service.remove('c1')).rejects.toThrow(
        'Cannot delete a category with subcategories; delete or reparent them first',
      );
      expect(categoryRepo.remove).not.toHaveBeenCalled();
    });
  });
});
