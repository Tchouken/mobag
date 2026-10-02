import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { db, login, sign } from "./support";

// Parcours complet d'une AG, uniquement par l'interface : préparation (création, import,
// résolution, pouvoir, bureau, convocation), accueil (émargements signés, appareils de vote,
// départ avec transmission), régie (séance, vote, clôture, validation), votes sur deux
// smartphones, projection, exports, intégrité du journal d'audit.

const MEMBERS_CSV =
  "﻿Référence;Nom;Prénom;Voix\nA1;Arnaud;Alice;400\nA2;Bernard;Bruno;300\nA3;Colin;Chloé;200\nA4;David;Denis;100\n";

test("parcours complet d'une assemblée générale", async ({ page, browser }) => {
  const email = `e2e-${Date.now()}@client.test`;
  page.on("dialog", (dialog) => void dialog.accept());
  const sql = await db();
  try {
    await login(page, email);
    // La création d'organisation est réservée au super-admin MobilActif.
    const {
      rows: [org],
    } = await sql.query<{ id: string }>(
      "insert into public.organizations (name, slug) values ('Démo E2E SA', $1) returning id",
      [`e2e-${Date.now()}`],
    );
    await sql.query(
      "insert into public.org_members (org_id, user_id, role) select $1, id, 'org_admin' from auth.users where email = $2",
      [org!.id, email],
    );

    let base = "";
    await test.step("préparation : création de l'AG", async () => {
      await page.goto(`/orgs/${org!.id}`);
      await page.getByRole("link", { name: "Nouvelle assemblée" }).click();
      await page.getByLabel("Intitulé").fill("AGO 2026");
      await page.getByLabel("Date").fill("2026-06-15");
      await page.getByLabel("Heure").fill("14:30");
      await page.getByRole("button", { name: "Créer l'assemblée" }).click();
      await page.waitForURL(/\/assemblies\/[0-9a-f-]{36}\/settings$/);
      base = page.url().replace(/\/settings$/, "");
    });
    const assemblyId = base.split("/").pop()!;

    await test.step("préparation : import des actionnaires", async () => {
      const file = { name: "actionnaires.csv", mimeType: "text/csv", buffer: Buffer.from(MEMBERS_CSV) };
      await page.goto(`${base}/members`);
      await page.getByRole("link", { name: "Importer un fichier" }).click();
      // Le formulaire n'est interactif qu'une fois la page hydratée : nouvel essai au besoin.
      await expect(async () => {
        await page.getByLabel("Fichier", { exact: true }).setInputFiles(file);
        await page.getByRole("button", { name: "Lire le fichier" }).click();
        await expect(page.getByText("actionnaires.csv · 4 lignes")).toBeVisible({ timeout: 2000 });
      }).toPass();
      await page.getByRole("button", { name: "Vérifier le fichier" }).click();
      await page.getByRole("button", { name: "Importer 4 ligne(s)" }).click();
      await page.getByRole("link", { name: "Voir les participants" }).click();
      await expect(page.getByRole("cell", { name: "ARNAUD Alice" })).toBeVisible();
    });

    await test.step("préparation : résolution, pouvoir, bureau, convocation", async () => {
      await page.goto(`${base}/resolutions/new`);
      await page.getByLabel("Titre court").fill("Approbation des comptes");
      await page.getByRole("textbox", { name: "Texte intégral" }).click();
      await page.keyboard.type("L'assemblée approuve les comptes de l'exercice 2025.");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await page.waitForURL(`${base}/resolutions`);

      await page.goto(`${base}/proxies`);
      await page.getByRole("link", { name: "Saisir des pouvoirs" }).click();
      await page.getByRole("combobox", { name: "Mandant (membre qui donne pouvoir)" }).fill("david");
      await page.getByRole("option", { name: /DAVID Denis/ }).click();
      await page.getByRole("combobox", { name: "Membre mandataire" }).fill("arnaud");
      await page.getByRole("option", { name: /ARNAUD Alice/ }).click();
      await page.getByRole("button", { name: "Enregistrer le pouvoir" }).click();
      await expect(page.getByText(/Pouvoir de .*DAVID Denis.* enregistré/)).toBeVisible();

      await page.goto(`${base}/staff`);
      await page.getByLabel("Personne").selectOption({ label: email });
      await page.getByLabel("Rôle").selectOption("president");
      await page.getByRole("button", { name: "Désigner" }).click();
      await expect(page.getByRole("cell", { name: "Président de séance" })).toBeVisible();

      await page.goto(base);
      await page.getByRole("button", { name: "Marquer comme convoquée" }).click();
      await expect(page.getByRole("link", { name: "Ouvrir l'accueil" })).toBeVisible();
    });

    const codes: Record<string, string> = {};
    await test.step("accueil : émargements signés, appareils de vote, départ avec transmission", async () => {
      await page.getByRole("link", { name: "Ouvrir l'accueil" }).click();
      const search = page.getByLabel("Rechercher un membre ou une personne");
      const panel = page.locator("section[aria-live]");
      for (const [query, name] of [
        ["arnaud", "ALICE"],
        ["bernard", "BRUNO"],
        ["colin", "CHLOE"],
      ] as const) {
        await search.fill(query);
        await page.getByRole("list", { name: "Résultats" }).getByRole("button").first().click();
        await sign(page);
        await page.getByRole("button", { name: "Valider l'émargement" }).click();
        await expect(panel.getByText(/Voix portées/)).toBeVisible();
        if (name !== "CHLOE") {
          await page.getByRole("button", { name: "QR pour son smartphone" }).click();
          codes[name] = (await page.getByTestId("voter-code").textContent())!.replace(/-/g, "");
        }
      }
      await expect(page.getByTestId("quorum-summary").getByText("1 000 / 1 000 voix")).toBeVisible();

      // Chloé part et confie ses voix à Bruno.
      await page.getByLabel("Départ définitif : ses voix sont confiées à une personne présente").check();
      await page.getByLabel("Personne qui reçoit ses voix").selectOption({ label: "BERNARD Bruno" });
      await page.getByRole("button", { name: "Enregistrer le départ" }).click();
      await expect(page.getByRole("button", { name: "Enregistrer son retour" })).toBeVisible();
      await expect(page.getByTestId("quorum-summary").getByText("1 000 / 1 000 voix")).toBeVisible();
    });

    const phones = await Promise.all(Object.values(codes).map((code) => openPhone(browser, code)));

    await test.step("régie : ouverture de la séance et du vote", async () => {
      await page.goto(`/regie/${assemblyId}`);
      await page.getByRole("button", { name: "Ouvrir la séance" }).click();
      await expect(page.getByText("En séance")).toBeVisible();
      await page.getByRole("button", { name: "Ouvrir le vote" }).click();
      await expect(page.getByTestId("participation").getByText("0 / 4 membres")).toBeVisible();
    });

    await test.step("votes : même vote (Alice) et vote par mandant (Bruno)", async () => {
      const [alice, bruno] = phones as [Page, Page];
      await alice.getByRole("button", { name: "Pour", exact: true }).click();
      await alice.getByRole("button", { name: "Valider mon choix" }).click();
      await alice.getByRole("button", { name: "Confirmer mon vote" }).click();
      await expect(alice.getByTestId("vote-recorded")).toBeVisible();

      await bruno.getByLabel("Vote distinct par mandant").check();
      await bruno
        .getByRole("group", { name: /En votre nom/ })
        .getByRole("button", { name: "Contre" })
        .click();
      await bruno
        .getByRole("group", { name: /Pour COLIN/ })
        .getByRole("button", { name: "Abstention" })
        .click();
      await bruno.getByRole("button", { name: "Valider mon choix" }).click();
      await bruno.getByRole("button", { name: "Confirmer mon vote" }).click();
      await expect(bruno.getByTestId("vote-recorded")).toBeVisible();
    });

    await test.step("régie : clôture, résultat, validation ; projection", async () => {
      await expect(page.getByTestId("participation").getByText("4 / 4 membres")).toBeVisible();
      await page.getByRole("button", { name: "Clore le vote" }).click();
      // 500 pour, 300 contre, 200 abstentions (non comptées) : adoptée.
      await expect(page.getByTestId("ballot-outcome").getByText("Adoptée")).toBeVisible();
      await page.getByRole("button", { name: "Écran de projection" }).click();
      const link = (await page.getByTestId("projection-link").textContent())!;
      const screen = await (await browser.newContext()).newPage();
      await screen.goto(link);
      await expect(screen.getByText("En attente du prochain vote")).toBeVisible();
      await page.getByRole("button", { name: "Valider le résultat" }).click();
      await expect(screen.getByTestId("projection-outcome").getByText("Adoptée")).toBeVisible();
      await expect(screen.getByText("500 voix · 62,5 %")).toBeVisible();
    });

    await test.step("exports : feuille de présence signée et résultats", async () => {
      await page.goto(`${base}/exports`);
      const [pdfDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Feuille de présence — PDF" }).click(),
      ]);
      const pdf = await PDFDocument.load(readFileSync((await pdfDownload.path())!));
      const images = pdf
        .getPages()
        .flatMap((p) => p.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys() ?? []);
      expect(images).toHaveLength(3);

      const [csvDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Résultats des votes — CSV" }).click(),
      ]);
      const csv = readFileSync((await csvDownload.path())!, "utf8").split("\r\n");
      expect(csv[1]).toMatch(/^1;Approbation des comptes;.*;1;Validé;Adoptée;500;2;300;1;200;1;800;0;/);
    });

    await test.step("intégrité : journal d'audit et empreinte des votes", async () => {
      const { rows } = await sql.query("select private.verify_audit_chain_unchecked($1) as v", [assemblyId]);
      expect(rows[0].v).toMatchObject({ ok: true, ballots: 1 });
    });
  } finally {
    await sql.end();
  }
});

async function openPhone(browser: Browser, code: string): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage();
  await phone.goto(`/v#${code}`);
  await phone.waitForURL("**/vote");
  await expect(phone.getByTestId("live-status").getByText("Connecté")).toBeVisible();
  return phone;
}
