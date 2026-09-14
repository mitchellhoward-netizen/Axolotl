import { randomUUID } from 'node:crypto';
import type { BenefitCase, Fault, Workflow } from './model.js';
import { BenefitStore, LabError } from './store.js';

export interface ProviderOrder {
  reference: string;
  workflow: Workflow;
  fault: Fault;
  acceptedAt: number;
  readyAt: number;
  existing: boolean;
  amountCents: number;
}

/** A live adapter must implement lookup before submit and return authoritative outcomes.
 * This interface is provisional: it is NOT an invented CVS API specification. */
export interface BenefitProvider {
  lookup(owner: string, actionKey: string): Promise<ProviderOrder | undefined>;
  submit(owner: string, c: BenefitCase, now: number): Promise<ProviderOrder>;
  observeExisting(owner: string, c: BenefitCase, now: number): Promise<ProviderOrder>;
}

/** Independent durable provider ledger: it can accept an action even if the app crashes.
 * No fetch, email, browser, or external credential is reachable from this adapter. */
export class SimulatedProvider implements BenefitProvider {
  constructor(private readonly store: BenefitStore) {}

  async lookup(owner: string, actionKey: string): Promise<ProviderOrder | undefined> {
    const r = await this.store.pool.query(`SELECT o.data FROM provider_actions a JOIN provider_orders o ON a.reference=o.id
      WHERE a.owner=$1 AND o.owner=$1 AND a.action_key=$2`, [owner, actionKey]);
    return r.rows[0]?.data;
  }

  async observeExisting(owner: string, c: BenefitCase, now: number): Promise<ProviderOrder> {
    return this.record(owner, c, now, true);
  }

  async submit(owner: string, c: BenefitCase, now: number): Promise<ProviderOrder> {
    if (c.fault === 'unavailable') throw new Error('Simulated provider unavailable');
    if (c.fault === 'expired_connection') throw new LabError('Connection expired; reconnect and approve again');
    if (c.fault === 'slot_lost') throw new LabError('Selected slot disappeared; choose and approve a new time');
    const order = await this.record(owner, c, now, false);
    if (c.fault === 'timeout_after_submit') throw new Error('Simulated response lost after provider accepted request');
    return order;
  }

  private async record(owner: string, c: BenefitCase, now: number, existing: boolean): Promise<ProviderOrder> {
    const key = c.actionKey!;
    const tx = await this.store.pool.connect();
    try {
      await tx.query('BEGIN');
      // Serializes idempotency and same-expense reservations, including concurrent different cases.
      await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [owner]);
      const prior = await tx.query(`SELECT o.data FROM provider_actions a JOIN provider_orders o ON o.id=a.reference
        WHERE a.owner=$1 AND o.owner=$1 AND a.action_key=$2`, [owner, key]);
      if (prior.rows[0]) { await tx.query('COMMIT'); return prior.rows[0].data; }
      let reference = `SIM-${randomUUID()}`;
      if (c.providerReference) {
        const old = await tx.query('SELECT id,data FROM provider_orders WHERE owner=$1 AND id=$2 AND case_id=$3', [owner, c.providerReference, c.id]);
        if (!old.rows[0] || old.rows[0].data.fault !== 'missing_document') throw new LabError('Existing request requires operator reconciliation');
        reference = old.rows[0].id;
      } else if (c.facts.expenseId) {
        const duplicate = await tx.query('SELECT id FROM provider_orders WHERE owner=$1 AND expense_id=$2', [owner, c.facts.expenseId]);
        if (duplicate.rows.length) throw new LabError('This expense already has a provider claim. Operator must reconcile it, not resubmit.');
      }
      const order: ProviderOrder = { reference, workflow: c.workflow, fault: c.fault,
        acceptedAt: now, readyAt: now + 60000, existing, amountCents: c.facts.amountCents };
      if (c.providerReference) {
        await tx.query('UPDATE provider_orders SET data=$3 WHERE owner=$1 AND id=$2', [owner, reference, order]);
      } else {
        await tx.query('INSERT INTO provider_orders(id,owner,case_id,expense_id,data) VALUES($1,$2,$3,$4,$5)',
          [reference, owner, c.id, c.facts.expenseId ?? null, order]);
      }
      await tx.query('INSERT INTO provider_actions(action_key,owner,reference) VALUES($1,$2,$3)', [key, owner, reference]);
      await tx.query('COMMIT');
      return order;
    } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  }
}
