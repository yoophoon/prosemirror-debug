import {findDiffStart, findDiffEnd} from "./diff"
import {Node, TextNode} from "./node"
import {Schema} from "./schema"

/// A fragment represents a node's collection of child nodes.
///
/// Like nodes, fragments are persistent data structures, and you
/// should not mutate them or their content. Rather, you create new
/// instances whenever needed. The API tries to make this easy.
/**
 * 文档片段表示一个节点的子节点集合。  
 * 和节点一样，文档片段也是持久数据结构并且不应该改变它们或它们的内容。应该创建一个新的实例。
 * 类提供的结构尝试让这样变得轻松
 */
export class Fragment {
  /// The size of the fragment, which is the total of the size of
  /// its content nodes.
  /** 文档片段的尺寸，这也是它的内容节点的总尺寸 */
  readonly size: number

  /// @internal
  /**
   * 
   * @param content 当前文档片段的内容节点数组
   * @param size 文档片段的尺寸，会自动根据其内容节点计算
   */
  constructor(
    /// The child nodes in this fragment.
    readonly content: readonly Node[],
    size?: number
  ) {
    this.size = size || 0
    if (size == null) for (let i = 0; i < content.length; i++)
      this.size += content[i].nodeSize
  }

  /// Invoke a callback for all descendant nodes between the given two
  /// positions (relative to start of this fragment). Doesn't descend
  /// into a node when the callback returns `false`.
  /**
   * 让给定的两个位置(相对于文档片段的开始位置)间的所有后代元素执行回调函数
   * 回调函数返回false的节点则不会触发调用
   * @param from 开始位置
   * @param to 结束位置
   * @param f 需要执行的回调函数
   * @param nodeStart 当前fragment所在的节点的开始位置
   * @param parent 可能会用于回调函数的一个可传参数
   */
  nodesBetween(from: number, to: number,
               f: (node: Node, start: number, parent: Node | null, index: number) => boolean | void,
               nodeStart = 0,
               parent?: Node) {
    for (let i = 0, pos = 0; pos < to; i++) {
      let child = this.content[i], end = pos + child.nodeSize
      // from位置位于当前节点且回调函数返回true且当前子节点的内容不为空
      if (end > from && f(child, nodeStart + pos, parent || null, i) !== false && child.content.size) {
        // 节点内容开头
        let start = pos + 1
        child.nodesBetween(Math.max(0, from - start),
                           Math.min(child.content.size, to - start),
                           f, nodeStart + start)
      }
      pos = end
    }
  }

  /// Call the given callback for every descendant node. `pos` will be
  /// relative to the start of the fragment. The callback may return
  /// `false` to prevent traversal of a given node's children.
  /**
   * 让每个后代节点都调用传入的回调函数。`pos`会相对于当前文档片段的开头。
   * 回调函数可能会返回`false`以避免指定节点后代节点调用
   * @param f 回调函数
   */
  descendants(f: (node: Node, pos: number, parent: Node | null, index: number) => boolean | void) {
    this.nodesBetween(0, this.size, f)
  }

  /// Extract the text between `from` and `to`. See the same method on
  /// [`Node`](#model.Node.textBetween).
  /**
   * 提取`from`到`to`之间的文本。查看`Node`同样的方法(本质依然是调用这个方法)
   * @param from 开始位置
   * @param to 结束位置
   * @param blockSeparator 块分隔符替代文本
   * @param leafText 叶子节点替代文本
   * @returns 字符串
   */
  textBetween(from: number, to: number, blockSeparator?: string | null, leafText?: string | null | ((leafNode: Node) => string)) {
    let text = "", first = true
    this.nodesBetween(from, to, (node, pos) => {
                      // 节点是否为文本节点，如果是文本节点则获取对应位置的文本
      let nodeText = node.isText ? node.text!.slice(Math.max(from, pos) - pos, to - pos) :
                                  // 节点是否为叶子节点，如果不是则返回""
                                  !node.isLeaf ? "" :
                                                //是叶子节点 是否指定了叶子节点处理方式(函数或者字符串替换) 
                                                leafText ? (typeof leafText === "function" ? leafText(node) : leafText) : 
                                                          //没有指定叶子节点的处理方式，查找节点类型规范是否指定了leafText属性处理叶子节点的值
                                                          node.type.spec.leafText ? node.type.spec.leafText(node) :
                                                                                    // 返回""
                                                                                    ""
      // 如果是块节点、叶子节点且(nodeText不为空或节点是文本块)且块分隔符不为空
      if (node.isBlock && (node.isLeaf && nodeText || node.isTextblock) && blockSeparator) {
        // first 置假 方便后续内容加上传入的分隔符
        if (first) first = false
        else text += blockSeparator
      }
      text += nodeText
    }, 0)
    return text
  }

  /// Create a new fragment containing the combined content of this
  /// fragment and the other.
  /**
   * 创建一个内容包含当前文档片段和传入的文档片段的新的文档片段，方法会合并fragment首尾的文本节点
   * 并以fragment.content:[...this.content, ...other.content]返回
   * @param other 另一个文档片段
   * @returns fragment
   */
  append(other: Fragment) {
    if (!other.size) return this
    if (!this.size) return other
    let last = this.lastChild!, first = other.firstChild!, content = this.content.slice(), i = 0
    if (last.isText && last.sameMarkup(first)) {
      content[content.length - 1] = (last as TextNode).withText(last.text! + first.text!)
      i = 1
    }
    for (; i < other.content.length; i++) content.push(other.content[i])
    return new Fragment(content, this.size + other.size)
  }

  /// Cut out the sub-fragment between the two given positions.
  /**
   * 从当前fragment的两个指定位置剪切出一个sub-fragment
   * @param from 剪切子文档片段的开始位置
   * @param to 剪切子文档片段的结束位置
   * @returns 文档片段
   */
  cut(from: number, to = this.size) {
    if (from == 0 && to == this.size) return this
    let result: Node[] = [], size = 0
    if (to > from) for (let i = 0, pos = 0; pos < to; i++) {
      let child = this.content[i], end = pos + child.nodeSize
      if (end > from) {
        if (pos < from || end > to) {
          if (child.isText)
            // 如果子节点是文本节点
            child = child.cut(Math.max(0, from - pos), Math.min(child.text!.length, to - pos))
          else
            child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1))
        }
        result.push(child)
        size += child.nodeSize
      }
      pos = end
    }
    return new Fragment(result, size)
  }

  /// @internal
  /**
   * 剪切指定下标子索引的子fragment
   * @param from 剪切的子元素下标索引开始位置
   * @param to 剪切的子元素下标索引结束位置
   * @returns fragment
   */
  cutByIndex(from: number, to: number) {
    if (from == to) return Fragment.empty
    if (from == 0 && to == this.content.length) return this
    return new Fragment(this.content.slice(from, to))
  }

  /// Create a new fragment in which the node at the given index is
  /// replaced by the given node.
  /**
   * 创建一个新的指定索引被指定节点替换过的fragment
   * @param index 被替换的子元素的索引
   * @param node 用于替换的节点
   * @returns 被替换之后的fragment
   */
  replaceChild(index: number, node: Node) {
    let current = this.content[index]
    if (current == node) return this
    let copy = this.content.slice()
    let size = this.size + node.nodeSize - current.nodeSize
    copy[index] = node
    return new Fragment(copy, size)
  }

  /// Create a new fragment by prepending the given node to this
  /// fragment.
  /**
   * 通过将给定的节点添加到当前fragment的开头来创建一个新的fragment
   * @param node 被添加的节点
   * @returns fragment
   */
  addToStart(node: Node) {
    return new Fragment([node].concat(this.content), this.size + node.nodeSize)
  }

  /// Create a new fragment by appending the given node to this
  /// fragment.
  /**
   * 通过将给定节点添加到当前fragment的结尾来创建一个新的fragment
   * @param node 被添加的节点
   * @returns fragment
   */
  addToEnd(node: Node) {
    return new Fragment(this.content.concat(node), this.size + node.nodeSize)
  }

  /// Compare this fragment to another one.
  /**
   * 通过node.eq进行fragment.eq对比
   * @param other 另一个fragment
   * @returns 如果两个相等则返回true
   */
  eq(other: Fragment): boolean {
    if (this.content.length != other.content.length) return false
    for (let i = 0; i < this.content.length; i++)
      if (!this.content[i].eq(other.content[i])) return false
    return true
  }

  /// The first child of the fragment, or `null` if it is empty.
  /** 当前fragment的第一个子节点，如果fragment为空的则返回null */
  get firstChild(): Node | null { return this.content.length ? this.content[0] : null }

  /// The last child of the fragment, or `null` if it is empty.
  /** 当前fragment的最后一个子节点，如果fragment为空则返回null */
  get lastChild(): Node | null { return this.content.length ? this.content[this.content.length - 1] : null }

  /// The number of child nodes in this fragment.
  /** 当前文档片段的子节点数量 */
  get childCount() { return this.content.length }

  /// Get the child node at the given index. Raise an error when the
  /// index is out of range.
  /**
   * 获取传入的index指向的子元素。当索引超出范围则抛出一个错误
   * @param index 索引元素的下标
   * @returns 索引指向的元素
   */
  child(index: number) {
    let found = this.content[index]
    if (!found) throw new RangeError("Index " + index + " out of range for " + this)
    return found
  }

  /// Get the child node at the given index, if it exists.
  /**
   * 获取指定索引的子元素，如果该元素不存在则返回null
   * @param index 子节点索引
   * @returns 被索引的子节点或null
   */
  maybeChild(index: number): Node | null {
    return this.content[index] || null
  }

  /// Call `f` for every child node, passing the node, its offset
  /// into this parent node, and its index.
  /**
   * 为每个子节点调用`f`回调函数，参数为node:当前处理的节点，offset:位置偏移，index：索引
   * @param f 回调函数
   */
  forEach(f: (node: Node, offset: number, index: number) => void) {
    for (let i = 0, p = 0; i < this.content.length; i++) {
      let child = this.content[i]
      f(child, p, i)
      p += child.nodeSize
    }
  }

  /// Find the first position at which this fragment and another
  /// fragment differ, or `null` if they are the same.
  /**
   * 查找当前fragment与传入的fragment第一处内容不同的位置，如果内容都相同则返回null
   * @param other 另一个文档片段
   * @param pos 开始比较的位置 默认为0
   * @returns 内容不同的开始位置
   */
  findDiffStart(other: Fragment, pos = 0) {
    return findDiffStart(this, other, pos)
  }

  /// Find the first position, searching from the end, at which this
  /// fragment and the given fragment differ, or `null` if they are
  /// the same. Since this position will not be the same in both
  /// nodes, an object with two separate positions is returned.
  /**
   * 从末尾开始查找当前文档和指定文档内容不同的位置，如果两个fragment相同则返回null
   * 由于位置在两个节点中可能会不同，函数将会返回两个分开的位置
   * @param other 另一个文档片段
   * @param pos 当前文档开始位置 默认为当前fragment的尺寸
   * @param otherPos 指定文档开始位置 默认为指定fragment的尺寸
   * @returns 内容不同的终点位置
   */
  findDiffEnd(other: Fragment, pos = this.size, otherPos = other.size) {
    return findDiffEnd(this, other, pos, otherPos)
  }

  /// Find the index and inner offset corresponding to a given relative
  /// position in this fragment. The result object will be reused
  /// (overwritten) the next time the function is called. @internal
  /**
   * 根据传入的pos查找index和内部偏移信息。当再次调用这个函数时结果对象会被重复使用(重载)  
   * 这个函数有个特性 如果round为明确定位为大于0且传入的pos=返回的offset时这意味者这个传入的位置在节点连接处
   * @param pos 位置
   * @param round 是否指向元素的后方  
   * 大于0则index指向当前节点的下一个节点 offset则包含当前节点的尺寸  
   * 小于或等于0则index指向当前节点 offset则不包含当前节点的尺寸  
   * @returns 返回一个包含index(索引)及offset(偏移)的对象  
   * 如果pos刚好指向第i个元素的after或者函数的第二个参数大于0则返回索引为i+1偏移值为第i个元素的after位置  
   * 否则返回索引为pos所在元素索引偏移值为所在元素的before值
   */
  findIndex(pos: number, round = -1): {index: number, offset: number} {
    if (pos == 0) return retIndex(0, pos)
    if (pos == this.size) return retIndex(this.content.length, pos)
    if (pos > this.size || pos < 0) throw new RangeError(`Position ${pos} outside of fragment (${this})`)
    for (let i = 0, curPos = 0;; i++) {
      let cur = this.child(i), end = curPos + cur.nodeSize
      if (end >= pos) {
        if (end == pos || round > 0) return retIndex(i + 1, end)
        return retIndex(i, curPos)
      }
      curPos = end
    }
  }

  /// Return a debugging string that describes this fragment.
  /** 返回一个描述当前fragment的调试字符串 */
  toString(): string { return "<" + this.toStringInner() + ">" }

  /// @internal
  /** 返回当前fragment的内容(用`, `分隔) */
  toStringInner() { return this.content.join(", ") }

  /// Create a JSON-serializeable representation of this fragment.
  /** 创建当前fragment的JSON格式内容 */
  toJSON(): any {
    return this.content.length ? this.content.map(n => n.toJSON()) : null
  }

  /// Deserialize a fragment from its JSON representation.
  /**
   * 从一个JSON对象中反序列化一个fragment
   * @param schema 文档架构
   * @param value JSON值
   * @returns fragment
   */
  static fromJSON(schema: Schema, value: any) {
    if (!value) return Fragment.empty
    if (!Array.isArray(value)) throw new RangeError("Invalid input for Fragment.fromJSON")
    return new Fragment(value.map(schema.nodeFromJSON))
  }

  /// Build a fragment from an array of nodes. Ensures that adjacent
  /// text nodes with the same marks are joined together.
  /**
   * 从指定的节点数组中构建一个fragment。确保相邻的有同样marks的文本节点会被合并为一个
   * @param array 节点数组
   * @returns fragment
   */
  static fromArray(array: readonly Node[]) {
    if (!array.length) return Fragment.empty
    let joined: Node[] | undefined, size = 0
    for (let i = 0; i < array.length; i++) {
      let node = array[i]
      size += node.nodeSize
      if (i && node.isText && array[i - 1].sameMarkup(node)) {
        if (!joined) joined = array.slice(0, i)
        joined[joined.length - 1] = (node as TextNode)
                                      .withText((joined[joined.length - 1] as TextNode).text + (node as TextNode).text)
      } else if (joined) {
        joined.push(node)
      }
    }
    return new Fragment(joined || array, size)
  }

  /// Create a fragment from something that can be interpreted as a
  /// set of nodes. For `null`, it returns the empty fragment. For a
  /// fragment, the fragment itself. For a node or array of nodes, a
  /// fragment containing those nodes.
  /**
   * 根据可以被认为是节点集合的对象(参数nodes)创建一个文档片段。  
   * 如果传入的参数是null则返回一个空的fragment  
   * 如果传入的是一个fragment则返回自身。  
   * 如果传入的是一个节点或者节点数组则返回一个包含这些节点的fragment  
   * 否则抛出一个创建文档片段失败的错误
   * @param nodes 文档片段、节点、节点数组、null
   * @returns 返回一个fragment（文档片段）
   */
  static from(nodes?: Fragment | Node | readonly Node[] | null) {
    if (!nodes) return Fragment.empty
    if (nodes instanceof Fragment) return nodes
    if (Array.isArray(nodes)) return this.fromArray(nodes)
    if ((nodes as Node).attrs) return new Fragment([nodes as Node], (nodes as Node).nodeSize)
    throw new RangeError("Can not convert " + nodes + " to a Fragment" +
      ((nodes as any).nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""))
  }

  /// An empty fragment. Intended to be reused whenever a node doesn't
  /// contain anything (rather than allocating a new empty fragment for
  /// each leaf node).
  /** 一个空的fragment。被倾向复用于不包含任何东西的节点
   * （而不是为每个叶子节点分配一个新的empty-fragment） */
  static empty: Fragment = new Fragment([], 0)
}

const found = {index: 0, offset: 0}
function retIndex(index: number, offset: number) {
  found.index = index
  found.offset = offset
  return found
}
