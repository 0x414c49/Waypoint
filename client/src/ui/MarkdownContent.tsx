import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import styles from "./MarkdownContent.module.css";

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "u"],
};

function markdownMarks() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;
      const value = node.value;
      const pattern = /(\+\+.+?\+\+|==.+?==)/g;
      let match: RegExpExecArray | null;
      let last = 0;
      const replacement: typeof parent.children = [];
      while ((match = pattern.exec(value))) {
        if (match.index > last) replacement.push({ type: "text", value: value.slice(last, match.index) });
        const isUnderline = match[0].startsWith("++");
        const text = match[0].slice(2, -2).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        replacement.push({ type: "html", value: isUnderline ? `<u>${text}</u>` : `<mark>${text}</mark>` });
        last = match.index + match[0].length;
      }
      if (!replacement.length) return;
      if (last < value.length) replacement.push({ type: "text", value: value.slice(last) });
      parent.children.splice(index, 1, ...replacement);
    });
  };
}

export function MarkdownContent({ children }: { children: string }) {
  return <div className={styles.content}><ReactMarkdown remarkPlugins={[remarkGfm, markdownMarks]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}>{children}</ReactMarkdown></div>;
}
