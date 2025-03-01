//@ts-nocheck
import {EditorState, Plugin} from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from 'prosemirror-schema-basic'

// https://nytimes.github.io/oak-byo-react-prosemirror-redux/post/prosemirror-basics/
// ProseMirror Basics

const counterPlugin=new Plugin({
  state:{
    init(){
      return 0;
    },
    apply(tr, value, oldState, newState) {
        const counterPluginMeta=tr.getMeta(counterPlugin)
        switch(counterPluginMeta?.type){
          case "counter/incremented":
            return value+1;
          case "counter/decremented":
            return value-1;
          default:
            return value;
        }
    },
  },
  view:(view:EditorView)=>{
    const countElement=document.querySelector('#count')!
    const count=counterPlugin.getState(view.state)
    countElement.innerHTML=count.toString()

    document.querySelector('#increment')?.addEventListener('click',()=>{
      const transaction=view.state.tr
      transaction.setMeta(counterPlugin.key,{type:'counter/incremented'})
      view.dispatch(transaction)
    })

    document.querySelector('#decrement')?.addEventListener('click',()=>{
      const transaction=view.state.tr
      transaction.setMeta(counterPlugin.key,{type:'counter/decremented'})
      console.log(counterPlugin)
      view.dispatch(transaction)
    })

    return {
      update(view:EditorView,prevState:EditorState){
        const count=counterPlugin.getState(view.state)
        countElement.innerHTML=count.toString()
      }
    }
  }
})

// @ts-ignore
window.view=new EditorView(document.querySelector('#editor'),{
  state:EditorState.create({
    schema,
    plugins:[counterPlugin]
  })
})

