import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import './editor.css'

let selectionSizePlugin=new Plugin({
  view(editorView){return new SelectionSizeTooltip(editorView)}
})

class SelectionSizeTooltip{
  tooltip:HTMLElement
  constructor(view:EditorView){
    this.tooltip=document.createElement('div')
    this.tooltip.className='tooltip'
    view.dom.parentNode!.appendChild(this.tooltip)
    this.update(view,null)
  }

  update(view:EditorView, lastState:EditorState|null){
    let state=view.state
    if(lastState&&lastState.doc.eq(state.doc)&&lastState.selection.eq(state.selection))
      return

    if(state.selection.empty){
      this.tooltip.style.display='none'
      return
    }

    this.tooltip.style.display=''
    let {from, to}=state.selection
    let start=view.coordsAtPos(from),end=view.coordsAtPos(to)
    let box=this.tooltip.offsetParent!.getBoundingClientRect()
    let left=Math.max((start.left+end.left)/2,start.left+3)
    this.tooltip.style.left=(left-box.left)+'px'
    this.tooltip.style.bottom=(box.bottom-start.top)+'px'
    this.tooltip.textContent=to-from+''
  }

  destroy(){this.tooltip.remove()}
}

import { schema } from "prosemirror-schema-basic";
// import { keymap  } from "prosemirror-keymap";
// import { baseKeymap } from "prosemirror-commands";
// import { history, undo, redo } from "prosemirror-history";
// import { exampleSetup } from "prosemirror-example-setup";
import { DOMParser } from "prosemirror-model";
import './editor.css'

// let state=EditorState.create({schema,plugins:[
//   selectionSizePlugin,
//   history(),
//   keymap(baseKeymap),
//   keymap({
//     'Mod-z':undo,
//     'Mod-y':redo,
//   })
// ]})
//@ts-ignore
window.view=new EditorView(document.querySelector('#editor'),{
  state:EditorState.create({
    doc:DOMParser.fromSchema(schema).parse(document.querySelector('#editor')!),
    plugins:[
      // ...exampleSetup({schema}),
      selectionSizePlugin
    ]
  })
})