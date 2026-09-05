import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import {
  Student,
  StudentDocument,
} from './students.schema';

import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaymentsService } from '../payments/payments.service';
import { AcademicService } from '../academic/academic.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionsMap } from '../permissions/permissions.constants';
import {
  BULK_UPLOAD_COLUMNS,
  BULK_UPLOAD_EXAMPLE_ROWS,
  BULK_UPLOAD_INSTRUCTIONS,
} from './bulk-upload.constants';

export interface BulkUploadRowResult {
  row: number;
  studentName: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason: string;
  data: Record<string, any>;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    private readonly paymentsService: PaymentsService,
    private readonly academicService: AcademicService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private normalizeParentName(parentName: string) {
    return parentName
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private normalizeForCompare(value: string) {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private formatBatchLabel(batch: {
    batchName: string;
    startTime: string;
    endTime: string;
  }) {
    return `${batch.batchName} — ${batch.startTime} - ${batch.endTime}`;
  }

  // ExcelJS reports a cell's `.value` as a plain string/number/boolean for
  // simple cells, but as one of several wrapper shapes for anything richer
  // (rich text runs, formulas, hyperlinks, dates). Pasting data in from
  // another source — the normal way an admin builds a multi-row upload —
  // routinely produces rich-text cells, so every one of those shapes needs
  // to be unwrapped or the value is silently lost.
  private extractCellValue(value: any): any {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value.richText)) {
      return value.richText
        .map((run: any) => run?.text ?? '')
        .join('');
    }

    if ('result' in value) {
      return this.extractCellValue(value.result);
    }

    if (typeof value.text === 'string') {
      return value.text;
    }

    return '';
  }

  private async validateUniqueFields(
    data: {
      parentName?: string;
      rollNo?: string;
      phone?: string;
      alternatePhone?: string;
      email?: string;
      idproof?: string;
    },
    excludeStudentId?: string,
  ) {
    const excludeQuery = excludeStudentId
      ? {
          _id: {
            $ne: excludeStudentId,
          },
        }
      : {};

    if (data.rollNo) {
      const existingRollNo =
        await this.studentModel.findOne({
          ...excludeQuery,
          rollNo: data.rollNo.trim(),
        });

      if (existingRollNo) {
        throw new ConflictException(
          'Roll number already exists',
        );
      }
    }

    if (data.phone && data.parentName) {
      const existingStudents =
        await this.studentModel.find({
          ...excludeQuery,
          $or: [
            {
              phone: data.phone.trim(),
            },
            {
              alternatePhone: data.phone.trim(),
            },
          ],
        });

      const currentParent =
        this.normalizeParentName(
          data.parentName,
        );

      const differentParent =
        existingStudents.find(
          (existingStudent) =>
            this.normalizeParentName(
              existingStudent.parentName,
            ) !== currentParent,
        );

      if (differentParent) {
        throw new ConflictException(
          'Phone number is already registered with another parent',
        );
      }
    }

    if (
      data.phone &&
      data.alternatePhone &&
      data.phone.trim() ===
        data.alternatePhone.trim()
    ) {
      throw new ConflictException(
        'Phone number and alternative phone number cannot be the same',
      );
    }

    if (
      data.alternatePhone &&
      data.parentName
    ) {
      const existingStudents =
        await this.studentModel.find({
          ...excludeQuery,
          $or: [
            {
              phone:
                data.alternatePhone.trim(),
            },
            {
              alternatePhone:
                data.alternatePhone.trim(),
            },
          ],
        });

      const currentParent =
        this.normalizeParentName(
          data.parentName,
        );

      const differentParent =
        existingStudents.find(
          (existingStudent) =>
            this.normalizeParentName(
              existingStudent.parentName,
            ) !== currentParent,
        );

      if (differentParent) {
        throw new ConflictException(
          'Alternative phone number is already registered with another parent',
        );
      }
    }

    if (data.email) {
      const existingEmail =
        await this.studentModel.findOne({
          ...excludeQuery,
          email: data.email
            .trim()
            .toLowerCase(),
        });

      if (existingEmail) {
        throw new ConflictException(
          'Email ID already exists',
        );
      }
    }

    if (data.idproof) {
      const existingAadhaar =
        await this.studentModel.findOne({
          ...excludeQuery,
          idproof: data.idproof.trim(),
        });

      if (existingAadhaar) {
        throw new ConflictException(
          'Aadhaar number already exists',
        );
      }
    }
  }

  async create(
    createStudentDto: CreateStudentDto,
  ) {
    await this.validateUniqueFields({
      parentName:
        createStudentDto.parentName,

      rollNo:
        createStudentDto.rollNo,

      phone:
        createStudentDto.phone,

      alternatePhone:
        createStudentDto.alternatePhone,

      email:
        createStudentDto.email,

      idproof:
        createStudentDto.idproof,
    });

    const student = new this.studentModel({
      ...createStudentDto,

      studentName:
        createStudentDto.studentName.trim(),

      parentName:
        createStudentDto.parentName
          .trim()
          .replace(/\s+/g, ' '),

      rollNo:
        createStudentDto.rollNo.trim(),

      phone:
        createStudentDto.phone.trim(),

      alternatePhone:
        createStudentDto.alternatePhone
          ?.trim() || undefined,

      email:
        createStudentDto.email
          ?.trim()
          .toLowerCase() || undefined,

      course:
        createStudentDto.course.trim(),

      idproof:
        createStudentDto.idproof.trim(),

      // No fee fields set here at all — a new student starts with no fee
      // cycle ("+" on the Payments page). Fees are only ever created via
      // PaymentsService.generateFeeCycle(), from the Payments page.
      isActive: true,
    });

    return student.save();
  }

  async findAll() {
    return this.studentModel
      .find()
      .sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const student =
      await this.studentModel.findById(id);

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    return student;
  }

  // Fee amounts (totalFee/paidAmount/pendingAmount) must never reach a
  // caller without the global `fees` permission — stripped here, at the
  // response boundary, rather than relying on the frontend to just not
  // render them. Driven by PermissionsService so admins (always full-access)
  // and trainers (per-trainer configured) both go through one code path.
  private omitFeeFields(
    student: StudentDocument,
    effective: PermissionsMap,
  ) {
    return this.permissionsService.pickAllowedFields(
      student,
      effective,
      'students',
      [
        {
          kind: 'global',
          key: 'fees',
          fields: [
            'totalFee',
            'paidAmount',
            'pendingAmount',
          ],
        },
      ],
    );
  }

  async findAllForRole(
    role?: string,
    userId?: string,
  ) {
    const students =
      await this.findAll();

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return students.map((student) =>
      this.omitFeeFields(student, effective),
    );
  }

  // The Payments page needs the same underlying student records as the
  // Students page (name, fee numbers, proof, status...), but Payments and
  // Students are independent page permissions — a Trainer granted only
  // Payments access must not be blocked from loading it just because they
  // don't also have Students page access, and must not see fields
  // (address, idproof, parentName, ...) that only the Students page's own
  // permissions are meant to gate. This projects down to exactly what
  // Payment.jsx's buildPaymentRow reads before applying the same
  // fee-stripping as findAllForRole.
  private toPaymentsProjection(
    student: StudentDocument,
  ) {
    return {
      _id: student._id,
      studentName: student.studentName,
      rollNo: student.rollNo,
      course: student.course,
      batch: student.batch,
      phone: student.phone,
      isActive: student.isActive,
      paymentStatus: student.paymentStatus,
      paymentMethod: student.paymentMethod,
      paymentProofImage: student.paymentProofImage,
      paymentProofUploadedAt:
        student.paymentProofUploadedAt,
      totalFee: student.totalFee,
      paidAmount: student.paidAmount,
      pendingAmount: student.pendingAmount,
      updatedAt: (student as any).updatedAt,
    };
  }

  async findAllForPaymentsRole(
    role?: string,
    userId?: string,
  ) {
    const students =
      await this.findAll();

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return students.map((student) =>
      this.permissionsService.pickAllowedFields(
        this.toPaymentsProjection(student),
        effective,
        'students',
        [
          {
            kind: 'global',
            key: 'fees',
            fields: [
              'totalFee',
              'paidAmount',
              'pendingAmount',
            ],
          },
        ],
      ),
    );
  }

  async findOneForRole(
    id: string,
    role?: string,
    userId?: string,
  ) {
    const student =
      await this.findOne(id);

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitFeeFields(
      student,
      effective,
    );
  }

  // Identity/contact-detail edits only — fees are never touched here.
  // Editing a student can no longer adjust totalFee/paidAmount/
  // pendingAmount/paymentStatus in any way; the only way to change a
  // student's fee is PaymentsService.generateFeeCycle() (a brand new fee
  // cycle) or collectFeeCyclePayment() (paying down the active one), both
  // driven from the Payments page's Status column, never from here.
  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ) {
    const student =
      await this.findOne(id);

    const studentUpdateData = {
      ...updateStudentDto,
    };

    const finalParentName =
      studentUpdateData.parentName ??
      student.parentName;

    const finalPhone =
      studentUpdateData.phone ??
      student.phone;

    const finalAlternatePhone =
      studentUpdateData.alternatePhone ??
      student.alternatePhone;

    if (
      finalPhone &&
      finalAlternatePhone &&
      finalPhone.trim() ===
        finalAlternatePhone.trim()
    ) {
      throw new ConflictException(
        'Phone number and alternative phone number cannot be the same',
      );
    }

    await this.validateUniqueFields(
      {
        parentName:
          finalParentName,

        rollNo:
          studentUpdateData.rollNo,

        phone:
          finalPhone,

        alternatePhone:
          finalAlternatePhone,

        email:
          studentUpdateData.email,

        idproof:
          studentUpdateData.idproof,
      },
      id,
    );

    if (
      studentUpdateData.studentName
    ) {
      studentUpdateData.studentName =
        studentUpdateData.studentName.trim();
    }

    if (
      studentUpdateData.parentName
    ) {
      studentUpdateData.parentName =
        studentUpdateData.parentName
          .trim()
          .replace(/\s+/g, ' ');
    }

    if (
      studentUpdateData.rollNo
    ) {
      studentUpdateData.rollNo =
        studentUpdateData.rollNo.trim();
    }

    if (
      studentUpdateData.phone
    ) {
      studentUpdateData.phone =
        studentUpdateData.phone.trim();
    }

    if (
      studentUpdateData.alternatePhone
    ) {
      studentUpdateData.alternatePhone =
        studentUpdateData.alternatePhone.trim();
    }

    if (
      studentUpdateData.email
    ) {
      studentUpdateData.email =
        studentUpdateData.email
          .trim()
          .toLowerCase();
    }

    if (
      studentUpdateData.course
    ) {
      studentUpdateData.course =
        studentUpdateData.course.trim();
    }

    if (
      studentUpdateData.idproof
    ) {
      studentUpdateData.idproof =
        studentUpdateData.idproof.trim();
    }

    const cleanStudentUpdateData =
      Object.fromEntries(
        Object.entries(
          studentUpdateData,
        ).filter(
          ([, value]) =>
            value !== undefined,
        ),
      );

    Object.assign(
      student,
      cleanStudentUpdateData,
    );

    return student.save();
  }

  // Thin delegate — all fee-cycle math/validation lives in
  // PaymentsService.collectFeeCyclePayment() (pays down the active cycle
  // only; rejects if there's no active cycle or it's already fully paid).
  async collectPayment(
    id: string,
    amount: number,
    paymentMethod?:
      | 'cash'
      | 'bank'
      | 'upi'
      | 'qr',
    role?: string,
    userId?: string,
  ) {
    const updatedStudent =
      await this.paymentsService.collectFeeCyclePayment(
        id,
        amount,
        paymentMethod,
        role,
      );

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitFeeFields(
      updatedStudent,
      effective,
    );
  }

  // Starts a brand new fee cycle (see PaymentsService.generateFeeCycle for
  // the "must be fully paid first" enforcement) — the only way a student's
  // fee is set once a cycle is already fully paid. While the active cycle
  // is still unpaid/partial, editFeeCycleAmount below corrects it in place
  // instead.
  async generateFeeCycle(
    id: string,
    totalFee: number,
    role?: string,
    userId?: string,
  ) {
    const updatedStudent =
      await this.paymentsService.generateFeeCycle(
        id,
        totalFee,
      );

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitFeeFields(
      updatedStudent,
      effective,
    );
  }

  // Thin delegate — see PaymentsService.editFeeCycleAmount for the
  // "must not be fully paid yet" enforcement.
  async editFeeCycleAmount(
    id: string,
    totalFee: number,
    role?: string,
    userId?: string,
  ) {
    const updatedStudent =
      await this.paymentsService.editFeeCycleAmount(
        id,
        totalFee,
      );

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitFeeFields(
      updatedStudent,
      effective,
    );
  }

  // Every fee cycle this student has ever had, each with only its own
  // payment history — for the Payments page's "Fee Collection History"
  // panel.
  async getFeeCycles(
    id: string,
    role?: string,
    userId?: string,
  ) {
    await this.findOne(id);

    const feeCycles =
      await this.paymentsService.getFeeCyclesWithHistory(
        id,
      );

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    if (
      this.permissionsService.hasGlobalPermission(
        effective,
        'fees',
      )
    ) {
      return feeCycles;
    }

    return feeCycles.map((feeCycle) => ({
      _id: feeCycle._id,
      cycleNumber: feeCycle.cycleNumber,
      status: feeCycle.status,
      payments: feeCycle.payments.map(
        (payment) => ({
          _id: payment._id,
          paymentMethod: payment.paymentMethod,
          paymentProofImage: payment.paymentProofImage,
          paymentDate: payment.paymentDate,
        }),
      ),
    }));
  }

  async generateBulkUploadTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const dataSheet = workbook.addWorksheet('Student Data');

    dataSheet.columns = BULK_UPLOAD_COLUMNS.map(
      (column) => ({
        header: column.header,
        key: column.field,
        width: 22,
      }),
    );

    dataSheet.getRow(1).font = {
      bold: true,
    };

    for (const example of BULK_UPLOAD_EXAMPLE_ROWS) {
      dataSheet.addRow(example);
    }

    const instructionsSheet =
      workbook.addWorksheet('Instructions');

    instructionsSheet.getColumn(1).width = 100;

    for (const line of BULK_UPLOAD_INSTRUCTIONS) {
      instructionsSheet.addRow(line);
    }

    instructionsSheet.getRow(1).font = {
      bold: true,
      size: 13,
    };

    const [officialCourses, officialBatches] =
      await Promise.all([
        this.academicService.getCourses(),
        this.academicService.getBatches(),
      ]);

    const optionsSheet = workbook.addWorksheet(
      'Course & Batch Options',
    );

    optionsSheet.columns = [
      { header: 'Course (copy exactly)', key: 'course', width: 30 },
      { header: 'Batch (copy exactly)', key: 'batch', width: 40 },
    ];

    optionsSheet.getRow(1).font = { bold: true };

    const optionRowCount = Math.max(
      officialCourses.length,
      officialBatches.length,
    );

    for (let i = 0; i < optionRowCount; i++) {
      optionsSheet.addRow({
        course: officialCourses[i]?.courseName || '',
        batch: officialBatches[i]
          ? this.formatBatchLabel(officialBatches[i])
          : '',
      });
    }

    const arrayBuffer =
      await workbook.xlsx.writeBuffer();

    return Buffer.from(arrayBuffer);
  }

  async parseBulkUploadFile(
    buffer: Buffer,
    originalName: string,
  ): Promise<Record<string, any>[]> {
    const isCsv = originalName
      .toLowerCase()
      .endsWith('.csv');

    const workbook = new ExcelJS.Workbook();

    try {
      if (isCsv) {
        await workbook.csv.read(
          Readable.from(buffer),
        );
      } else {
        await workbook.xlsx.load(
          buffer as any,
        );
      }
    } catch {
      throw new BadRequestException(
        'Unable to read the uploaded file. Please upload a valid .xlsx or .csv file exported from the template.',
      );
    }

    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 1) {
      throw new BadRequestException(
        'The uploaded file has no data',
      );
    }

    const headerRow = sheet.getRow(1);
    const fieldByColumn: Record<number, string> = {};

    headerRow.eachCell(
      { includeEmpty: true },
      (cell, colNumber) => {
        const text = String(
          cell.value ?? '',
        ).trim().toLowerCase();

        const match = BULK_UPLOAD_COLUMNS.find(
          (column) =>
            column.header.toLowerCase() === text,
        );

        if (match) {
          fieldByColumn[colNumber] = match.field;
        }
      },
    );

    const foundFields = new Set(
      Object.values(fieldByColumn),
    );

    const missingRequired =
      BULK_UPLOAD_COLUMNS.filter(
        (column) =>
          column.required &&
          !foundFields.has(column.field),
      );

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `The uploaded file is missing required column(s): ${missingRequired
          .map((column) => column.header)
          .join(', ')}. Please use the provided template.`,
      );
    }

    const rows: Record<string, any>[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const rowData: Record<string, any> = {
        __row: rowNumber,
      };

      let hasAnyValue = false;

      for (const [colNumber, field] of Object.entries(
        fieldByColumn,
      )) {
        const value = this.extractCellValue(
          row.getCell(Number(colNumber)).value,
        );

        rowData[field] =
          typeof value === 'string'
            ? value.trim()
            : value;

        if (
          rowData[field] !== '' &&
          rowData[field] !== null &&
          rowData[field] !== undefined
        ) {
          hasAnyValue = true;
        }
      }

      if (hasAnyValue) {
        rows.push(rowData);
      }
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'No student rows found in the uploaded file',
      );
    }

    return rows;
  }

  private buildDtoPlainObject(
    raw: Record<string, any>,
  ) {
    const asString = (value: any) =>
      value === undefined || value === null
        ? ''
        : String(value).trim();

    const asOptionalString = (value: any) => {
      const text = asString(value);
      return text || undefined;
    };

    return {
      studentName: asString(raw.studentName),
      rollNo: asString(raw.rollNo),
      parentName: asString(raw.parentName),
      phone: asString(raw.phone),
      alternatePhone: asOptionalString(
        raw.alternatePhone,
      ),
      email: asOptionalString(
        raw.email,
      )?.toLowerCase(),
      course: asString(raw.course),
      idproof: asString(raw.idproof),
      batch: asOptionalString(raw.batch),
      schoolName: asOptionalString(
        raw.schoolName,
      ),
      address: asOptionalString(raw.address),
    };
  }

  async validateBulkUpload(
    rawRows: Record<string, any>[],
  ) {
    const seenRollNo = new Set<string>();
    const seenIdproof = new Set<string>();
    const seenEmail = new Set<string>();
    const phoneParentSeen = new Map<
      string,
      string
    >();

    const [officialCourses, officialBatches] =
      await Promise.all([
        this.academicService.getCourses(),
        this.academicService.getBatches(),
      ]);

    const validCourseNames = new Set(
      officialCourses.map((course) =>
        this.normalizeForCompare(course.courseName),
      ),
    );

    const validBatchLabels = new Set(
      officialBatches.map((batch) =>
        this.normalizeForCompare(
          this.formatBatchLabel(batch),
        ),
      ),
    );

    const results: BulkUploadRowResult[] = [];

    for (const raw of rawRows) {
      const plain = this.buildDtoPlainObject(raw);

      const displayName =
        plain.studentName || '(blank)';

      const dto = plainToInstance(
        CreateStudentDto,
        plain,
      );

      const errors = await validate(dto);

      if (errors.length > 0) {
        const reason = errors
          .map((error) =>
            Object.values(
              error.constraints || {},
            ).join('; '),
          )
          .filter(Boolean)
          .join('; ') || 'Invalid data';

        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'invalid',
          reason,
          data: plain,
        });

        continue;
      }

      if (
        !validCourseNames.has(
          this.normalizeForCompare(plain.course),
        )
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'invalid',
          reason: `Course "${plain.course}" does not match any course configured on the website`,
          data: plain,
        });

        continue;
      }

      if (
        plain.batch &&
        !validBatchLabels.has(
          this.normalizeForCompare(plain.batch),
        )
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'invalid',
          reason: `Batch "${plain.batch}" does not match any batch configured on the website`,
          data: plain,
        });

        continue;
      }

      const rollNoKey =
        plain.rollNo.toLowerCase();

      const idproofKey =
        plain.idproof.replace(/\s/g, '');

      if (seenRollNo.has(rollNoKey)) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Roll No)',
          data: plain,
        });

        continue;
      }

      if (seenIdproof.has(idproofKey)) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Aadhaar Number)',
          data: plain,
        });

        continue;
      }

      if (
        plain.email &&
        seenEmail.has(plain.email)
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Email)',
          data: plain,
        });

        continue;
      }

      const normalizedParent =
        this.normalizeParentName(
          plain.parentName,
        );

      const previousParentForPhone =
        phoneParentSeen.get(plain.phone);

      if (
        previousParentForPhone &&
        previousParentForPhone !==
          normalizedParent
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Phone already used with a different parent)',
          data: plain,
        });

        continue;
      }

      try {
        await this.validateUniqueFields({
          parentName: plain.parentName,
          rollNo: plain.rollNo,
          phone: plain.phone,
          alternatePhone: plain.alternatePhone,
          email: plain.email,
          idproof: plain.idproof,
        });
      } catch (error) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            error instanceof Error
              ? error.message
              : 'Duplicate student',
          data: plain,
        });

        continue;
      }

      seenRollNo.add(rollNoKey);
      seenIdproof.add(idproofKey);

      if (plain.email) {
        seenEmail.add(plain.email);
      }

      phoneParentSeen.set(
        plain.phone,
        normalizedParent,
      );

      results.push({
        row: raw.__row,
        studentName: displayName,
        status: 'valid',
        reason: 'Ready to import',
        data: plain,
      });
    }

    return {
      summary: {
        totalRows: results.length,

        validRows: results.filter(
          (result) =>
            result.status === 'valid',
        ).length,

        duplicateRows: results.filter(
          (result) =>
            result.status === 'duplicate',
        ).length,

        invalidRows: results.filter(
          (result) =>
            result.status === 'invalid',
        ).length,
      },

      rows: results,
    };
  }

  async importBulkUpload(
    rows: Array<{
      row: number;
      data: Record<string, any>;
    }>,
  ) {
    let successCount = 0;
    let duplicateSkipped = 0;
    let invalidSkipped = 0;

    const skipped: Array<{
      row: number;
      studentName: string;
      reason: string;
    }> = [];

    for (const item of rows) {
      const data = item.data || {};
      const displayName =
        data.studentName || '(blank)';

      try {
        const dto = plainToInstance(
          CreateStudentDto,
          data,
        );

        const errors = await validate(dto);

        if (errors.length > 0) {
          invalidSkipped++;

          skipped.push({
            row: item.row,
            studentName: displayName,
            reason: 'Invalid data',
          });

          continue;
        }

        await this.create(dto);

        successCount++;
      } catch (error) {
        if (error instanceof ConflictException) {
          duplicateSkipped++;
        } else {
          invalidSkipped++;
        }

        skipped.push({
          row: item.row,
          studentName: displayName,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to import this row',
        });
      }
    }

    return {
      totalRows: rows.length,
      successCount,
      duplicateSkipped,
      invalidSkipped,
      skipped,
    };
  }

  async remove(id: string) {
    const student =
      await this.studentModel.findByIdAndDelete(
        id,
      );

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    return {
      message:
        'Student deleted successfully',
    };
  }
}