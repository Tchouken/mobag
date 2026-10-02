import { Badge } from "@/components/ui/badge";
import { describeCondition } from "@/lib/domain/rules";
import { formatWeight } from "@/lib/format";
import { OUTCOME_LABELS, share, type BallotSummary } from "@/lib/regie/model";

const ROWS = [
  ["for", "Pour"],
  ["against", "Contre"],
  ["abstain", "Abstention"],
  ["expressed", "Suffrages exprimés"],
  ["not_voted", "N'ont pas voté"],
] as const;

// Résultat d'un scrutin clos : décompte en voix et en têtes, détail de chaque condition de
// majorité telle qu'évaluée par la base.
export function ResultTable({
  ballot,
  abstention,
}: {
  ballot: BallotSummary;
  abstention: "excluded" | "included";
}) {
  if (!ballot.tallies || !ballot.outcome) return null;
  const expressed = ballot.tallies.expressed;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={ballot.outcome === "adopted" ? "success" : "warning"}
          data-testid="ballot-outcome"
          className="text-sm"
        >
          {OUTCOME_LABELS[ballot.outcome]}
        </Badge>
        <span className="text-muted-foreground text-sm">
          {ballot.status === "validated"
            ? "Résultat validé"
            : "Résultat provisoire, à valider par la présidence"}
        </span>
      </div>
      <table className="w-full text-sm" aria-label="Décompte">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-1 font-medium"> </th>
            <th className="py-1 text-right font-medium">Voix</th>
            <th className="py-1 text-right font-medium">Part des exprimés</th>
            <th className="py-1 text-right font-medium">Votants</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([key, label]) => {
            const m = ballot.tallies![key];
            return (
              <tr key={key} className="border-border border-t">
                <td className="py-1">{label}</td>
                <td className="py-1 text-right tabular-nums">{formatWeight(m.weight)}</td>
                <td className="py-1 text-right tabular-nums">
                  {["for", "against"].includes(key) || (key === "abstain" && abstention === "included")
                    ? share(m.weight, expressed.weight)
                    : ""}
                </td>
                <td className="py-1 text-right tabular-nums">{m.heads}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="text-sm">
        {!ballot.totals.quorum.reached && <li>Quorum non atteint à l&apos;ouverture du vote.</li>}
        {ballot.evaluation?.majority.conditions.map((c, i) => (
          <li key={i}>
            {describeCondition(c)} : {formatWeight(c.value)} sur {formatWeight(c.base_value)} —{" "}
            <strong>{c.met ? "atteinte" : "non atteinte"}</strong>
          </li>
        ))}
        <li className="text-muted-foreground">
          Abstentions {abstention === "included" ? "comptées dans les suffrages exprimés" : "non comptées"}.
        </li>
      </ul>
    </div>
  );
}
