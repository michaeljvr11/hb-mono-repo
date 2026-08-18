import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ImageVariantSet } from '@hb/shared';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  url: string; // public URL of the canonical/"full" derivative (e.g. /uploads/products/<key>-full.webp)

  // The shared filename stem for every derivative of this upload (e.g. `<uuid>` in
  // `<uuid>-thumbnail.webp` / `<uuid>-card.webp` / `<uuid>-full.webp`) — used for deletion.
  // Pre-PIO-2 rows carry a single legacy filename here instead (one file, no derivatives).
  @Column({ nullable: true })
  key?: string;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ default: 0 })
  displayOrder: number;

  @Column({ nullable: true })
  altText?: string;

  // Intrinsic dimensions + byte size of `url` (the `full` derivative once processed by
  // PIO-2; the raw original's own dimensions pre-processing, for pre-PIO-2 rows). Nullable
  // — legacy rows predating any probe are never backfilled (locked decision,
  // "Product Image Optimization Pipeline" spec).
  @Column({ type: 'int', nullable: true })
  width?: number;

  @Column({ type: 'int', nullable: true })
  height?: number;

  @Column({ type: 'int', nullable: true })
  sizeBytes?: number;

  // The thumbnail/card/full WebP derivative set produced at upload time (PIO-2). Nullable
  // — legacy rows (pre-PIO-2) and rows created before this migration keep it null; every
  // consumer falls back to `url` alone when absent.
  @Column({ type: 'jsonb', nullable: true })
  variants?: ImageVariantSet;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
