import { schema } from "./schema";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { pluginsSet } from "./plugins";
import { inputRulesSet } from "./inputrules";
import './editor.css'

let state=EditorState.create({
  schema,
  plugins:[
    ...pluginsSet,
    inputRulesSet
  ]
})

let view=new EditorView(document.querySelector('#editor')!,{
  state,
})

//@ts-ignore
window.view=view