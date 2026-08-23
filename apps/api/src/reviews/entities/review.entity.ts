import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
  Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

/**
 * One review per (product, user) — see UNIQUE below. Schema lives in the
 * ProductReviews migration (synchronize is off); this entity is the typed
 * mirror TypeORM uses for querying, not the source of truth for DDL.
 */
@Entity('product_reviews')
@Unique('UQ_product_reviews_product_user', ['productId', 'userId'])
@Index('IDX_product_reviews_product_created', ['productId', 'createdAt'])
@Check('CHK_product_reviews_rating', '"rating" BETWEEN 1 AND 5')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: true })
  isVerifiedPurchase: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
