import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  url: string; // public URL or relative path (e.g. /uploads/products/abc123.jpg)

  @Column({ nullable: true })
  key?: string; // filename on disk / object-storage key — used for deletion

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ default: 0 })
  displayOrder: number;

  @Column({ nullable: true })
  altText?: string;

  // Intrinsic pixel dimensions + original upload size, probed via sharp at upload time
  // (see product-image-dimensions.pipe.ts). Nullable — legacy rows predating this probe
  // are never backfilled (locked decision, "Product Image Optimization Pipeline" spec).
  @Column({ type: 'int', nullable: true })
  width?: number;

  @Column({ type: 'int', nullable: true })
  height?: number;

  @Column({ type: 'int', nullable: true })
  sizeBytes?: number;

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
