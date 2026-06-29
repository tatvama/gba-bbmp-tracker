import { loadEnv, makeClient, requireDatabaseUrl } from "./db";
import { computeRtiDeadlines } from "../lib/rti-deadlines";
import { DEFAULT_DEADLINE_RULES } from "../lib/constants";

loadEnv();

async function main() {
  const url = requireDatabaseUrl();
  const client = makeClient(url);
  try {
    await client.connect();
    // 1. Recalculate and update all RTI applications
    const res = await client.query(`
      select r.id, r.date_filed, r.date_received, r.is_life_liberty, r.reply_date,
             (select faa_order_date from public.rti_first_appeals fa where fa.rti_id = r.id and fa.faa_order_date is not null order by fa.created_at desc limit 1) as first_appeal_decision_date
      from public.rti_applications r
    `);
    
    console.log(`Found ${res.rows.length} RTI applications to update...`);
    
    for (const rti of res.rows) {
      const deadlines = computeRtiDeadlines({
        dateReceived: rti.date_received,
        dateFiled: rti.date_filed,
        isLifeLiberty: rti.is_life_liberty,
        replyDate: rti.reply_date,
        firstAppealDecisionDate: rti.first_appeal_decision_date,
      }, DEFAULT_DEADLINE_RULES);
      
      await client.query(`
        update public.rti_applications
        set normal_due = $1,
            life_liberty_due = $2,
            first_appeal_due = $3,
            second_appeal_due = $4
        where id = $5
      `, [
        deadlines.normalDue,
        deadlines.lifeLibertyDue,
        deadlines.firstAppealDue,
        deadlines.secondAppealDue,
        rti.id
      ]);
    }
    
    console.log("All RTI applications updated successfully!");

    // 2. Recalculate and update all first appeals
    const resAppeals = await client.query(`
      select id, date_filed
      from public.rti_first_appeals
      where date_filed is not null
    `);
    console.log(`Found ${resAppeals.rows.length} first appeals to update...`);
    for (const fa of resAppeals.rows) {
      const faaOrderDue = new Date(new Date(fa.date_filed).getTime() + DEFAULT_DEADLINE_RULES.faaDisposalDays * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await client.query(`
        update public.rti_first_appeals
        set faa_order_due = $1
        where id = $2
      `, [faaOrderDue, fa.id]);
    }
    console.log("All first appeals updated successfully!");
  } catch (e) {
    console.error("Error recalculating deadlines:", e);
  } finally {
    await client.end();
  }
}

main();
