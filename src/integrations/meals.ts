import type { ID, MealStatus } from '../domain/types.js';

export type MealProgram = 'free_reduced_application' | 'meal_voucher';

export interface MealReceipt {
  referenceId: string;
  program: MealProgram;
  summary: string;
  nextSteps: string;
}

/**
 * Nutrition-services contract. Real implementations would wrap a district's
 * free/reduced-lunch application system (or USDA meal-benefit portal) plus any
 * local voucher/meal-balance programs.
 */
export interface MealsProvider {
  getStatus(studentIds: ID[]): Promise<Record<ID, MealStatus>>;
  submitFreeReducedApplication(studentIds: ID[]): Promise<MealReceipt>;
  issueVoucher(studentIds: ID[]): Promise<MealReceipt>;
}

export class MockMealsProvider implements MealsProvider {
  private readonly issued: MealReceipt[] = [];

  constructor(private readonly statuses: Record<ID, MealStatus> = {}) {}

  async getStatus(studentIds: ID[]): Promise<Record<ID, MealStatus>> {
    const out: Record<ID, MealStatus> = {};
    for (const id of studentIds) out[id] = this.statuses[id] ?? 'unknown';
    return out;
  }

  async submitFreeReducedApplication(studentIds: ID[]): Promise<MealReceipt> {
    const receipt: MealReceipt = {
      referenceId: `MEAL-${Date.now().toString(36).toUpperCase()}`,
      program: 'free_reduced_application',
      summary: `Free & reduced meal application submitted for ${studentIds.length} student(s).`,
      nextSteps: 'The district will review it within 5 school days and notify you by email.',
    };
    this.issued.push(receipt);
    return receipt;
  }

  async issueVoucher(studentIds: ID[]): Promise<MealReceipt> {
    const receipt: MealReceipt = {
      referenceId: `VCH-${Date.now().toString(36).toUpperCase()}`,
      program: 'meal_voucher',
      summary: `Meal voucher issued for ${studentIds.length} student(s).`,
      nextSteps: 'A voucher code will be texted to your phone within the hour.',
    };
    this.issued.push(receipt);
    return receipt;
  }

  get issuedReceipts(): readonly MealReceipt[] {
    return this.issued;
  }
}
