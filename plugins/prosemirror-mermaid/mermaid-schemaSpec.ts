import { NodeSpec,Node } from "prosemirror-model";

export const mermaidNodeSpec: NodeSpec = {
  group: "block",
  content: "text*",
  atom: true,
  code:true,
  attrs:{
    mermaidSource:{
      default:''
    }
  },
  toDOM: (node:Node) => {
    return ['div',{
      class:"mermaid",
      mermaidSource:node.attrs.mermaidSource
    }]
  },
  parseDOM:[{tag:"div.mermaid",getAttrs(node:HTMLElement){
    return {
      mermaidSource:node.getAttribute('mermaidSource')
    }
  }}]
};