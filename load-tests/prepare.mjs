// Préparation d'un test de charge (plan T17) : une AG de N votants émargés, chacun avec une
// vraie session anonyme (API d'authentification) associée à son code de vote, puis un scrutin
// ouvert. Écrit load-tests/.data/run.json, lu par le scénario k6.
//
//   node load-tests/prepare.mjs [--voters 2000] [--legacy-jwt]
//
// --legacy-jwt (local uniquement) : jetons re-signés en HS256 avec le secret partagé, au lieu
// des jetons ES256 émis par l'authentification. Sert à mesurer le coût de la vérification des
// signatures asymétriques par PostgREST (voir docs/lots/CHARGE_LOT1.md).
//
// Variables : DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (sinon : Supabase local).
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const N = Number(process.argv[process.argv.indexOf("--voters") + 1]) || 2000;
const CONCURRENCY = 25;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function localSupabase() {
  const env = Object.fromEntries(
    execSync("npx supabase status -o env", { encoding: "utf8" })
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  return { url: env.API_URL, key: env.PUBLISHABLE_KEY, jwtSecret: env.JWT_SECRET };
}
const LEGACY_JWT = process.argv.includes("--legacy-jwt");
const local = process.env.SUPABASE_URL ? null : localSupabase();

function hs256(token, secret) {
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ alg: "HS256", typ: "JWT" })}.${part({
    sub: claims.sub,
    role: "authenticated",
    aud: "authenticated",
    exp: claims.exp,
    is_anonymous: true,
  })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}
const { url: API_URL, key: API_KEY } = local ?? {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_PUBLISHABLE_KEY,
};

async function pool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

async function api(path, body, token) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${token ?? API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    if (attempt >= 3) throw new Error(`${path} : ${response.status} ${await response.text()}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
}

const t0 = Date.now();
const db = new Client({ connectionString: DATABASE_URL });
await db.connect();
const stamp = Date.now();
const {
  rows: [{ id: staff }],
} = await db.query(
  `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, confirmation_token, recovery_token,
                           email_change_token_new, email_change)
   values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, now(), '', '', '', '')
   returning id`,
  [`charge-${stamp}@mobag.local`],
);
const {
  rows: [{ id: org }],
} = await db.query(
  "insert into public.organizations (name, slug) values ('Test de charge', $1) returning id",
  [`charge-${stamp}`],
);
await db.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'org_admin')", [
  org,
  staff,
]);

// Tout ce qui suit est fait au nom de l'organisatrice, par les RPC (mêmes contrôles qu'en réel).
await db.query("begin");
await db.query("select set_config('request.jwt.claims', $1, true)", [
  JSON.stringify({ sub: staff, role: "authenticated" }),
]);
const {
  rows: [{ id: assembly }],
} = await db.query(
  "select public.create_assembly($1, $2, 'ago', 'association', '', '2026-06-15 18:00') as id",
  [org, `Test de charge — ${N} votants`],
);
const members = Array.from({ length: N }, (_, i) => ({
  external_ref: `V${String(i + 1).padStart(5, "0")}`,
  last_name: `Votant ${i + 1}`,
  weights: { voix: 1 + (i % 7) },
}));
await db.query("select public.import_members($1, $2, 'append', false)", [assembly, JSON.stringify(members)]);
const {
  rows: [{ id: resolution }],
} = await db.query(
  `select public.upsert_resolution($1, null, jsonb_build_object(
     'title', 'Résolution de charge', 'parent_id', null, 'body', '{"type": "doc", "content": []}'::jsonb,
     'weight_key_id', (select id from public.weight_keys where assembly_id = $1 and is_primary),
     'vote_type', 'yes_no_abstain',
     'majority_rule', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}'::jsonb,
     'abstention_policy', 'excluded', 'quorum_rule', null, 'is_secret', true)) as id`,
  [assembly],
);
await db.query(
  `select public.upsert_attendee($1, null, m.display_name, null, null, array[m.id], false)
   from public.members m where m.assembly_id = $1 order by m.external_ref`,
  [assembly],
);
await db.query("select public.assign_assembly_staff($1, $2, 'president')", [assembly, staff]);
await db.query("select public.set_assembly_status($1, 'convened', null)", [assembly]);
await db.query("select public.check_in($1, a.id) from public.attendees a where a.assembly_id = $1", [
  assembly,
]);
const { rows: tokens } = await db.query(
  `select am.member_id, public.issue_voter_token(a.id, 'personal') ->> 'code' as code
   from public.attendees a join public.attendee_members am on am.attendee_id = a.id
   where a.assembly_id = $1`,
  [assembly],
);
await db.query("select public.set_assembly_status($1, 'in_session', null)", [assembly]);
await db.query("commit");
console.log(`AG préparée (${N} votants émargés) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Un appareil par votant : session anonyme puis association du code.
const t1 = Date.now();
const voters = await pool(tokens, async ({ member_id, code }) => {
  const session = await api("/auth/v1/signup", { data: {} });
  await api("/rest/v1/rpc/claim_voter_token", { p_code: code }, session.access_token);
  const token = LEGACY_JWT
    ? hs256(session.access_token, process.env.SUPABASE_JWT_SECRET ?? local.jwtSecret)
    : session.access_token;
  return { token, memberId: member_id };
});
console.log(`${voters.length} appareils associés en ${((Date.now() - t1) / 1000).toFixed(1)} s`);

await db.query("begin");
await db.query("select set_config('request.jwt.claims', $1, true)", [
  JSON.stringify({ sub: staff, role: "authenticated" }),
]);
const {
  rows: [{ ballot }],
} = await db.query("select public.open_ballot($1) ->> 'ballot_id' as ballot", [resolution]);
await db.query("commit");
await db.end();

mkdirSync(new URL("./.data/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./.data/run.json", import.meta.url),
  JSON.stringify({
    apiUrl: API_URL,
    apiKey: API_KEY,
    assemblyId: assembly,
    ballotId: ballot,
    staff,
    jwt: LEGACY_JWT ? "HS256" : "ES256",
    voters,
  }),
);
console.log(`Scrutin ouvert : ${ballot}. Lancez : k6 run load-tests/open-ballot-burst.js`);
