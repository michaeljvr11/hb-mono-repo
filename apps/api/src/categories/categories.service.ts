import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  private toResponseDto(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      displayOrder: category.displayOrder,
      parentId: category.parentId,
    };
  }

  async create(createDto: CreateCategoryDto): Promise<CategoryResponseDto> {
    if (!createDto.slug) {
      createDto.slug = createDto.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }

    const existing = await this.categoryRepository.findOne({ where: { slug: createDto.slug } });
    if (existing) {
      throw new ConflictException(`Slug "${createDto.slug}" already exists`);
    }

    const category = this.categoryRepository.create(createDto);
    const saved = await this.categoryRepository.save(category);
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
    return categories.map((c) => this.toResponseDto(c));
  }

  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return this.toResponseDto(category);
  }

  async update(id: string, updateDto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    Object.assign(category, updateDto);
    const updated = await this.categoryRepository.save(category);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: { products: true, children: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (category.products.length > 0) {
      throw new ConflictException(
        'Cannot delete a category that has products; reassign them first',
      );
    }
    if (category.children.length > 0) {
      throw new ConflictException(
        'Cannot delete a category with subcategories; delete or reparent them first',
      );
    }
    await this.categoryRepository.remove(category);
  }
}
