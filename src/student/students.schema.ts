import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import {
  HydratedDocument,
  Schema as MongooseSchema,
  Types,
} from 'mongoose';

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

  // Fee amounts are no longer set at student creation/edit — a student
  // starts with none of these set at all (the "no fee generated yet, show
  // +" state). They exist here only as a read-mostly mirror of whichever
  // FeeCycle `activeFeeCycleId` points to, kept in sync by
  // PaymentsService.generateFeeCycle()/collectFeeCyclePayment() alone, so
  // every other reader of Student (the students table, the reminder
  // scheduler, permission-based fee stripping) keeps working unchanged.
  // The FeeCycle collection is the real source of truth and the only place
  // balances are computed from.
  @Prop({
    min: 0,
  })
  totalFee?: number;

  @Prop({
    min: 0,
  })
  paidAmount?: number;

  @Prop({
    min: 0,
  })
  pendingAmount?: number;

  @Prop({
    enum: ['unpaid', 'partial', 'paid'],
  })
  paymentStatus?: 'unpaid' | 'partial' | 'paid';

  @Prop({
    enum: ['cash', 'bank', 'upi', 'qr'],
    default: null,
  })
  paymentMethod?: 'cash' | 'bank' | 'upi' | 'qr';

  // Points at the FeeCycle currently being paid off — null/undefined means
  // this student has never had a fee generated (the Payment page's Status
  // column shows just "+"). Only ever set by generateFeeCycle(); a fully
  // paid cycle stays "active" (for history/mirror purposes) until the next
  // one is generated.
  // MongooseSchema.Types.ObjectId, not Types.ObjectId — see the note in
  // payments.schema.ts for why the distinction matters here.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'FeeCycle',
    default: null,
  })
  activeFeeCycleId?: Types.ObjectId | null;

  @Prop({ default: '' })
  paymentProofImage?: string;

  @Prop({ type: Date, default: null })
  paymentProofUploadedAt?: Date | null;

  @Prop({ default: true })
  isActive!: boolean;
}

export const StudentSchema =
  SchemaFactory.createForClass(Student);