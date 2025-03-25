import { mermaidPlugin } from "prosemirror-mermaid";
import { chainCommands, newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";




export const pluginsSet=[
  mermaidPlugin,
  keymap({
    "Enter" : chainCommands(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock),
  })
]