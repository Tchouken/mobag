import { describe, expect, it } from "vitest";
import { isValidRichText, renderRichText } from "@/lib/rich-text/render";

const paragraph = (text: string, marks: unknown[] = []) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text, marks }] }],
});

describe("renderRichText", () => {
  it("échappe le texte", () => {
    expect(renderRichText(paragraph("<script>alert(1)</script>", [{ type: "bold" }]))).toBe(
      "<p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p>",
    );
  });

  it("refuse un lien injecté hors de l'éditeur", () => {
    const doc = paragraph("clic", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]);
    expect(renderRichText(doc)).toBeNull();
    expect(isValidRichText(doc)).toBe(false);
  });

  it("refuse une image", () => {
    expect(isValidRichText({ type: "doc", content: [{ type: "image", attrs: { src: "x" } }] })).toBe(false);
  });

  it("refuse ce qui n'est pas un document", () => {
    expect(isValidRichText({ type: "paragraph" })).toBe(false);
    expect(isValidRichText(null)).toBe(false);
  });

  it("accepte listes et citations", () => {
    expect(
      isValidRichText({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
            ],
          },
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
        ],
      }),
    ).toBe(true);
  });
});
