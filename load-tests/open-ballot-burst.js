// Test de charge (SPEC §7.1) : ouverture d'un scrutin devant N votants.
//   · lecture : chaque écran relit son état à l'ouverture (my_voter_context, scrutins compris) ;
//   · vote : rafale jusqu'à 500 votes/s, chaque votant vote une fois ;
//   · réessais : 10 % des votants renvoient la même requête (même clé d'idempotence).
// Seuils : vote p95 < 500 ms, p99 < 1,5 s ; aucune erreur.
//
//   node load-tests/prepare.mjs --voters 2000 && k6 run load-tests/open-ballot-burst.js
//   node load-tests/verify.mjs
import http from "k6/http";
import exec from "k6/execution";
import { check } from "k6";
import { SharedArray } from "k6/data";
import { Counter } from "k6/metrics";

const run = JSON.parse(open("./.data/run.json"));
const voters = new SharedArray("voters", () => run.voters);
const RATE = Number(__ENV.RATE ?? 500);
// Connexions simultanées : la passerelle de Supabase en local (Kong) n'en accepte que 512 ;
// en préproduction, relever MAX_VUS (ex. 1500).
const MAX_VUS = Number(__ENV.MAX_VUS ?? 200);
const N = voters.length;

const replays = new Counter("vote_replays");
const recorded = new Counter("votes_recorded");

export const options = {
  scenarios: {
    lecture: {
      executor: "shared-iterations",
      exec: "read",
      vus: Math.min(100, Math.ceil(MAX_VUS / 4)),
      iterations: N,
      maxDuration: "30s",
    },
    vote: {
      executor: "ramping-arrival-rate",
      exec: "vote",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: Math.ceil(MAX_VUS / 2),
      maxVUs: MAX_VUS,
      // Montée en 2 s jusqu'au débit visé, maintenu le temps que chacun ait voté.
      stages: [
        { target: RATE, duration: "2s" },
        { target: RATE, duration: `${Math.max(1, Math.ceil((N - RATE) / RATE))}s` },
        { target: 0, duration: "1s" },
      ],
    },
  },
  thresholds: {
    "http_req_duration{scenario:vote}": ["p(95)<500", "p(99)<1500"],
    "http_req_duration{scenario:lecture}": ["p(95)<1000"],
    http_req_failed: ["rate<0.001"],
    checks: ["rate>0.999"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// DEBUG=1 : journalise les réponses en erreur (diagnostic).
const debug = (label, res) => {
  if (__ENV.DEBUG && res.status !== 200)
    console.warn(`${label} ${res.status} ${res.error ?? ""} ${String(res.body).slice(0, 200)}`);
};

const headers = (token) => ({
  apikey: run.apiKey,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export function read() {
  const voter = voters[exec.scenario.iterationInTest % N];
  const res = http.post(`${run.apiUrl}/rest/v1/rpc/my_voter_context`, "{}", {
    headers: headers(voter.token),
  });
  debug("lecture", res);
  check(res, {
    "lecture : 200": (r) => r.status === 200,
    "lecture : le scrutin ouvert est visible": (r) => r.status === 200 && r.json().ballots.length === 1,
  });
}

export function vote() {
  const i = exec.scenario.iterationInTest;
  if (i >= N) return;
  const voter = voters[i];
  const body = JSON.stringify({
    p_ballot: run.ballotId,
    p_items: [{ member_id: voter.memberId, choice: ["for", "against", "abstain"][i % 3] }],
    p_idempotency_key: crypto.randomUUID(),
  });
  const res = http.post(`${run.apiUrl}/rest/v1/rpc/cast_votes`, body, { headers: headers(voter.token) });
  debug("vote", res);
  const ok = check(res, {
    "vote : 200": (r) => r.status === 200,
    "vote : enregistré": (r) => r.status === 200 && r.json().status === "recorded",
  });
  if (ok) recorded.add(1);
  // Réseau capricieux : la même requête est renvoyée et doit recevoir la même réponse.
  if (i % 10 === 0) {
    const again = http.post(`${run.apiUrl}/rest/v1/rpc/cast_votes`, body, { headers: headers(voter.token) });
    replays.add(1);
    check(again, { "réessai : même réponse": (r) => r.status === 200 && r.body === res.body });
  }
}
