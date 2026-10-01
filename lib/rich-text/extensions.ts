import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// Schéma unique de l'éditeur et du rendu : titres, listes, citations, gras, italique.
// Pas de liens ni d'images : aucun contenu actif dans un texte de résolution.
export const richTextExtensions = [
  StarterKit.configure({
    link: false,
    underline: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    heading: { levels: [3, 4] },
  }),
];

export type RichTextDoc = JSONContent & { type: "doc" };

// Un document doit contenir au moins un bloc : un document sans contenu serait corrigé par
// l'éditeur à la première frappe, ce qui annulerait la mise en forme choisie.
export const EMPTY_DOC: RichTextDoc = { type: "doc", content: [{ type: "paragraph" }] };
