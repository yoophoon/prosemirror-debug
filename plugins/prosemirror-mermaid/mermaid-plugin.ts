import { EditorState, EditorStateConfig, Plugin, PluginKey, PluginSpec } from "prosemirror-state";
import { mermaidView } from "./mermaid-nodeView";
import mermaid from "mermaid";

interface IMermaidPluginState {
  prevCursorPos:number
}

const MERMAID_PLUGIN_KEY = new PluginKey('prosemirror-mermaid')

const mermaidPluginSpec:PluginSpec<IMermaidPluginState> ={
  key:MERMAID_PLUGIN_KEY,
  state:{
    init(config, instance) {
      mermaid.initialize({startOnLoad:false})
      instance.schema.cached.mermaid = mermaid
      return {
        prevCursorPos:0
      }
    },
    apply(tr, value, oldState, newState) {
      return {
        prevCursorPos:oldState.selection.from
      }
    },
  },
  props:{
    nodeViews:{
      mermaid:(node, view, getPos)=>{
        return new mermaidView(node, view, getPos, MERMAID_PLUGIN_KEY)
      }
    }
  }
}


export const mermaidPlugin=new Plugin(mermaidPluginSpec)