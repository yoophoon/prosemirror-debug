//@ts-nocheck
import {EditorState, Plugin, TextSelection} from 'prosemirror-state'
import { schema } from 'prosemirror-schema-basic'
import { DirectEditorProps } from 'prosemirror-view'
import { Node } from 'prosemirror-model'

//https://nytimes.github.io/oak-byo-react-prosemirror-redux/post/build-your-own-pm-view/
//Buld Your Own: ProseMirror View

function renderNode(node:Node){
  if(node.isText){
    return document.createTextNode(node.text??'')
  }

  const [tagName]=node.type.spec.toDOM(node)
  return document.createElement(tagName)
}


class View{
  constructor(public node,public readonly dom,public parent){
    this.dom.__view=this
  }

  destory(){
    this.parent=null
    this.dom.__view=null
  }

  pointFromPos(pos, preferBefore) {
    let index = 0;
    let offset = 0;

    while (index < this.children.length) {
      const child = this.children[index];
      const isLastChild = index === this.children.length - 1;

      const { border, size } = child;
      const start = offset + border;
      const end = offset + size - border;
      const after = end + border;

      if (pos < after || (pos === after && preferBefore) || isLastChild) {
        return child.pointFromPos(pos - start, preferBefore);
      }

      index = index + 1;
      offset = offset + size;
    }

    return { node: this.dom, offset: pos };
  }

  get border() {
    return 0;
  }

  get pos() {
    const { parent } = this;

    if (!parent) {
      return -1;
    }

    const siblings = parent.children;
    const index = siblings.indexOf(this);
    const precedingSiblings = siblings.slice(0, index);
    return precedingSiblings.reduce(
      (pos, sibling) => pos + sibling.size,
      parent.pos + parent.border
    );
  }

  get size() {
    return this.node.nodeSize;
  }
}

class TextView extends View{
  update(){
    return false
  }

  pointFromPos(pos, preferBefore) {
    return { node: this.dom, offset: pos };
  }
}

class NodeView extends View{
  constructor(node, dom, parent){
    super(node, dom, parent)
    this.children=[]
    this.updateChildren()
  }

  get border() {
    return this.node.isLeaf ? 0 : 1;
  }

  update(node) {
    if (!this.node.sameMarkup(node)) {
      return false;
    }

    this.node = node;
    this.updateChildren();
    return true;
  }

  updateChildren(){
    this.node.forEach((child, offset, index) => {
      const childView = this.children[index];
      if (childView) {
        const updated = childView.update(child);
        if (updated) {
          return;
        }
        if(childView.destroy)
          childView.destroy();
      }

      const childDOM = renderNode(child);


      if (childView) {
        this.dom.replaceChild(childDOM, childView.dom);
      } else {
        this.dom.appendChild(childDOM);
      }


      if (child.isText) {
        this.children[index] = new TextView(child, childDOM, this);
      } else {
        this.children[index] = new NodeView(child, childDOM, this);
      }
    });

    while (this.children.length > this.node.childCount) {
      this.children.pop().destroy();
      this.dom.removeChild(this.dom.lastChild);
    }
  }

  destory(): void {
      super.destory()
      for(const child of children){
        child.destory()
      }
  }
}

class EditorView extends NodeView{
  state:EditorState
  constructor(readonly dom:HTMLElement, readonly props:DirectEditorProps){
    super(props.state.doc, dom, null)
    this.state=props.state
    this.dom.contentEditable="true"

    this.onBeforeInput = this.onBeforeInput.bind(this);
    this.dom.addEventListener("beforeinput", this.onBeforeInput);

    this.onSelectionChange = this.onSelectionChange.bind(this);
    document.addEventListener("selectionchange", this.onSelectionChange);
  }

  destory(){
    super.destory()
    this.dom.removeEventListener("beforeinput", this.onBeforeInput);
    document.removeEventListener("selectionchange", this.onSelectionChange);
  }

  dispatch(tr) {
    const newState = this.state.apply(tr);
    this.setState(newState);
  }

  setState(newState) {
    this.state = newState;
    this.update(this.state.doc);
  }

  update(node) {
    super.update(node);

    const { anchor, head } = this.state.selection;
    const backward = head > anchor;

    const anchorPoint = this.pointFromPos(anchor, backward);
    const focusPoint = this.pointFromPos(head, !backward);

    const domSelection = document.getSelection();
    domSelection.setBaseAndExtent(
      anchorPoint.node,
      anchorPoint.offset,
      focusPoint.node,
      focusPoint.offset
    );
  }

  onBeforeInput(event) {
    event.preventDefault();
    switch (event.inputType) {
      case "insertText": {
        const { tr } = this.state;
        tr.insertText(event.data);
        this.dispatch(tr);
      }
    }
  }

  onSelectionChange(event) {
    const { doc, tr } = this.state;

    const domSelection = document.getSelection();

    const { anchorNode, anchorOffset } = domSelection;
    //FIXME select element out of eidtor,zhe anchorNode would be null
    const anchorView = anchorNode.__view;
    const anchor = anchorView.pos + anchorView.border + anchorOffset;
    const $anchor = doc.resolve(anchor);

    const { focusNode, focusOffset } = domSelection;
    const headView = focusNode.__view;
    const head = headView.pos + headView.border + focusOffset;
    const $head = doc.resolve(head);

    const selection = TextSelection.between($anchor, $head);
    if (!this.state.selection.eq(selection)) {
      tr.setSelection(selection);
      this.dispatch(tr);
    }
  }
}

const doc = schema.node("doc", null, [
  schema.node("paragraph", null, [schema.text("Hello, ProseMirror!")]),
  schema.node("paragraph", null, [schema.text("Time to edit!")]),
]);

window.view=new EditorView(document.querySelector('#editor'),{
  state:EditorState.create({doc})
})