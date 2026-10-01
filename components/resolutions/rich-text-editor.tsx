"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { EMPTY_DOC, richTextExtensions, type RichTextDoc } from "@/lib/rich-text/extensions";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: RichTextDoc;
  onChange: (doc: RichTextDoc) => void;
  disabled?: boolean;
  labelledBy: string;
};

export function RichTextEditor({ id, value, onChange, disabled, labelledBy }: Props) {
  const editor = useEditor({
    extensions: richTextExtensions,
    content: value.content?.length ? value : EMPTY_DOC,
    editable: !disabled,
    immediatelyRender: false, // rendu serveur : l'éditeur s'initialise côté client
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        class: "rich-text min-h-48 px-3 py-2 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichTextDoc),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            h3: e.isActive("heading", { level: 3 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
          }
        : null,
  });

  const button = (label: string, active: boolean | undefined, run: () => void) => (
    <button
      type="button"
      aria-pressed={active ?? false}
      disabled={disabled || !editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        "hover:bg-muted rounded px-2 py-1 text-sm disabled:opacity-50",
        active && "bg-muted font-semibold",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="border-border focus-within:ring-ring rounded-md border focus-within:ring-2">
      <div
        role="toolbar"
        aria-label="Mise en forme"
        className="border-border flex flex-wrap gap-1 border-b p-1"
      >
        {button("Gras", state?.bold, () => editor?.chain().focus().toggleBold().run())}
        {button("Italique", state?.italic, () => editor?.chain().focus().toggleItalic().run())}
        {button("Intertitre", state?.h3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
        {button("Liste", state?.bullet, () => editor?.chain().focus().toggleBulletList().run())}
        {button("Liste numérotée", state?.ordered, () => editor?.chain().focus().toggleOrderedList().run())}
        {button("Citation", state?.quote, () => editor?.chain().focus().toggleBlockquote().run())}
        {button("Annuler", false, () => editor?.chain().focus().undo().run())}
        {button("Rétablir", false, () => editor?.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
