import { generateHTML } from "@tiptap/html";
import { richTextExtensions, type RichTextDoc } from "./extensions";

// HTML d'un document Tiptap. Le schéma est strict : un nœud ou une marque hors schéma
// (document forgé hors de l'éditeur) lève une erreur ; on renvoie alors null et
// l'appelant affiche le texte brut. Le texte est toujours échappé par Tiptap.
export function renderRichText(doc: unknown): string | null {
  try {
    return generateHTML(doc as RichTextDoc, richTextExtensions);
  } catch {
    return null;
  }
}

export function isValidRichText(doc: unknown): boolean {
  return (
    typeof doc === "object" &&
    doc !== null &&
    (doc as { type?: unknown }).type === "doc" &&
    JSON.stringify(doc).length <= 200000 &&
    renderRichText(doc) !== null
  );
}
