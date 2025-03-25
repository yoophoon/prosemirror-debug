# nodeSpec、node、nodeType、doc、fragment
nodeSpec：用户定义的对象字面量
nodeType：prosemirror-model内部根据用户传入的nodeSpec生成的唯一实例对象，state.nodes指向这些实例对象的集合
node：根据nodeType生成的保存文档内容的实例，node.nodeType指向nodeType
doc：topNodeType，本质为一个node，当前文档在prosemirror的映射
fragment：node的集合，parentNode和childrenNodes的连接层，方便对childrenNodes的一些操作,大多数对node子节点的操作都是经由fragment实现的
node的结构：node.content=fragment,fragment.content=node[]
> 类似的还有markSpec、mark、markType

# isBlock,isInline,inlineContent
节点类型的本质只有两种及内联节点和块节点，但包含inlineContent的block节点会被prosemirror内部认为是文本块节点，本质应该还是块节点


# content.ts
里面有一些NFA和DFA的东西，看不懂，等补完相关知识后再看