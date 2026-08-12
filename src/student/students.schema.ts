import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StudentDocument =
  HydratedDocument<Student>;

@Schema({ timestamps: true })
export class Student {
  @Prop({ required: true, trim: true })
  studentName!: string;

  @Prop({
    required: true,
    trim: true,
    unique: true,
  })
  rollNo!: string;

  @Prop({ required: true, trim: true })
  parentName!: string;

  @Prop({
    required: true,
    trim: true,
  })
  phone!: string;

  @Prop({
    trim: true,
  })
  alternatePhone?: string;

  @Prop({
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
  })
  email?: string;

  @Prop({
    required: true,
    trim: true,
  })
  course!: string;

  @Prop({
    required: true,
    trim: true,
    unique: true,
  })
  idproof!: string;

  @Prop({ trim: true })
  batch?: string;

  @Prop({ trim: true })
  schoolName?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({
    required: true,
    min: 0,
  })
  totalFee!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  paidAmount!: number;

  @Prop({
    required: true,
    min: 0,
  })
  pendingAmount!: number;

  @Prop({
    enum: ['unpaid', 'paid'],
    default: 'unpaid',
  })
  paymentStatus!: 'unpaid' | 'paid';

  @Prop({
    enum: ['cash', 'bank', 'upi', 'qr'],
    default: null,
  })
  paymentMethod?: 'cash' | 'bank' | 'upi' | 'qr';

  @Prop({ default: true })
  isActive!: boolean;
}

export const StudentSchema =
  SchemaFactory.createForClass(Student);