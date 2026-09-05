import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Payment,
  PaymentDocument,
} from './payments.schema';

import {
  PaymentSetting,
  PaymentSettingDocument,
} from './payments-settings.schema';

import {
  FeeCycle,
  FeeCycleDocument,
} from './fee-cycle.schema';

import {
  Student,
  StudentDocument,
} from '../student/students.schema';

import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel:
      Model<PaymentDocument>,

    @InjectModel(PaymentSetting.name)
    private readonly paymentSettingModel:
      Model<PaymentSettingDocument>,

    @InjectModel(FeeCycle.name)
    private readonly feeCycleModel:
      Model<FeeCycleDocument>,

    @InjectModel(Student.name)
    private readonly studentModel:
      Model<StudentDocument>,

    private readonly whatsappService:
      WhatsappService,

    private readonly permissionsService:
      PermissionsService,
  ) {}

  // One-time, idempotent backfill: any student saved before fee cycles
  // existed still has its fee on the Student document directly (totalFee/
  // paidAmount/pendingAmount/paymentStatus) but no FeeCycle record and no
  // `activeFeeCycleId`. Turn that into a real "Fee Cycle 1" so the new
  // Payments-page flow and existing payment history line up for every
  // student, not just ones created after this feature shipped. Skips
  // anyone who already has `activeFeeCycleId` set, so this is safe to run
  // on every boot.
  async onModuleInit() {
    // The Payment/FeeCycle/Student schemas used to declare their ObjectId
    // reference fields (studentId, feeCycleId, activeFeeCycleId) with
    // `Types.ObjectId` instead of `Schema.Types.ObjectId` — a distinct
    // reference in this Mongoose version that the schema type registry
    // doesn't recognize, so those paths were silently treated as `Mixed`
    // (no casting) rather than real ObjectId paths. Depending on what was
    // assigned, some documents ended up with a plain id string in these
    // fields instead of an actual ObjectId. Now that the schemas declare
    // the correct type, Mongoose casts query filters to ObjectId — so a
    // string-stored value would silently stop matching. Normalize any
    // stragglers to real ObjectIds first so nothing goes missing.
    await this.normalizeObjectIdReferenceFields();

    const legacyStudents = await this.studentModel.find({
      totalFee: {
        $exists: true,
        $ne: null,
      },
      activeFeeCycleId: null,
    });

    for (const student of legacyStudents) {
      const feeCycle =
        await this.feeCycleModel.create({
          studentId: student._id,
          cycleNumber: 1,
          totalFee: student.totalFee,
          paidAmount: student.paidAmount || 0,
          pendingAmount:
            student.pendingAmount ??
            student.totalFee,
          status: student.paymentStatus || 'unpaid',
        });

      student.activeFeeCycleId = feeCycle._id;
      await student.save();
    }

    if (legacyStudents.length > 0) {
      console.log(
        `Fee cycle migration: created Fee Cycle 1 for ${legacyStudents.length} existing student(s).`,
      );
    }

    await this.backfillOrphanedPaymentFeeCycles();
    await this.renumberDuplicateFeeCycles();
  }

  // Another consequence of the same Mixed-typed-studentId bug: while it was
  // in effect, generateFeeCycle()'s "next cycle number" count
  // (countDocuments({ studentId })) silently missed cycles stored as a real
  // ObjectId when queried with a plain string, so some students ended up
  // with more than one FeeCycle sharing cycleNumber 1. One-time correction:
  // per student, order that student's cycles by creation time and
  // renumber them 1, 2, 3... Only touches documents whose number is
  // actually wrong, and never reorders — oldest stays first.
  private async renumberDuplicateFeeCycles() {
    const duplicateStudentIds =
      await this.feeCycleModel.aggregate([
        {
          $group: {
            _id: {
              studentId: '$studentId',
              cycleNumber: '$cycleNumber',
            },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        {
          $group: {
            _id: '$_id.studentId',
          },
        },
      ]);

    let renumberedCount = 0;

    for (const {
      _id: studentId,
    } of duplicateStudentIds) {
      const cycles = await this.feeCycleModel
        .find({ studentId })
        .sort({ createdAt: 1 });

      for (
        let index = 0;
        index < cycles.length;
        index++
      ) {
        const correctNumber = index + 1;

        if (
          cycles[index].cycleNumber !==
          correctNumber
        ) {
          await this.feeCycleModel.updateOne(
            { _id: cycles[index]._id },
            {
              $set: {
                cycleNumber: correctNumber,
              },
            },
          );

          // Payment.cycleNumber is a denormalized copy for display —
          // keep it in sync with the cycle it actually belongs to.
          await this.paymentModel.updateMany(
            { feeCycleId: cycles[index]._id },
            {
              $set: {
                cycleNumber: correctNumber,
              },
            },
          );

          renumberedCount++;
        }
      }
    }

    if (renumberedCount > 0) {
      console.log(
        `Fee cycle migration: renumbered ${renumberedCount} fee cycle(s) that had a duplicate cycle number.`,
      );
    }
  }

  // Raw-driver pass (bypasses Mongoose casting/validation entirely, so it
  // can inspect each field's actual stored BSON type) that converts any
  // string-stored id reference back into a real ObjectId, across all three
  // affected collections. Idempotent — a document with nothing to fix is
  // left untouched.
  private async normalizeObjectIdReferenceFields() {
    const paymentsFixed =
      await this.normalizeStringIdField(
        this.paymentModel.collection,
        ['studentId', 'feeCycleId'],
      );

    const feeCyclesFixed =
      await this.normalizeStringIdField(
        this.feeCycleModel.collection,
        ['studentId'],
      );

    const studentsFixed =
      await this.normalizeStringIdField(
        this.studentModel.collection,
        ['activeFeeCycleId'],
      );

    const totalFixed =
      paymentsFixed +
      feeCyclesFixed +
      studentsFixed;

    if (totalFixed > 0) {
      console.log(
        `ObjectId normalization: fixed ${paymentsFixed} payment(s), ${feeCyclesFixed} fee cycle(s), ${studentsFixed} student(s) with a string-typed id reference.`,
      );
    }
  }

  private async normalizeStringIdField(
    collection: {
      find: (filter: any) => any;
      updateOne: (
        filter: any,
        update: any,
      ) => Promise<any>;
    },
    fields: string[],
  ): Promise<number> {
    const filter = {
      $or: fields.map((field) => ({
        [field]: { $type: 'string' },
      })),
    };

    const docs = await collection
      .find(filter)
      .toArray();

    for (const doc of docs) {
      const update: Record<string, Types.ObjectId> =
        {};

      for (const field of fields) {
        if (typeof doc[field] === 'string') {
          update[field] = new Types.ObjectId(
            doc[field],
          );
        }
      }

      await collection.updateOne(
        { _id: doc._id },
        { $set: update },
      );
    }

    return docs.length;
  }

  // Separate pass, run every boot: any Payment saved before feeCycleId
  // existed — whether its student was just migrated above or was already
  // migrated in an earlier run — always belonged to that student's Fee
  // Cycle 1 (the only cycle that could exist before this feature), so
  // attach it there. Kept apart from the loop above so it still catches
  // stragglers even once every student already has `activeFeeCycleId`.
  private async backfillOrphanedPaymentFeeCycles() {
    const orphanedPayments =
      await this.paymentModel.find({
        feeCycleId: { $exists: false },
      });

    if (orphanedPayments.length === 0) {
      return;
    }

    // Existing Payment documents store studentId inconsistently — some as
    // an ObjectId, some as its plain string form (the rest of this
    // codebase already works around the same quirk by comparing
    // String(payment.studentId) === String(student._id)) — FeeCycle.studentId
    // is always a real ObjectId (only ever set from a Student document's
    // own _id), so normalize to that before looking a cycle up.
    const cycleOneByStudentId = new Map<
      string,
      FeeCycleDocument | null
    >();

    let backfilledCount = 0;

    for (const payment of orphanedPayments) {
      const studentIdStr =
        String(payment.studentId);

      if (!cycleOneByStudentId.has(studentIdStr)) {
        const cycleOne =
          await this.feeCycleModel.findOne({
            studentId: new Types.ObjectId(
              studentIdStr,
            ),
            cycleNumber: 1,
          });

        cycleOneByStudentId.set(
          studentIdStr,
          cycleOne,
        );
      }

      const cycleOne =
        cycleOneByStudentId.get(studentIdStr);

      if (!cycleOne) {
        continue;
      }

      // A targeted update, not payment.save() — some legacy Payment
      // documents predate other now-required fields (e.g. billingMonth)
      // and full-document validation on save() would reject them even
      // though this update never touches those fields.
      await this.paymentModel.updateOne(
        { _id: payment._id },
        {
          $set: {
            feeCycleId: cycleOne._id,
            cycleNumber: cycleOne.cycleNumber,
          },
        },
      );

      backfilledCount++;
    }

    if (backfilledCount > 0) {
      console.log(
        `Fee cycle migration: attached ${backfilledCount} existing payment record(s) to Fee Cycle 1.`,
      );
    }
  }

  // Starts a brand new fee cycle for a student — the ONLY way a student's
  // fee is ever set. Never adjusts or reads a previous cycle's paid amount;
  // the new cycle always starts at paidAmount 0. Blocked while the current
  // active cycle isn't fully paid yet, so cycles can never overlap.
  async generateFeeCycle(
    studentId: string,
    totalFee: number,
  ): Promise<StudentDocument> {
    const student =
      await this.studentModel.findById(studentId);

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    const requestedTotalFee =
      Number(totalFee);

    if (
      !Number.isFinite(requestedTotalFee) ||
      requestedTotalFee <= 0
    ) {
      throw new BadRequestException(
        'Enter a valid fee amount',
      );
    }

    if (student.activeFeeCycleId) {
      const activeCycle =
        await this.feeCycleModel.findById(
          student.activeFeeCycleId,
        );

      if (activeCycle && activeCycle.status !== 'paid') {
        throw new BadRequestException(
          'Complete the current fee cycle before generating a new one',
        );
      }
    }

    const cycleNumber =
      (await this.feeCycleModel.countDocuments({
        studentId,
      })) + 1;

    const feeCycle =
      await this.feeCycleModel.create({
        studentId,
        cycleNumber,
        totalFee: requestedTotalFee,
        paidAmount: 0,
        pendingAmount: requestedTotalFee,
        status: 'unpaid',
      });

    student.activeFeeCycleId = feeCycle._id;
    student.totalFee = requestedTotalFee;
    student.paidAmount = 0;
    student.pendingAmount = requestedTotalFee;
    student.paymentStatus = 'unpaid';
    student.paymentMethod = undefined;

    // A new cycle means any leftover pending upload belonged to the old
    // (now fully paid) cycle — it can't be attributed to this new one.
    student.paymentProofImage = '';
    student.paymentProofUploadedAt = null;

    return student.save();
  }

  // Corrects the total on the ACTIVE fee cycle in place — for fixing a
  // mistake (wrong amount typed in at generateFeeCycle) while the student
  // is still unpaid/partial. Deliberately refuses once the cycle is
  // 'paid': at that point the fee is history, and the only way to charge
  // this student again is generateFeeCycle (a new cycle).
  async editFeeCycleAmount(
    studentId: string,
    totalFee: number,
  ): Promise<StudentDocument> {
    const student =
      await this.studentModel.findById(studentId);

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    if (!student.activeFeeCycleId) {
      throw new BadRequestException(
        'No fee has been generated for this student yet',
      );
    }

    const feeCycle =
      await this.feeCycleModel.findById(
        student.activeFeeCycleId,
      );

    if (!feeCycle) {
      throw new BadRequestException(
        'No fee has been generated for this student yet',
      );
    }

    if (feeCycle.status === 'paid') {
      throw new BadRequestException(
        'This fee cycle is already fully paid — generate a new fee cycle instead',
      );
    }

    const newTotalFee =
      Number(totalFee);

    if (
      !Number.isFinite(newTotalFee) ||
      newTotalFee <= 0
    ) {
      throw new BadRequestException(
        'Enter a valid fee amount',
      );
    }

    if (newTotalFee < feeCycle.paidAmount) {
      throw new BadRequestException(
        `New fee cannot be less than the ₹${feeCycle.paidAmount} already collected for this cycle`,
      );
    }

    feeCycle.totalFee = newTotalFee;

    feeCycle.pendingAmount = Math.max(
      0,
      newTotalFee - feeCycle.paidAmount,
    );

    feeCycle.status =
      feeCycle.paidAmount >= newTotalFee
        ? 'paid'
        : feeCycle.paidAmount > 0
          ? 'partial'
          : 'unpaid';

    await feeCycle.save();

    student.totalFee = newTotalFee;
    student.pendingAmount = feeCycle.pendingAmount;
    student.paymentStatus = feeCycle.status;

    return student.save();
  }

  // Pays down the ACTIVE fee cycle only — balance is always
  // feeCycle.totalFee - feeCycle.paidAmount for that one cycle, never
  // combined with any other cycle's numbers.
  async collectFeeCyclePayment(
    studentId: string,
    amount: number,
    paymentMethod?:
      | 'cash'
      | 'bank'
      | 'upi'
      | 'qr',
    role?: string,
  ): Promise<StudentDocument> {
    const student =
      await this.studentModel.findById(studentId);

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    if (!student.activeFeeCycleId) {
      throw new BadRequestException(
        'No fee has been generated for this student yet',
      );
    }

    const feeCycle =
      await this.feeCycleModel.findById(
        student.activeFeeCycleId,
      );

    if (!feeCycle) {
      throw new BadRequestException(
        'No fee has been generated for this student yet',
      );
    }

    if (feeCycle.status === 'paid') {
      throw new BadRequestException(
        'This fee cycle is already fully paid — generate a new fee to collect further payments',
      );
    }

    const collectAmount =
      Number(amount);

    if (
      !Number.isFinite(collectAmount) ||
      collectAmount <= 0
    ) {
      throw new BadRequestException(
        'Enter a valid amount to collect',
      );
    }

    if (
      paymentMethod &&
      ![
        'cash',
        'bank',
        'upi',
        'qr',
      ].includes(paymentMethod)
    ) {
      throw new BadRequestException(
        'Invalid payment method',
      );
    }

    if (collectAmount > feeCycle.pendingAmount) {
      throw new BadRequestException(
        role === 'admin'
          ? `Amount exceeds the pending balance of ₹${feeCycle.pendingAmount}`
          : 'Amount exceeds the pending balance for this student',
      );
    }

    // Captured before the current screenshot is cleared below, so it can
    // still be archived onto the history record this collection creates.
    const proofImageToArchive =
      student.paymentProofImage || undefined;

    feeCycle.paidAmount += collectAmount;

    feeCycle.pendingAmount = Math.max(
      0,
      feeCycle.totalFee - feeCycle.paidAmount,
    );

    feeCycle.status =
      feeCycle.paidAmount >= feeCycle.totalFee
        ? 'paid'
        : 'partial';

    await feeCycle.save();

    student.paidAmount = feeCycle.paidAmount;
    student.pendingAmount = feeCycle.pendingAmount;
    student.paymentStatus = feeCycle.status;

    if (paymentMethod) {
      student.paymentMethod = paymentMethod;
    }

    // The pending upload is being consumed into a history record —
    // "Current Payment Screenshot" must only ever reflect an unprocessed
    // upload, never one that's already been collected.
    student.paymentProofImage = '';
    student.paymentProofUploadedAt = null;

    const updatedStudent =
      await student.save();

    await this.recordCollection({
      studentId: updatedStudent._id.toString(),
      studentName: updatedStudent.studentName,
      phone: updatedStudent.phone,
      course: updatedStudent.course,
      amount: collectAmount,
      paymentMethod:
        paymentMethod ||
        updatedStudent.paymentMethod ||
        'upi',
      paymentProofImage: proofImageToArchive,
      feeCycleId: feeCycle._id,
      cycleNumber: feeCycle.cycleNumber,
    });

    return updatedStudent;
  }

  // Every fee cycle a student has ever had, oldest first, each with only
  // its own payment records — cycles never share or borrow each other's
  // history.
  async getFeeCyclesWithHistory(studentId: string) {
    const [feeCycles, payments] = await Promise.all([
      this.feeCycleModel
        .find({ studentId })
        .sort({ cycleNumber: 1 }),

      this.paymentModel
        .find({ studentId })
        .sort({ paymentDate: 1 }),
    ]);

    return feeCycles.map((feeCycle) => ({
      _id: feeCycle._id,
      cycleNumber: feeCycle.cycleNumber,
      totalFee: feeCycle.totalFee,
      paidAmount: feeCycle.paidAmount,
      pendingAmount: feeCycle.pendingAmount,
      status: feeCycle.status,
      payments: payments
        .filter(
          (payment) =>
            String(payment.feeCycleId) ===
            String(feeCycle._id),
        )
        .map((payment) => ({
          _id: payment._id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          paymentProofImage: payment.paymentProofImage,
          paymentDate: payment.paymentDate,
        })),
    }));
  }

  private getBillingMonth(
    date: Date,
  ) {
    const year =
      date.getUTCFullYear();

    const month = String(
      date.getUTCMonth() + 1,
    ).padStart(2, '0');

    return `${year}-${month}`;
  }

  private async getActivePaymentSetting() {
    return this.paymentSettingModel
      .findOne({
        isActive: true,
      })
      .sort({
        updatedAt: -1,
      });
  }

  async setFeeDueDate(
    feeDueDate: string,
  ) {
    const parsedDate =
      new Date(
        `${feeDueDate}T00:00:00.000Z`,
      );

    if (
      Number.isNaN(
        parsedDate.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid fee due date',
      );
    }

    let setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      setting =
        new this.paymentSettingModel({
          feeDueDate: parsedDate,
          upiId: '',
          receiverName: '',
          paymentPhone: '',
          upiQrImage: '',
          isActive: true,
          lastReminderSentAt: null,
        });
    } else {
      setting.feeDueDate =
        parsedDate;

      setting.lastReminderSentAt =
        null;
    }

    await setting.save();

    // Fee amounts now live per fee cycle (see FeeCycle/generateFeeCycle) —
    // this date no longer bulk-resets every student's balance to unpaid.
    // Each student's next round of fees is generated individually from the
    // Payments page once their current cycle is fully paid.
    return {
      message:
        'Fee due date updated successfully',

      feeDueDate:
        setting.feeDueDate,

      studentsReset: false,

      resetStudentCount: 0,
    };
  }

  async getFeeDueDate() {
    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      return {
        feeDueDate:
          null,
      };
    }

    return {
      feeDueDate:
        setting.feeDueDate,
    };
  }

  async getPaymentSettings() {
    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      return {
        feeDueDate:
          null,

        preventReminderDate: null,

        overdueReminderDate: null,

        upiId:
          '',

        receiverName:
          '',

        paymentPhone:
          '',

        upiQrImage:
          '',
      };
    }

    return {
      feeDueDate:
        setting.feeDueDate,

      preventReminderDate:
        setting.preventReminderDate || null,

      overdueReminderDate:
        setting.overdueReminderDate || null,

      upiId:
        setting.upiId || '',

      receiverName:
        setting.receiverName || '',

      paymentPhone:
        setting.paymentPhone || '',

      upiQrImage:
        setting.upiQrImage || '',
    };
  }

  async updateReminderDates(data: {
    feeDueDate?: string;
    preventReminderDate?: string;
    overdueReminderDate?: string;
  }) {
    if (!data.feeDueDate) {
      throw new BadRequestException('Payment date is required');
    }

    const parseDate = (value?: string) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Please enter valid reminder dates');
      }
      return date;
    };

    const feeDueDate = parseDate(data.feeDueDate)!;
    const preventReminderDate = parseDate(data.preventReminderDate);
    const overdueReminderDate = parseDate(data.overdueReminderDate);

    if (preventReminderDate && preventReminderDate >= feeDueDate) {
      throw new BadRequestException('Prevent reminder date must be before the payment date');
    }

    if (overdueReminderDate && overdueReminderDate <= feeDueDate) {
      throw new BadRequestException('Overdue reminder date must be after the payment date');
    }

    const dueDateResult = await this.setFeeDueDate(data.feeDueDate);
    const setting = await this.getActivePaymentSetting();

    if (!setting) throw new BadRequestException('Unable to save reminder dates');

    setting.preventReminderDate = preventReminderDate;
    setting.overdueReminderDate = overdueReminderDate;
    setting.lastPreventReminderSentAt = null;
    setting.lastOverdueReminderSentAt = null;
    await setting.save();

    return {
      ...dueDateResult,
      message: 'Reminder dates saved successfully',
      preventReminderDate: setting.preventReminderDate,
      overdueReminderDate: setting.overdueReminderDate,
    };
  }

  async updatePaymentSettings(
    data: {
      upiId?: string;
      receiverName?: string;
      paymentPhone?: string;
      upiQrImage?: string;
    },
  ) {
    const upiId =
      data.upiId?.trim();

    const receiverName =
      data.receiverName?.trim();

    const paymentPhone =
      data.paymentPhone
        ?.replace(/\s+/g, '')
        .trim();

    const upiQrImage =
      data.upiQrImage?.trim();

    if (
      upiId !== undefined &&
      upiId.length > 0 &&
      !upiId.includes('@')
    ) {
      throw new BadRequestException(
        'Please enter a valid UPI ID',
      );
    }

    if (
      paymentPhone !== undefined &&
      paymentPhone.length > 0 &&
      !/^[6-9]\d{9}$/.test(
        paymentPhone,
      )
    ) {
      throw new BadRequestException(
        'Payment phone number must be a valid 10 digit Indian mobile number',
      );
    }

    if (
      upiQrImage &&
      !upiQrImage.startsWith(
        'data:image/',
      )
    ) {
      throw new BadRequestException(
        'Please upload a valid QR image',
      );
    }

    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      throw new BadRequestException(
        'Please set the fee due date first',
      );
    }

    if (upiId !== undefined) {
      setting.upiId =
        upiId;
    }

    if (
      receiverName !== undefined
    ) {
      setting.receiverName =
        receiverName;
    }

    if (
      paymentPhone !== undefined
    ) {
      setting.paymentPhone =
        paymentPhone;
    }

    if (
      upiQrImage !== undefined
    ) {
      setting.upiQrImage =
        upiQrImage;
    }

    await setting.save();

    return {
      message:
        'Payment settings updated successfully',

      paymentSettings: {
        upiId:
          setting.upiId || '',

        receiverName:
          setting.receiverName || '',

        paymentPhone:
          setting.paymentPhone || '',

        upiQrImage:
          setting.upiQrImage || '',
      },
    };
  }

  async getPublicPaymentDetails(
    studentId: string,
  ) {
    const student =
      await this.studentModel.findById(
        studentId,
      );

    if (
      !student ||
      !student.isActive
    ) {
      throw new NotFoundException(
        'Student payment details not found',
      );
    }

    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      throw new BadRequestException(
        'Payment configuration is not available',
      );
    }

    const hasUpiConfiguration =
      Boolean(
        setting.upiId &&
        setting.receiverName,
      );

    return {
      student: {
        id:
          student._id,

        studentName:
          student.studentName,

        rollNo:
          student.rollNo,

        course:
          student.course,

        batch:
          student.batch || '',

        paymentStatus:
          student.paymentStatus,

        paymentAmount:
          student.pendingAmount,

        paymentProofImage:
          student.paymentProofImage || '',

        paymentProofUploadedAt:
          student.paymentProofUploadedAt || null,
      },

      payment: {
        feeDueDate:
          setting.feeDueDate,

        upiId:
          setting.upiId || '',

        receiverName:
          setting.receiverName || '',

        paymentPhone:
          setting.paymentPhone || '',

        upiQrImage:
          setting.upiQrImage || '',

        isConfigured:
          hasUpiConfiguration,
      },
    };
  }

  async uploadPaymentProof(
    studentId: string,
    proofImage?: string,
  ) {
    const student =
      await this.studentModel.findById(
        studentId,
      );

    if (
      !student ||
      !student.isActive
    ) {
      throw new NotFoundException(
        'Student payment details not found',
      );
    }

    const trimmedImage =
      proofImage?.trim() || '';

    if (
      trimmedImage &&
      !trimmedImage.startsWith(
        'data:image/',
      )
    ) {
      throw new BadRequestException(
        'Please upload a valid payment screenshot',
      );
    }

    if (trimmedImage) {
      const activeCycle =
        student.activeFeeCycleId
          ? await this.feeCycleModel.findById(
              student.activeFeeCycleId,
            )
          : null;

      if (!activeCycle || activeCycle.status === 'paid') {
        throw new BadRequestException(
          'There is no pending fee for this student right now',
        );
      }
    }

    student.paymentProofImage =
      trimmedImage;

    student.paymentProofUploadedAt =
      trimmedImage
        ? new Date()
        : null;

    await student.save();

    return {
      message:
        trimmedImage
          ? 'Payment screenshot uploaded successfully'
          : 'Payment screenshot removed successfully',

      paymentProofImage:
        student.paymentProofImage || '',

      paymentProofUploadedAt:
        student.paymentProofUploadedAt || null,
    };
  }

  // `amount` (the per-transaction sum collected) is fee-sensitive data, so
  // it's stripped for trainers without the payments.totalFee permission at
  // the response boundary, same reasoning/pattern as students' omitFeeFields.
  private omitAmount(
    payment: PaymentDocument,
    effective: Awaited<
      ReturnType<
        PermissionsService['effectivePermissionsForUserId']
      >
    >,
  ) {
    return this.permissionsService.pickAllowedFields(
      payment,
      effective,
      'payments',
      [
        // Global 'fees', not the page-scoped 'totalFee' column toggle —
        // otherwise a Trainer could see raw payment amounts here just by
        // having the Total Fee column enabled, without the master Fees
        // permission that's supposed to gate money anywhere in the app.
        {
          kind: 'global',
          key: 'fees',
          fields: ['amount'],
        },
      ],
    );
  }

  async getPayments(
    role?: string,
    userId?: string,
  ) {
    const payments =
      await this.paymentModel
        .find()
        .sort({
          paymentDate:
            -1,
        });

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return payments.map((payment) =>
      this.omitAmount(payment, effective),
    );
  }

  async getPaymentById(
    id: string,
    role?: string,
    userId?: string,
  ) {
    const payment =
      await this.paymentModel.findById(
        id,
      );

    if (!payment) {
      throw new NotFoundException(
        'Payment record not found',
      );
    }

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitAmount(payment, effective);
  }

  // Removes one history record only. Payment documents are an
  // append-only log of past collections — the student's paidAmount /
  // pendingAmount / paymentStatus live on the Student document and are
  // never derived from this collection, so deleting a record here cannot
  // reopen a pending payment or change the current fee balance.
  async deletePayment(id: string) {
    const payment =
      await this.paymentModel.findByIdAndDelete(id);

    if (!payment) {
      throw new NotFoundException(
        'Payment history record not found',
      );
    }

    return {
      message:
        'Payment history record deleted successfully',
    };
  }

  private formatDueDateForMessage(date: Date) {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  async sendDueReminders(
    studentIds?: string[],
    skipDueDateCheck = false,
    reminderType: 'prevent' | 'overdue' = 'prevent',
  ) {
    const setting =
      await this.getActivePaymentSetting();

    if (!setting?.feeDueDate) {
      return {
        message:
          'Fee due date is not set',

        totalEligible:
          0,

        sent:
          0,

        failed:
          0,
      };
    }

    const now =
      new Date();

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

    const feeDueDate =
      new Date(
        setting.feeDueDate,
      );

    const dueDate =
      new Date(
        feeDueDate.getFullYear(),
        feeDueDate.getMonth(),
        feeDueDate.getDate(),
      );

    if (!skipDueDateCheck && today < dueDate) {
      return {
        message:
          'Fee due date has not started yet',

        totalEligible:
          0,

        sent:
          0,

        failed:
          0,
      };
    }

    const reminderFilter: any = {
      paymentStatus:
        'unpaid',

      pendingAmount: {
        $gt:
          0,
      },

      isActive:
        true,
    };

    if (studentIds && studentIds.length > 0) {
      reminderFilter._id = {
        $in: studentIds,
      };
    }

    const unpaidStudents =
      await this.studentModel.find(reminderFilter);

    if (
      unpaidStudents.length === 0
    ) {
      return {
        message:
          'No unpaid students found',

        totalEligible:
          0,

        sent:
          0,

        failed:
          0,
      };
    }

    const formattedDueDate = this.formatDueDateForMessage(feeDueDate);

    let sent = 0;
    let failed = 0;

    for (
      const student
      of unpaidStudents
    ) {
      try {
        if (reminderType === 'overdue') {
          await this.whatsappService.sendOverdueFeeReminder(
            {
              phone:
                student.phone,

              parentName:
                student.parentName,

              studentName:
                student.studentName,

              studentId:
                student._id.toString(),
            },
          );
        } else {
          await this.whatsappService.sendFeeDueReminder(
            {
              phone:
                student.phone,

              parentName:
                student.parentName,

              studentName:
                student.studentName,

              dueDate:
                formattedDueDate,

              studentId:
                student._id.toString(),
            },
          );
        }

        sent++;
      } catch (error) {
        failed++;

        console.error(
          `Fee reminder failed for ${student.studentName}:`,
          error,
        );
      }
    }

    return {
      message:
        'Fee reminders processed successfully',

      totalEligible:
        unpaidStudents.length,

      sent,

      failed,
    };
  }

  async sendAutomaticDueReminders() {
    const setting =
      await this.getActivePaymentSetting();

    if (!setting?.feeDueDate) {
      return {
        message:
          'Fee due date is not set',

        sent:
          0,

        failed:
          0,
      };
    }

    const now =
      new Date();

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

    const sameDay = (date?: Date | null) => date && new Date(date).toDateString() === today.toDateString();
    const runs = [
      { date: setting.preventReminderDate, last: 'lastPreventReminderSentAt' as const, label: 'Prevent reminder', type: 'prevent' as const },
      { date: setting.overdueReminderDate, last: 'lastOverdueReminderSentAt' as const, label: 'Overdue reminder', type: 'overdue' as const },
    ];

    for (const run of runs) {
      if (!sameDay(run.date) || sameDay(setting[run.last])) continue;
      const result = await this.sendDueReminders(
        undefined,
        true,
        run.type,
      );
      setting[run.last] = new Date();
      await setting.save();
      return { ...result, message: `${run.label} processed successfully`, automatic: true };
    }

    return { message: 'No reminder scheduled for today', sent: 0, failed: 0, automatic: true };
  }

  // Every collected payment always creates its own history record here —
  // the fee-cycle-aware collect flow above is the only caller now (the old
  // "mark as paid via Edit Student" path that used to call a separate,
  // dedupe-by-billing-month createPayment() has been removed along with
  // that flow).
  async recordCollection(
    data: {
      studentId:
        string;

      studentName:
        string;

      phone:
        string;

      course:
        string;

      amount:
        number;

      paymentMethod:
        | 'cash'
        | 'bank'
        | 'upi'
        | 'qr';

      paymentProofImage?:
        string;

      feeCycleId:
        Types.ObjectId;

      cycleNumber:
        number;
    },
  ) {
    const setting =
      await this.getActivePaymentSetting();

    const billingDate =
      setting?.feeDueDate
        ? new Date(
            setting.feeDueDate,
          )
        : new Date();

    const billingMonth =
      this.getBillingMonth(
        billingDate,
      );

    const payment =
      new this.paymentModel({
        studentId:
          data.studentId,

        studentName:
          data.studentName,

        phone:
          data.phone,

        course:
          data.course,

        amount:
          data.amount,

        billingMonth,

        paymentMethod:
          data.paymentMethod,

        paymentStatus:
          'paid',

        paymentDate:
          new Date(),

        paymentProofImage:
          data.paymentProofImage || '',

        feeCycleId:
          data.feeCycleId,

        cycleNumber:
          data.cycleNumber,
      });

    const savedPayment =
      await payment.save();

    try {
      await this.whatsappService.sendPaymentReceived(
        {
          phone:
            data.phone,

          studentName:
            data.studentName,

          course:
            data.course,

          amount:
            data.amount,
        },
      );
    } catch (error) {
      console.error(
        'Payment received WhatsApp message failed:',
        error,
      );
    }

    return savedPayment;
  }
}
