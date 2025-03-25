//@ts-nocheck
import { Node } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";

// https://prosemirror.xheldon.com/docs/guide/#view.node_views
class ParagraphView implements NodeView {
  dom:HTMLElement
  contentDOM?: HTMLElement
  constructor(node:Node) {
    this.dom = document.createElement("div")
    this.contentDOM = document.createElement("p")
    
    let label=document.createElement('label')
    label.textContent='pragraph'
    this.dom.appendChild(label)
    this.dom.appendChild(this.contentDOM)
    if (node.content.size == 0) this.dom.classList.add("empty")
  }

  update(node:Node) {
    if (node.content.size > 0){
      this.dom.classList.remove("empty")
      // this.dom.textContent=node.toString()
    }
    else{
      this.dom.classList.add("empty")
    }
    return true
  }
}

let state=EditorState.create({
  schema
})

let view=new EditorView(document.querySelector('#editor')!,{
  state,
  nodeViews:{
    paragraph(node){
      return new ParagraphView(node)
    }
  }
})
