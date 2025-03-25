plugin.spec.view的初始化操作在实例化EditorView调用updatePluginViews完成，其初始化后返回的结果被push到editorView.pluginViews，方便后续state更新调用pluginView.update()


[innerDecorations](MARK explaination for innerDecoration)

NodeViewConstructor(node, view, getPos, decorations, innerDecorations)
  函数在NodeViewDesc.create中被调用
    getPos返回当前节点的位置
