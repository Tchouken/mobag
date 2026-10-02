import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function db(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

// Connexion par lien magique : demande sur l'écran de connexion, lien relevé dans Mailpit.
export async function login(page: Page, email: string): Promise<void> {
  const since = Date.now() - 1000;
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  await expect(page.getByText("un lien de connexion vient d'être envoyé")).toBeVisible();
  let link: string | undefined;
  await expect
    .poll(async () => {
      const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] };
      const fresh = messages.find((m) => new Date(m.Created).getTime() > since);
      if (!fresh) return false;
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)).json()) as {
        Text: string;
      };
      link = message.Text.match(/https?:\/\/\S+verify\S+/)?.[0].replace(/&amp;/g, "&");
      return Boolean(link);
    })
    .toBe(true);
  await page.goto(link!);
  await page.waitForURL("**/orgs");
}

// Signature tracée à la souris dans le pad de l'accueil.
export async function sign(page: Page): Promise<void> {
  const box = (await page.getByRole("img", { name: "Zone de signature" }).boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(box.x + 30 + i * 18, box.y + box.height * 0.6 - Math.sin(i / 2) * 35);
  }
  await page.mouse.up();
}
