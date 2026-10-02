import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import type { MarkdownToken } from "@tiptap/core";
import { Icon } from "./Icon.js";
import styles from "./MarkdownEditor.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  minHeight?: number;
}

function syntaxMark(name: "underline" | "highlight", delimiter: "++" | "==") {
  const Base = name === "underline" ? Underline : Highlight;
  return Base.extend({
    renderMarkdown(node, helpers) {
      return `${delimiter}${helpers.renderChildren(node.content ?? [])}${delimiter}`;
    },
    markdownTokenizer: {
      name,
      level: "inline" as const,
      start: delimiter,
      tokenize(source: string, _tokens: MarkdownToken[], lexer: { inlineTokens: (value: string) => MarkdownToken[] }) {
        const escaped = delimiter === "++" ? "\\+\\+" : "==";
        const matched = new RegExp(`^${escaped}(.*?)${escaped}`).exec(source);
        if (!matched?.[1]) return undefined;
        return { type: name, raw: matched[0], text: matched[1], tokens: lexer.inlineTokens(matched[1]) };
      },
    },
    parseMarkdown(token, helpers) {
      return { mark: name, content: helpers.parseInline((token.tokens ?? []) as MarkdownToken[]) };
    },
  });
}

const MarkdownUnderline = syntaxMark("underline", "++");
const MarkdownHighlight = syntaxMark("highlight", "==");
const SafeTable = Table.extend({
  addOptions() {
    const parent = this.parent?.();
    return {
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      resizable: parent?.resizable ?? false,
      renderWrapper: parent?.renderWrapper ?? false,
      handleWidth: parent?.handleWidth ?? 5,
      cellMinWidth: parent?.cellMinWidth ?? 25,
      View: null,
      lastColumnResizable: parent?.lastColumnResizable ?? true,
      allowTableNodeSelection: parent?.allowTableNodeSelection ?? false,
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ["tbody", 0]];
  },
});

export function MarkdownEditor({ value, onChange, ariaLabel, minHeight = 112 }: Props) {
  const onChangeRef = useRef(onChange);
  const previousValueRef = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, underline: false }),
      MarkdownUnderline,
      MarkdownHighlight,
      Image.configure({ inline: false, allowBase64: false }),
      SafeTable,
      TableRow,
      TableHeader,
      TableCell,
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        spellcheck: "true",
      },
      handlePaste: (_view, event) => {
        const markdown = event.clipboardData?.getData("text/plain").trim();
        if (!markdown || !/^!\[[^\]\n]*\]\(https:\/\/[^\s)]+\)$/.test(markdown)) return false;
        return editorRef.current?.commands.insertContent(markdown, { contentType: "markdown" }) ?? false;
      },
    },
    onUpdate: ({ editor: activeEditor }) => onChangeRef.current(activeEditor.getMarkdown()),
  }, []);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  const contextualSelection = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => {
      if (!activeEditor) return { table: false, image: false };
      const selection = activeEditor.state.selection;
      const position = selection.$from;
      const insideTable = activeEditor.isActive("table") || position.nodeAfter?.type.name === "table" ||
        Array.from({ length: position.depth + 1 }, (_, index) => position.node(index).type.name).includes("table");
      return { table: insideTable, image: activeEditor.isActive("image") || selection.$from.nodeAfter?.type.name === "image" };
    },
  });

  useEffect(() => {
    if (!editor || previousValueRef.current === value) return;
    previousValueRef.current = value;
    if (!editor.isFocused && editor.getMarkdown() !== value) editor.commands.setContent(value, { contentType: "markdown" });
  }, [editor, value]);

  const formatButton = (label: string, icon: "bold" | "italic" | "underline" | "highlight" | "bulletList" | "orderedList" | "heading", active: boolean, run: () => void, key: string) => (
    <button
      className={styles.tool}
      type="button"
      key={key}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      <Icon name={icon} />
    </button>
  );

  return (
    <div className={`${styles.editor} ${minHeight < 100 ? styles.editorCompact : ""}`}>
      {editor ? <div className={styles.toolbar} role="group" aria-label="Text formatting">
        {formatButton("Bold", "bold", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "bold")}
        {formatButton("Italic", "italic", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "italic")}
        {formatButton("Underline", "underline", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "underline")}
        {formatButton("Highlight", "highlight", editor.isActive("highlight"), () => editor.chain().focus().toggleHighlight().run(), "highlight")}
        <span className={styles.separator} aria-hidden="true" />
        {formatButton("Heading", "heading", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "heading")}
        {formatButton("Bulleted list", "bulletList", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "bullet")}
        {formatButton("Numbered list", "orderedList", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "numbered")}
        <span className={styles.separator} aria-hidden="true" />
        <button className={styles.tool} type="button" aria-label="Insert table" title="Insert a 3 by 3 table" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Icon name="table" /></button>
        {contextualSelection?.table ? <>
          <span className={styles.separator} aria-hidden="true" />
          <span className={styles.contextLabel}>Table</span>
          <button className={`${styles.tool} ${styles.contextTool}`} type="button" aria-label="Add row below" title="Add row below" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}><Icon name="rowAdd" /><span>Add row</span></button>
          <button className={`${styles.tool} ${styles.contextTool}`} type="button" aria-label="Remove row" title="Remove selected row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}><Icon name="rowRemove" /><span>Remove row</span></button>
          <button className={`${styles.tool} ${styles.contextTool}`} type="button" aria-label="Add column after" title="Add column after" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}><Icon name="columnAdd" /><span>Add column</span></button>
          <button className={`${styles.tool} ${styles.contextTool}`} type="button" aria-label="Remove column" title="Remove selected column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}><Icon name="columnRemove" /><span>Remove column</span></button>
          <button className={`${styles.tool} ${styles.contextTool} ${styles.destructiveTool}`} type="button" aria-label="Remove table" title="Remove table" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}><Icon name="tableRemove" /><span>Remove table</span></button>
        </> : null}
        {contextualSelection?.image ? <button className={`${styles.tool} ${styles.destructiveTool}`} type="button" aria-label="Remove image" title="Remove selected image" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteSelection().run()}><Icon name="remove" /></button> : null}
      </div> : null}
      <EditorContent editor={editor} className={styles.content} />
    </div>
  );
}
