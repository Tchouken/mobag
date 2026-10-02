// Contrôle après un test de charge : un vote et un seul par votant, aucun vote rejoué en double,
// clôture, résultat, empreinte des votes et chaîne d'audit.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const run = JSON.parse(readFileSync(new URL("./.data/run.json", import.meta.url), "utf8"));
const db = new Client({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await db.connect();

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const counts = await one(
  `select (select count(*) from public.votes where ballot_id = $1)::int as votes,
          (select count(distinct member_id) from public.votes where ballot_id = $1)::int as members,
          (select count(*) from public.vote_events where ballot_id = $1)::int as events,
          (select count(*) from public.vote_requests where ballot_id = $1)::int as requests`,
  [run.ballotId],
);
await db.query("begin");
await db.query("select set_config('request.jwt.claims', $1, true)", [
  JSON.stringify({ sub: run.staff, role: "authenticated" }),
]);
const { result } = await one("select public.close_ballot($1) as result", [run.ballotId]);
await db.query("commit");
const { chain } = await one("select private.verify_audit_chain_unchecked($1) as chain", [run.assemblyId]);
await db.end();

const expected = run.voters.length;
const checks = [
  [counts.votes === expected, `${counts.votes} votes pour ${expected} votants`],
  [counts.members === expected, `${counts.members} membres distincts`],
  [counts.events === expected, `${counts.events} événements de vote (les réessais n'écrivent rien)`],
  [counts.requests === expected, `${counts.requests} requêtes distinctes enregistrées`],
  [
    Number(result.tallies.voted.heads) === expected,
    `résultat : ${result.tallies.voted.heads} votants, ${result.outcome}`,
  ],
  [
    chain.ok && chain.ballots >= 1,
    `chaîne d'audit et empreinte des votes : ${chain.ok ? "intègres" : chain.reason}`,
  ],
];
for (const [ok, label] of checks) console.log(`${ok ? "ok" : "ÉCHEC"} - ${label}`);
process.exit(checks.every(([ok]) => ok) ? 0 : 1);
