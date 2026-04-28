import { codeToHtml, type ShikiTransformer } from "shiki";
import {
  CodeBlockChrome,
  type CodeBlockTab,
} from "@/components/ui/code-block-chrome";

const THEMES = {
  light: "catppuccin-latte",
  dark: "catppuccin-mocha",
} as const;

const transformers: ShikiTransformer[] = [
  {
    pre(node) {
      node.properties.class =
        `${node.properties.class ?? ""} !bg-transparent`.trim();
      node.properties["data-line-numbers"] = "";
    },
    line(node) {
      node.properties["data-line"] = "";
    },
  },
];

const highlight = (code: string, lang: string) =>
  codeToHtml(code, { lang, themes: THEMES, transformers });

export type CodeBlockSnippet = {
  label: string;
  code: string;
  lang: string;
};

type CodeBlockSingleProps = {
  code: string;
  lang: string;
  filename: string;
  tabs?: never;
  picker?: never;
  className?: string;
};

type CodeBlockMultiProps = {
  tabs: CodeBlockSnippet[];
  filename?: string;
  picker?: "tabs" | "select";
  code?: never;
  lang?: never;
  className?: string;
};

export type CodeBlockProps = CodeBlockSingleProps | CodeBlockMultiProps;

export const CodeBlock = async (props: CodeBlockProps) => {
  if (props.tabs) {
    const rendered: CodeBlockTab[] = await Promise.all(
      props.tabs.map(async (t) => ({
        label: t.label,
        code: t.code,
        lang: t.lang,
        html: await highlight(t.code, t.lang),
      })),
    );
    return (
      <CodeBlockChrome
        tabs={rendered}
        picker={props.picker ?? "tabs"}
        filename={props.filename}
        className={props.className}
      />
    );
  }
  const html = await highlight(props.code, props.lang);
  return (
    <CodeBlockChrome
      tabs={[
        { label: props.filename, code: props.code, lang: props.lang, html },
      ]}
      picker="filename"
      filename={props.filename}
      className={props.className}
    />
  );
};
