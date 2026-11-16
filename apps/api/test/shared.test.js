import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closeDb, createBusiness, db, s } from './helpers.js';
import { businessIsListed, setupChecklist } from '../src/lib/businessReady.js';
import { eq } from 'drizzle-orm';

before(setupDb);
after(closeDb);

describe('utilidades compartidas', () => {
  it('solo lista negocios aprobados y configurados (RF-71)', async () => {
    const ready = await createBusiness();
    const noRules = await createBusiness({ rules: { minNoticeMinutes: null } });
    const pending = await createBusiness({ status: 'pending' });
    const rows = await db
      .select({ id: s.businesses.id })
      .from(s.businesses)
      .where(businessIsListed());
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(ready.business.id));
    assert.ok(!ids.includes(noRules.business.id));
    assert.ok(!ids.includes(pending.business.id));

    await db
      .update(s.services)
      .set({ active: false })
      .where(eq(s.services.businessId, ready.business.id));
    const after = await setupChecklist(ready.business.id);
    assert.equal(after.ready, false);
    assert.equal(after.steps.find((x) => x.key === 'services').done, false);
  });
});
