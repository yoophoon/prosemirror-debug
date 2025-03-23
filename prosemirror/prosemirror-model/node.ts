import {Fragment} from "./fragment"
import {Mark} from "./mark"
import {Schema, NodeType, Attrs, MarkType} from "./schema"
import {Slice, replace} from "./replace"
import {ResolvedPos} from "./resolvedpos"
import {compareDeep} from "./comparedeep"

const emptyAttrs: Attrs = Object.create(null)

/// This class represents a node in the tree that makes up a
/// ProseMirror document. So a document is an instance of `Node`, with
/// children that are also instances of `Node`.
///
/// Nodes are persistent data structures. Instead of changing them, you
/// create new ones with the content you want. Old ones keep pointing
/// at the old document shape. This is made cheaper by sharing
/// structure between the old and new data as much as possible, which a
/// tree shape like this (without back pointers) makes easy.
///
/// **Do not** directly mutate the properties of a `Node` object. See
/// [the guide](/docs/guide/#doc) for more information.
/**
 * Node类表示组成prosemirror document树中的一个节点。
 * 因此，一个文档是`Node`的一个实例其子元素也是`Node`的实例  
 * 节点是持久性数据结构。创建一个带有想要的内容的节点替换它而不是直接修改它。旧的节点依然存储着就得文档内容
 * 这使得新老数据共享结构变得尽可能的简单，像这样的文档树方便多了  
 * **`不要直接修改节点对象的属性`**
 */
export class Node {
  /// @internal
  /**
   * 根据传入的参数构建一个节点
   * @param type 当前节点的类型
   * @param attrs 一个映射属性名称到值的对象，被允许和被要求的属性的种类被节点类型决定
   * @param content 持有当前节点的字节点的fragment node.content(fragment).content(childNode)
   * @param marks 当前节点的mark
   */
  constructor(
    /// The type of node that this is.
    /** 当前节点的类型 */
    readonly type: NodeType,
    /// An object mapping attribute names to values. The kind of
    /// attributes allowed and required are
    /// [determined](#model.NodeSpec.attrs) by the node type.
    /** 一个映射属性名称到值的对象，被允许和被要求的属性的种类被节点类型决定 */
    readonly attrs: Attrs,
    // A fragment holding the node's children.
    /** 持有当前节点的字节点的fragment node.content(fragment).content(childNode) */
    content?: Fragment | null,
    /// The marks (things like whether it is emphasized or part of a
    /// link) applied to this node.
    /** 应用于当前节点的mark(如加粗、链接等)，默认没有 */
    readonly marks = Mark.none
  ) {
    this.content = content || Fragment.empty
  }

  /// A container holding the node's children.
  /** 存有当前节点子元素的容器 */
  readonly content: Fragment

  /// The array of this node's child nodes.
  /** 当前节点所有子元素 */
  get children() { return this.content.content }

  /// For text nodes, this contains the node's text content.
  /** 对于文本节点，这个保存着节点的文本内容 */
  readonly text: string | undefined

  /// The size of this node, as defined by the integer-based [indexing
  /// scheme](/docs/guide/#doc.indexing). For text nodes, this is the
  /// amount of characters. For other leaf nodes, it is one. For
  /// non-leaf nodes, it is the size of the content plus two (the
  /// start and end token).
  /**
   * 当前节点的尺寸，如被基于整数索引架构定义的那样。对于文本节点而言这是字符的数量，
   * 对于其他叶子节点而言，这是1，对于非叶子节点，这是它的内容尺寸+2（开始、结束标记各算一个）
   */
  get nodeSize(): number { return this.isLeaf ? 1 : 2 + this.content.size }

  /// The number of children that the node has.
  /** 当前节点拥有的子节点数量 */
  get childCount() { return this.content.childCount }

  /// Get the child node at the given index. Raises an error when the
  /// index is out of range.
  /**
   * 获取索引指定的子元素，如果索引超限则抛出错误
   * @param index 子元素的下标索引
   * @returns 索引对应的子元素
   */
  child(index: number) { return this.content.child(index) }

  /// Get the child node at the given index, if it exists.
  /**
   * 获取指定索引的子元素，如果该元素不存在则返回null
   * @param index 子节点索引
   * @returns 被索引的子节点或null
   */
  maybeChild(index: number) { return this.content.maybeChild(index) }

  /// Call `f` for every child node, passing the node, its offset
  /// into this parent node, and its index.
  /**
   * 让每个子节点都执行一次回调函数`f`
   * @param f 回调函数 node：正在处理的子元素节点 offset：相对于当前节点的偏移 index：子元素节点索引
   */
  forEach(f: (node: Node, offset: number, index: number) => void) { this.content.forEach(f) }

  /// Invoke a callback for all descendant nodes recursively between
  /// the given two positions that are relative to start of this
  /// node's content. The callback is invoked with the node, its
  /// position relative to the original node (method receiver), 
  /// its parent node, and its child index. When the callback returns
  /// false for a given node, that node's children will not be
  /// recursed over. The last parameter can be used to specify a 
  /// starting position to count from.
  /**
   * 让给定的两个位置(相对于节点的开始位置)间的所有后代元素执行回调函数。
   * 回调函数会将当前节点、相对原始节点的位置(接收该方法的节点)、父节点及子节点索引作为参数调用。
   * 回调函数返回false的节点则不会触发调用。最后一个参数可以用来指定计数的开始位置
   * @param from 开始位置
   * @param to 结束位置
   * @param f 回调函数
   * @param startPos 开始位置（初始偏移值）
   */
  nodesBetween(from: number, to: number,
               f: (node: Node, pos: number, parent: Node | null, index: number) => void | boolean,
               startPos = 0) {
    this.content.nodesBetween(from, to, f, startPos, this)
  }

  /// Call the given callback for every descendant node. Doesn't
  /// descend into a node when the callback returns `false`.
  /**
   * 让每个后代节点调用指定的回调函数。当返回false时则不会被继续传递给后代节点
   * @param f 回调函数
   */
  descendants(f: (node: Node, pos: number, parent: Node | null, index: number) => void | boolean) {
    this.nodesBetween(0, this.content.size, f)
  }

  /// Concatenates all the text nodes found in this fragment and its
  /// children.
  /** 连接所有的文本节点及其子节点 */
  get textContent() {
    return (this.isLeaf && this.type.spec.leafText)
      ? this.type.spec.leafText(this)
      : this.textBetween(0, this.content.size, "")
  }

  /// Get all text between positions `from` and `to`. When
  /// `blockSeparator` is given, it will be inserted to separate text
  /// from different block nodes. If `leafText` is given, it'll be
  /// inserted for every non-text leaf node encountered, otherwise
  /// [`leafText`](#model.NodeSpec^leafText) will be used.
  /**
   * 获取`from`到`to`之间的所有文本。当`blockSeparator`被指定时，它会被插在来自不同块节点的
   * 文本之间。如果`leafText`被指定时，当每个非文本叶子节点被收录时它将会被插入
   * 否则则调用`leafText(model.NodeSpec.leafText)`
   * @param from 开始位置
   * @param to 结束位置
   * @param blockSeparator 块分隔符
   * @param leafText 叶子节点
   * @returns 字符串
   */
  textBetween(from: number, to: number, blockSeparator?: string | null,
              leafText?: null | string | ((leafNode: Node) => string)) {
    return this.content.textBetween(from, to, blockSeparator, leafText)
  }

  /// Returns this node's first child, or `null` if there are no
  /// children.
  /** 返回第一个子节点，如果没有子节点则返回null */
  get firstChild(): Node | null { return this.content.firstChild }

  /// Returns this node's last child, or `null` if there are no
  /// children.
  /** 返回末尾子节点，如果没有子节点则返回null */
  get lastChild(): Node | null { return this.content.lastChild }

  /// Test whether two nodes represent the same piece of document.
  /**
   * 测试两个节点是否表示一样的文档内容
   * @param other 另一个节点
   * @returns 如果节点相同则返回true否则false
   */
  eq(other: Node) {
    return this == other || (this.sameMarkup(other) && this.content.eq(other.content))
  }

  /// Compare the markup (type, attributes, and marks) of this node to
  /// those of another. Returns `true` if both have the same markup.
  /**
   * 比较当前节点和指定节点(类型、属性及marks)。
   * @param other 另一个节点
   * @returns 如果两者mark一样则返回true
   */
  sameMarkup(other: Node) {
    return this.hasMarkup(other.type, other.attrs, other.marks)
  }

  /// Check whether this node's markup correspond to the given type,
  /// attributes, and marks.
  /**
   * 检查当前节点的属性是否和指定的属性一致
   * @param type 节点类型
   * @param attrs 属性
   * @param marks marks
   * @returns 
   */
  hasMarkup(type: NodeType, attrs?: Attrs | null, marks?: readonly Mark[]): boolean {
    return this.type == type &&
      compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
      Mark.sameSet(this.marks, marks || Mark.none)
  }

  /// Create a new node with the same markup as this node, containing
  /// the given content (or empty, if no content is given).
  /**
   * 用当前节点的属性创建一个新的节点并包含传入的内容，如果没有指定内容则为空
   * @param content 内容
   * @returns 新节点
   */
  copy(content: Fragment | null = null): Node {
    if (content == this.content) return this
    return new Node(this.type, this.attrs, content, this.marks)
  }

  /// Create a copy of this node, with the given set of marks instead
  /// of the node's own marks.
  /**
   * 创建当前节点的拷贝，除了marks被指定的替换其余均与当前节点一致
   * @param marks 指定的marks
   * @returns 如果传入的marks和当前节点一致则直接返回当前节点否则返回新节点(出marks为传入的其余均与当前节点一致)
   */
  mark(marks: readonly Mark[]): Node {
    return marks == this.marks ? this : new Node(this.type, this.attrs, this.content, marks)
  }

  /// Create a copy of this node with only the content between the
  /// given positions. If `to` is not given, it defaults to the end of
  /// the node.
  /**
   * 创建一个指定位置间内容的拷贝节点。如果`to`没被指定，默认为当前节点的末尾
   * @param from 开始位置
   * @param to 结束位置
   * @returns 返回新节点
   */
  cut(from: number, to: number = this.content.size): Node {
    if (from == 0 && to == this.content.size) return this
    return this.copy(this.content.cut(from, to))
  }

  /// Cut out the part of the document between the given positions, and
  /// return it as a `Slice` object.
  /**
   * 
   * @param from 剪切开始位置
   * @param to 剪切结束位置
   * @param includeParents 
   * @returns 将指定位置间的内容作为slice对象返回
   */
  slice(from: number, to: number = this.content.size, includeParents = false) {
    // 如果选区为光标状态 则返回Slice.empty
    if (from == to) return Slice.empty
    // 
    let $from = this.resolve(from), $to = this.resolve(to)
    // 是否包含节点本身，如果包含节点本身则层级为当前节点所在层级否则层级为开始和结束位置共同父元素所在的层级
    let depth = includeParents ? 0 : $from.sharedDepth(to)
    let start = $from.start(depth), node = $from.node(depth)
    let content = node.content.cut($from.pos - start, $to.pos - start)
    // 这里的content是一个完整的fragment，层级差正好对应每个层级的父元素的token
    return new Slice(content, $from.depth - depth, $to.depth - depth)
  }

  /// Replace the part of the document between the given positions with
  /// the given slice. The slice must 'fit', meaning its open sides
  /// must be able to connect to the surrounding content, and its
  /// content nodes must be valid children for the node they are placed
  /// into. If any of this is violated, an error of type
  /// [`ReplaceError`](#model.ReplaceError) is thrown.
  /**
   * 用指定的切片替换当前节点from到to位置部分。切片必须`fit`(意思是它的开放边界必须能连接周围的内容，
   * 它的内容节点必须是当前节点的有效子节点)。如果有不满足的情况则会抛出一个替换错误`replaceError`
   * 
   * @param from 开始位置
   * @param to 结束位置
   * @param slice 用于替换的内容切片
   * @returns 返回一个新的被替换过的node
   */
  replace(from: number, to: number, slice: Slice) {
    return replace(this.resolve(from), this.resolve(to), slice)
  }

  /// Find the node directly after the given position.
  /**
   * 查找指定位置正后面的节点，如果该位置不是某个节点的before或者不是文本节点则返回null
   * @param pos 用于查找节点的位置
   * @returns 如果指定位置恰好是某个节点的before或者位置指向的是一个文本节点则返回该节点
   */
  nodeAt(pos: number): Node | null {
    for (let node: Node | null = this;;) {
      let {index, offset} = node.content.findIndex(pos)
      node = node.maybeChild(index)
      if (!node) return null
      if (offset == pos || node.isText) return node
      pos -= offset + 1
    }
  }

  /// Find the (direct) child node after the given offset, if any,
  /// and return it along with its index and offset relative to this
  /// node.
  /**
   * 查找指定位置的子节点，如果存在则返回这个节点及它相对于当前节点的索引和偏移值
   * @param pos 用于查找节点的位置
   * @returns 返回该位置关于当前节点的一些信息
   */
  childAfter(pos: number): {node: Node | null, index: number, offset: number} {
    let {index, offset} = this.content.findIndex(pos)
    return {node: this.content.maybeChild(index), index, offset}
  }

  /// Find the (direct) child node before the given offset, if any,
  /// and return it along with its index and offset relative to this
  /// node.
  /**
   * 查找指定位置的子节点，如果存在则返回这个节点及它相对于当前节点的索引和偏移值
   * @param pos 用于查找节点的位置
   * @returns 返回该位置关于当前节点的一些信息
   */
  childBefore(pos: number): {node: Node | null, index: number, offset: number} {
    if (pos == 0) return {node: null, index: 0, offset: 0}
    let {index, offset} = this.content.findIndex(pos)
    if (offset < pos) return {node: this.content.child(index), index, offset}
    let node = this.content.child(index - 1)
    return {node, index: index - 1, offset: offset - node.nodeSize}
  }

  /// Resolve the given position in the document, returning an
  /// [object](#model.ResolvedPos) with information about its context.
  /**
   * 被解析的位置在当前节点的resolvedPos信息
   * (prosemirror会自动缓存一些节点的resolvedPos信息，每个节点最多保留12个resolvedPos对象)
   * @param pos 被解析的位置
   * @returns pos在当前节点的resolvedPos对象
   */
  resolve(pos: number) { return ResolvedPos.resolveCached(this, pos) }

  /// @internal
  /**
   * 不使用缓存直接解析
   * @param pos 被解析的位置
   * @returns pos在当前节点的resolvedPos对象
   */
  resolveNoCache(pos: number) { return ResolvedPos.resolve(this, pos) }

  /// Test whether a given mark or mark type occurs in this document
  /// between the two given positions.
  /**
   * 测试当前节点指定范围内是否有指定的mark或markType
   * @param from 当前节点的开始位置
   * @param to 当前节点的结束位置
   * @param type mark类型
   * @returns 如果在当前节点的指定范围存在指定的mark类型返回true否则返回false
   */
  rangeHasMark(from: number, to: number, type: Mark | MarkType): boolean {
    let found = false
    if (to > from) this.nodesBetween(from, to, node => {
      if (type.isInSet(node.marks)) found = true
      return !found
    })
    return found
  }

  /// True when this is a block (non-inline node)
  /** 如果当前节点是块则返回true(非内联节点) */
  get isBlock() { return this.type.isBlock }

  /// True when this is a textblock node, a block node with inline
  /// content.
  /** 如果当前节点是文本块则返回true(带有内联内容的块节点) */
  get isTextblock() { return this.type.isTextblock }

  /// True when this node allows inline content.
  /** 如果当前节点允许内联内容则返回true */
  get inlineContent() { return this.type.inlineContent }

  /// True when this is an inline node (a text node or a node that can
  /// appear among text).
  /** 如果当前节点是内联节点则返回true(文本节点或者出现在文本节点间的节点) */
  get isInline() { return this.type.isInline }

  /// True when this is a text node.
  /** 如果当前节点是文本节点则返回true */
  get isText() { return this.type.isText }

  /// True when this is a leaf node.
  /** 如果当前节点是叶子节点则返回true */
  get isLeaf() { return this.type.isLeaf }

  /// True when this is an atom, i.e. when it does not have directly
  /// editable content. This is usually the same as `isLeaf`, but can
  /// be configured with the [`atom` property](#model.NodeSpec.atom)
  /// on a node's spec (typically used when the node is displayed as
  /// an uneditable [node view](#view.NodeView)).
  /** 如果当前节点是原子节点则返回true，例如当它没有直接可编辑内容。这通常与叶子节点相同，但能通过
   * `nodeSpec`的`atom`属性配置(典型应用就是作为一个不可编辑的节点视图)
   */
  get isAtom() { return this.type.isAtom }

  /// Return a string representation of this node for debugging
  /// purposes.
  /** 返回用于当前节点调试的字符串内容 */
  toString(): string {
    if (this.type.spec.toDebugString) return this.type.spec.toDebugString(this)
    let name = this.type.name
    if (this.content.size)
      name += "(" + this.content.toStringInner() + ")"
    return wrapMarks(this.marks, name)
  }

  /// Get the content match in this node at the given index.
  /**
   * 当前节点指定索引位置的contentMatch
   * @param index 索引
   * @returns contentMatch
   */
  contentMatchAt(index: number) {
    let match = this.type.contentMatch.matchFragment(this.content, 0, index)
    if (!match) throw new Error("Called contentMatchAt on a node with invalid content")
    return match
  }

  /// Test whether replacing the range between `from` and `to` (by
  /// child index) with the given replacement fragment (which defaults
  /// to the empty fragment) would leave the node's content valid. You
  /// can optionally pass `start` and `end` indices into the
  /// replacement fragment.
  /**
   * 测试使用指定的replacement替换当前节点`from`到`to`的范围是否有效。可以额外的传递`start`
   * 和`end`来表明replacement fragment中参与替换的地方(默认为整个用于替换的fragment，其值默认为empty)  
   * 检测方式：from位置是否能接受replacement的start到end的内容->接受之后是否能继续接受当前节点to位置的内容
   * 如果不接受或者接受但没到终止状态则表示无法替换->当前节点是否接受替换内容的marks->全部通过返回true否则返回false
   * @param from 当前节点替换的开始位置（索引）
   * @param to 当前节点替换的结束位置（索引）
   * @param replacement 用于替换的fragment
   * @param start 用于替换的fragment的开始位置 默认为0
   * @param end 用于替换的fragment的结束位置 默认为用于替换的fragment的子节点数量
   * @returns 如果能够替换则返回true否则返回false
   */
  canReplace(from: number, to: number, replacement = Fragment.empty, start = 0, end = replacement.childCount) {
    let one = this.contentMatchAt(from).matchFragment(replacement, start, end)
    let two = one && one.matchFragment(this.content, to)
    if (!two || !two.validEnd) return false
    for (let i = start; i < end; i++) if (!this.type.allowsMarks(replacement.child(i).marks)) return false
    return true
  }

  /// Test whether replacing the range `from` to `to` (by index) with
  /// a node of the given type would leave the node's content valid.
  /**
   * 测试使用指定类型的节点替换`from`到`to`的内容是否会有效
   * @param from 当前节点替换的开始位置
   * @param to 当前节点替换的结束位置
   * @param type 节点类型
   * @param marks marks
   * @returns 
   */
  canReplaceWith(from: number, to: number, type: NodeType, marks?: readonly Mark[]) {
    if (marks && !this.type.allowsMarks(marks)) return false
    let start = this.contentMatchAt(from).matchType(type)
    let end = start && start.matchFragment(this.content, to)
    return end ? end.validEnd : false
  }

  /// Test whether the given node's content could be appended to this
  /// node. If that node is empty, this will only return true if there
  /// is at least one node type that can appear in both nodes (to avoid
  /// merging completely incompatible nodes).
  /**
   * 测试指定的节点内容是否能被添加到当前节点。如果是空节点则测试指定的节点类型是否能出现在当前节点  
   * (为了避免合并完全不兼容的节点)
   * @param other 被添加到当前节点的节点
   * @returns 
   */
  canAppend(other: Node) {
    if (other.content.size) return this.canReplace(this.childCount, this.childCount, other.content)
    else return this.type.compatibleContent(other.type)
  }

  /// Check whether this node and its descendants conform to the
  /// schema, and raise an exception when they do not.
  /** 检查当前节点及它的后代节点是否满足架构，如果不满足则抛出错误 */
  check() {
    this.type.checkContent(this.content)
    this.type.checkAttrs(this.attrs)
    let copy = Mark.none
    for (let i = 0; i < this.marks.length; i++) {
      let mark = this.marks[i]
      mark.type.checkAttrs(mark.attrs)
      copy = mark.addToSet(copy)
    }
    if (!Mark.sameSet(copy, this.marks))
      throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map(m => m.type.name)}`)
    this.content.forEach(node => node.check())
  }

  /// Return a JSON-serializeable representation of this node.
  /** 返回当前节点的JSON对象 */
  toJSON(): any {
    let obj: any = {type: this.type.name}
    for (let _ in this.attrs) {
      obj.attrs = this.attrs
      break
    }
    if (this.content.size)
      obj.content = this.content.toJSON()
    if (this.marks.length)
      obj.marks = this.marks.map(n => n.toJSON())
    return obj
  }

  /// Deserialize a node from its JSON representation.
  /**
   * 从节点的JSON对象中反序列化生成一个节点
   * @param schema 文档架构
   * @param json JSON对象
   * @returns 
   */
  static fromJSON(schema: Schema, json: any): Node {
    if (!json) throw new RangeError("Invalid input for Node.fromJSON")
    let marks: Mark[] | undefined = undefined
    if (json.marks) {
      if (!Array.isArray(json.marks)) throw new RangeError("Invalid mark data for Node.fromJSON")
      marks = json.marks.map(schema.markFromJSON)
    }
    if (json.type == "text") {
      if (typeof json.text != "string") throw new RangeError("Invalid text node in JSON")
      return schema.text(json.text, marks)
    }
    let content = Fragment.fromJSON(schema, json.content)
    let node = schema.nodeType(json.type).create(json.attrs, content, marks)
    node.type.checkAttrs(node.attrs)
    return node
  }
}

;(Node.prototype as any).text = undefined
/** 内部使用的文本节点对象 */
export class TextNode extends Node {
  readonly text: string

  /// @internal
  /**
   * 生成一个文本节点，传入的content会被挂载到text属性上而非content属性
   * @param type 节点类型
   * @param attrs 节点属性
   * @param content 节点内容
   * @param marks 节点marks
   */
  constructor(type: NodeType, attrs: Attrs, content: string, marks?: readonly Mark[]) {
    super(type, attrs, null, marks)
    if (!content) throw new RangeError("Empty text nodes are not allowed")
    this.text = content
  }
  /** 返回用于调试的字符串信息 查看`Node.toString` */
  toString() {
    if (this.type.spec.toDebugString) return this.type.spec.toDebugString(this)
    return wrapMarks(this.marks, JSON.stringify(this.text))
  }
  /** 返回当前节点的文本内容 */
  get textContent() { return this.text }
  /**
   * @param from 开始位置
   * @param to 结束位置
   * @returns 返回指定位置的文本内容
   */
  textBetween(from: number, to: number) { return this.text.slice(from, to) }
  /** 返回节点尺寸 */
  get nodeSize() { return this.text.length }
  /**
   * @param marks 用于标记当前节点文本内容的marks
   * @returns 返回一个新的应用了指定marks的文本节点
   */
  mark(marks: readonly Mark[]) {
    return marks == this.marks ? this : new TextNode(this.type, this.attrs, this.text, marks)
  }
  /** 根据当前文本节点创建一个新的除文本内容不同其余均相同的文本节点 */
  withText(text: string) {
    if (text == this.text) return this
    return new TextNode(this.type, this.attrs, text, this.marks)
  }
  /**
   * @param from 剪切开始位置
   * @param to 剪切结束位置
   * @returns 返回指定范围的文本节点
   */
  cut(from = 0, to = this.text.length) {
    if (from == 0 && to == this.text.length) return this
    return this.withText(this.text.slice(from, to))
  }
  /**
   * @param other 另一个用于比较的文本节点
   * @returns 如果两个节点一样则返回true否则返回false
   */
  eq(other: Node) {
    return this.sameMarkup(other) && this.text == other.text
  }
  /** 生成当前文本节点的JSON对象 */
  toJSON() {
    let base = super.toJSON()
    base.text = this.text
    return base
  }
}
/**
 * 将指定的字符串用指定的mark包裹起来
 * @param marks 用于包裹的mark
 * @param str 被包裹的字符串
 * @returns 被mark包裹的字符串
 */
function wrapMarks(marks: readonly Mark[], str: string) {
  for (let i = marks.length - 1; i >= 0; i--)
    str = marks[i].type.name + "(" + str + ")"
  return str
}
