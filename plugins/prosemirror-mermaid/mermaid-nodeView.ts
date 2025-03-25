import { Mermaid } from "mermaid";
import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorState, PluginKey, TextSelection, Transaction } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { Decoration, EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { newlineInCode, chainCommands, deleteSelection } from "prosemirror-commands";

export class mermaidView implements NodeView{
  dom:HTMLElement
  private _innerDoc:ProsemirrorNode
  private _innerView:EditorView|undefined
  private _outerView:EditorView
  private _getPos:()=>number|undefined
  private _mermaidPluginKey:PluginKey
  private _mermaidSourceEle:HTMLElement|undefined
  private _mermaidGraphEle:HTMLElement|undefined
  private _isEditing:boolean
  constructor(node:ProsemirrorNode, outerView:EditorView, getPos:()=>number|undefined,mermaidPluginKey:PluginKey){
    this._innerDoc=node
    this._outerView=outerView
    this._getPos=getPos
    this._mermaidPluginKey=mermaidPluginKey
    this._isEditing=false
    this.dom=document.createElement(node.type.name)
    this._mermaidSourceEle=document.createElement('p')
    this._mermaidGraphEle=document.createElement('div')
    let label=document.createElement('label')
    label.textContent='mermaid'
    this.dom.appendChild(label)
    this.dom.appendChild(this._mermaidSourceEle)
    this.dom.appendChild(this._mermaidGraphEle)

    this.dom.addEventListener("click",()=> this.ensureFocus())

    this.renderMermaid()
  }
  
  ensureFocus(){
    if(this._innerView && this._outerView.hasFocus()){
      console.log(this._innerView)
      this._innerView.focus()
    }
  }

  renderMermaid(){
    if(!this._mermaidSourceEle) return

    let content = this._innerDoc.firstChild
    let mermaidSource = "";
		if (content !== null) {
			mermaidSource = content.textContent.trim();
		}

    if(mermaidSource.length<1){
      this.dom.classList.add("empty-content")
      this._mermaidGraphEle!.innerHTML=''
    }else{
      this.dom.classList.remove("empty-content")
    }

    try{
      let cachedMermaid:Mermaid=this._innerDoc.type.schema.cached.mermaid
      // suppressErrors:true

      cachedMermaid.parse(mermaidSource,{suppressErrors: true})
        .then(succeed=>{
          if(succeed){
            cachedMermaid.render(`mermaid-${Date.now()}`,mermaidSource)
              .then(res=>{ this._mermaidGraphEle!.innerHTML=res.svg })
          } else {
            console.error(`[prosemirror-mermaid]:${mermaidSource} is not valid content to render`)
          }
        })
    }catch(err){
      this.dom.setAttribute("title", (err as any).toString());
    }
  }
  
  selectNode(){
    this.dom.classList.add('mermaid-selected')
    if(!this._isEditing) this.openEditor()
  }

  deselectNode(){
    this.dom.classList.remove('mermaid-selected')
    if(this._isEditing) this.closeEditor(true)
  }

  stopEvent(event: Event): boolean {
		return (this._innerView !== undefined)
			&& (event.target !== undefined)
			&& this._innerView.dom.contains(event.target as Node);
	}

  ignoreMutation(){ return true}

  innerDispatch(tr:Transaction){
    if(!this._innerView) return
    let {state, transactions} = this._innerView.state.applyTransaction(tr)
    this._innerView.updateState(state)

    if(!tr.getMeta('fromOutside')){
      let outerTr = this._outerView.state.tr,offsetMap=StepMap.offset(this._getPos()!+1)

      for(let i = 0;i < transactions.length;i++){
        let steps=transactions[i].steps
        for(let j=0;j<steps.length;j++){
          let mapped = steps[j].map(offsetMap)
          if(!mapped) throw Error('step discarded!')
          outerTr.step(mapped)
        }
      }
      if(outerTr.docChanged) this._outerView.dispatch(outerTr)
    }
  }

  openEditor(){
    if(this._innerView) {
      console.warn("[prosemirror-mermaid] editor already open when openEditor was called")
      return
    }
    this._innerView = new EditorView(this._mermaidSourceEle!,{
      state:EditorState.create({
        doc:this._innerDoc,
        plugins:[
          keymap({
            "Enter": chainCommands(newlineInCode),
            "Ctrl-Backspace" : () => {
						// delete math node and focus the outer view
						this._outerView.dispatch(this._outerView.state.tr.insertText(""));
						this._outerView.focus();
						return true;
					},
          })
        ]
      }),
      dispatchTransaction:this.innerDispatch.bind(this)
    })
    //@ts-ignore
    window.innerView=this._innerView
    let innerState = this._innerView.state
    this._innerView.focus()
    // request outer cursor position before math node was selected
		let maybePos = this._mermaidPluginKey.getState(this._outerView.state)?.prevCursorPos;
		if(maybePos === null || maybePos === undefined) {
			console.error("[prosemirror-mermaid] Error:  Unable to fetch mermaid plugin state from key.");
		}
		let prevCursorPos: number = maybePos ?? 0;
		
		// compute position that cursor should appear within the expanded math node
		let innerPos = (prevCursorPos <= this._getPos()!) ? 0 : this._innerDoc.nodeSize - 2;
		this._innerView.dispatch(
			innerState.tr.setSelection(
				TextSelection.create(innerState.doc, innerPos)
			)
		);

		this._isEditing = true;
  }

  closeEditor(render: boolean=true){
    if(this._innerView){
      this._innerView.destroy()
      this._innerView=undefined
    }

    if(render) this.renderMermaid()
    
    this._isEditing=false
  }

  update(node: ProsemirrorNode, decorations: readonly Decoration[]) {
		if (!node.sameMarkup(this._innerDoc)) return false
		this._innerDoc = node;

		if (this._innerView) {
			let state = this._innerView.state;

			let start = node.content.findDiffStart(state.doc.content)
			if (start != null) {
				let diff = node.content.findDiffEnd(state.doc.content as any);
				if (diff) {
					let { a: endA, b: endB } = diff;
					let overlap = start - Math.min(endA, endB)
					if (overlap > 0) { endA += overlap; endB += overlap }
					this._innerView.dispatch(
						state.tr
							.replace(start, endB, node.slice(start, endA))
							.setMeta("fromOutside", true))
				}
			}
		}

		if (!this._isEditing) {
			this.renderMermaid();
		}

		return true;
	}

  destroy() {
		// close the inner editor without rendering
		this.closeEditor(false);

		// clean up dom elements
		if (this._mermaidGraphEle) {
			this._mermaidGraphEle.remove();
			delete this._mermaidGraphEle;
		}
		if (this._mermaidSourceEle) {
			this._mermaidSourceEle.remove();
			delete this._mermaidSourceEle;
		}
		
		this.dom.remove();
	}
}