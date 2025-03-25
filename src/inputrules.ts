import {
  MERMAID_MATCH_INPUTRULE,
  createMermaidInputRule,
} from "plugins/prosemirror-mermaid/mermaid-inputRule";
import { schema } from "./schema";
import { inputRules } from "prosemirror-inputrules";

const mermaidInputrule = createMermaidInputRule(
  MERMAID_MATCH_INPUTRULE,
  schema.nodes["mermaid"]
);

export const inputRulesSet = inputRules({rules:[mermaidInputrule]})