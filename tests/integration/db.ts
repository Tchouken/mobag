import { Client } from "pg";

// Connexion directe (rôle postgres) à la base locale ou de CI. Réservée aux tests.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}
