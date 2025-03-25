import { InputRule } from "prosemirror-inputrules";
import { NodeType } from "prosemirror-model";
import { EditorState, NodeSelection } from "prosemirror-state";

export const MERMAID_MATCH_INPUTRULE=/^```mermaid\s+$/

export const createMermaidInputRule = (pattern: RegExp, nodeType: NodeType) => {
  return new InputRule(
    pattern,
    (
      state: EditorState,
      match: RegExpMatchArray,
      start: number,
      end: number
    ) => {
      let $start = state.doc.resolve(start),$end=state.doc.resolve(end)
      if (
        !$start
          .node(-1)
          .canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)
      )
        return null;
      console.log($start.before(),$end.after())
      let tr=state.tr.replaceWith($start.before(),$end.after(),nodeType.create())
      return tr.setSelection(NodeSelection.create(tr.doc,tr.mapping.map($start.pos - 1)))
    }
  );
};