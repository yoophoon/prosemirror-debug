[MARK EditorState.create]
Editor.create(config:EditorStateConfig):EditorState
  1.根据传进来的config获得一个Configuration实例，这个实例挂载在EditorView.state.config上
  2.根据Configuration实例获得一个EditorState实例
  3.调用state.config.field.init方法分别对state的各个字段进行初始化
  4.返回EditorState实例
