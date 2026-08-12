import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Student,
  StudentDocument,
} from './students.schema';

import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    private readonly paymentsService: PaymentsService,
  ) {}

  private normalizeParentName(parentName: string) {
    return parentName
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
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

      paidAmount: 0,

      pendingAmount:
        createStudentDto.totalFee,

      paymentStatus: 'unpaid',

      paymentMethod: undefined,

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

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ) {
    const student =
      await this.findOne(id);

    const previousPaymentStatus =
      student.paymentStatus;

    const {
      paymentMethod,
      paidAmount,
      pendingAmount,
      ...studentUpdateData
    } = updateStudentDto;

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

    const isChangingToPaid =
      previousPaymentStatus !== 'paid' &&
      studentUpdateData.paymentStatus ===
        'paid';

    if (
      isChangingToPaid &&
      !paymentMethod
    ) {
      throw new BadRequestException(
        'Payment method is required when marking student as paid',
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

    if (
      student.paymentStatus === 'paid'
    ) {
      student.paidAmount =
        student.totalFee;

      student.pendingAmount = 0;

      if (paymentMethod) {
        student.paymentMethod =
          paymentMethod;
      }
    } else {
      student.paymentStatus =
        'unpaid';

      student.paidAmount = 0;

      student.pendingAmount =
        student.totalFee;

      student.paymentMethod =
        undefined;
    }

    const updatedStudent =
      await student.save();

    if (isChangingToPaid) {
      await this.paymentsService.createPayment({
        studentId:
          updatedStudent._id.toString(),

        studentName:
          updatedStudent.studentName,

        phone:
          updatedStudent.phone,

        course:
          updatedStudent.course,

        amount:
          updatedStudent.totalFee,

        paymentMethod:
          paymentMethod as
            | 'cash'
            | 'bank'
            | 'upi'
            | 'qr',
      });
    }

    return updatedStudent;
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