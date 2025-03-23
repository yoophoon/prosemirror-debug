import {Mark} from "./mark"
import {Node} from "./node"

/// You can [_resolve_](#model.Node.resolve) a position to get more
/// information about it. Objects of this class represent such a
/// resolved position, providing various pieces of context
/// information, and some helper methods.
///
/// Throughout this interface, methods that take an optional `depth`
/// parameter will interpret undefined as `this.depth` and negative
/// numbers as `this.depth + value`.
/**
 * 通过解析一个位置获取关于该位置的更多信息。类实例表是这样一个被解析的位置提供一些上下文信息和一些工具方法
 * 
 * 接口方法采用的可选参数`depth`会将`this.depth`作为默认值且负数会使用`this.depth+value`代替
 * 参数会使用[`resolveDepth`](ResolvedPos.resolveDepth)进行处理
 */
export class ResolvedPos {
  /// The number of levels the parent node is from the root. If this
  /// position points directly into the root node, it is 0. If it
  /// points into a top-level paragraph, 1, and so on.
  /** 从根节点开始算被解析的位置的父节点的层级。
   * 如果这个位置直接指向根节点，这个值为0，如果指向顶层段落节点这个值则为1，诸如此类 
   */
  depth: number

  /// @internal
  /**
   * 构造一个位置解析对象
   * @param pos 用于解析的位置
   * @param path 路径由[parentNode,childIndex,childStart]组成，每三个代表一个层级的路径
   * @param parentOffset position所在节点位置相对于其父节点的偏移值
   */
  constructor(
    /// The position that was resolved.
    readonly pos: number,
    /// @internal
    readonly path: any[],
    /// The offset this position has into its parent node.
    readonly parentOffset: number
  ) {
    this.depth = path.length / 3 - 1
  }

  /// @internal
  /**
   * 将传入的val进行处理并放回符合ResolvedPos规定的depth
   * (undefined&null->this.depth;negative->this.depth+negative)
   * @param val depth值
   * @returns 符合resolvedPos规定的depth
   */
  resolveDepth(val: number | undefined | null) {
    if (val == null) return this.depth
    if (val < 0) return this.depth + val
    return val
  }

  /// The parent node that the position points into. Note that even if
  /// a position points into a text node, that node is not considered
  /// the parent—text nodes are ‘flat’ in this model, and have no content.
  /** 当前位置指向的父节点。
   * 即便指向了一个文本节点这个节点也不会被认为是父文本节点，因为文本节点是扁平的没有内容，
   * 文本节点的内容存在`text`属性上而非`content`属性 
   */
  get parent() { return this.node(this.depth) }

  /// The root node in which the position was resolved.
  /** 被解析的位置的根节点 */
  get doc() { return this.node(0) }

  /// The ancestor node at the given level. `p.node(p.depth)` is the
  /// same as `p.parent`.
  /**
   * 传入的层级的祖先节点。`p.node(p.depth)`和`p.parent`一样
   * @param depth 层级，如果未指定则采用this.depth
   * @returns 返回指定层级的父节点
   */
  node(depth?: number | null): Node { return this.path[this.resolveDepth(depth) * 3] }

  /// The index into the ancestor at the given level. If this points
  /// at the 3rd node in the 2nd paragraph on the top level, for
  /// example, `p.index(0)` is 1 and `p.index(1)` is 2.
  /**
   * 被解析的位置在传入的层级的父元素的子元素的索引（类似父元素的nthChild）。  
   * 比如resolvedPos指向顶层节点的第二个段落的第三个节点则`p.index(0)`是1(即第二个子元素)而`p.index(1)`是2(即第三个子元素)
   * @param depth 层级
   * @returns 返回位置在指定层级的元素在其父元素的索引
   */
  index(depth?: number | null): number { return this.path[this.resolveDepth(depth) * 3 + 1] }

  /// The index pointing after this position into the ancestor at the
  /// given level.
  /**
   * 返回指定层级父元素在当前位置之后的元素
   * （一般来说会返回指定层级当前元素的后一个元素的索引，但当这个位置在某个文本节点的开始位置则会返回当前元素的索引）
   * @param depth 层级
   * @returns 返回位置在指定层级的元素在其父元素之后节点的索引
   */
  indexAfter(depth?: number | null): number {
    depth = this.resolveDepth(depth)
    return this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1)
  }

  /// The (absolute) position at the start of the node at the given
  /// level.
  /**
   * 指定层级的节点的开始位置，如`<o>123</o>`这个值会在`1`前面而非在`<o>`前面
   * @param depth 层级
   * @returns 返回当前位置在其父元素内容的开始位置（不包含父元素的opening token）
   */
  start(depth?: number | null): number {
    depth = this.resolveDepth(depth)
    return depth == 0 ? 0 : this.path[depth * 3 - 1] + 1
  }

  /// The (absolute) position at the end of the node at the given
  /// level.
  /**
   * 指定层级的节点的结束位置，如`<o>123</o>`这个值会在`3`后面而非在`</o>`后面
   * @param depth 层级
   * @returns 放回当前位置在其父元素内容的结束位置（不包含父元素的closing token）
   */
  end(depth?: number | null): number {
    depth = this.resolveDepth(depth)
    return this.start(depth) + this.node(depth).content.size
  }

  /// The (absolute) position directly before the wrapping node at the
  /// given level, or, when `depth` is `this.depth + 1`, the original
  /// position.
  /**
   * 获取指定层级父元素的开始位置，如果传入的层级是当前层级的下级则返回原始位置信息
   * @param depth 层级
   * @returns 当传入的层级为当前层级的下级则返回原始位置，否则返回指定层级父元素的开始位置
   */
  before(depth?: number | null): number {
    depth = this.resolveDepth(depth)
    if (!depth) throw new RangeError("There is no position before the top-level node")
    return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1]
  }

  /// The (absolute) position directly after the wrapping node at the
  /// given level, or the original position when `depth` is `this.depth + 1`.
  /**
   * 获取指定层级父元素的结束位置，如果传入的层级是当前层级的下级则返回原始位置信息
   * @param depth 层级
   * @returns 当传入的层级为当前层级的下级则返回原始位置，否则返回指定层级父元素的结束位置
   */
  after(depth?: number | null): number {
    depth = this.resolveDepth(depth)
    if (!depth) throw new RangeError("There is no position after the top-level node")
    return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1] + this.path[depth * 3].nodeSize
  }

  /// When this position points into a text node, this returns the
  /// distance between the position and the start of the text node.
  /// Will be zero for positions that point between nodes.
  /** 当指向一个文本节点时将会返回文本节点起点到当前位置的距离，当指向节点首尾处则返回0 */
  get textOffset(): number { return this.pos - this.path[this.path.length - 1] }

  /// Get the node directly after the position, if any. If the position
  /// points into a text node, only the part of that node after the
  /// position is returned.
  /** 获取当前位置后一个节点，如果位置指向一个文本节点，则只返回这个文本节点在位置之后的部分内容 */
  get nodeAfter(): Node | null {
    let parent = this.parent, index = this.index(this.depth)
    if (index == parent.childCount) return null
    let dOff = this.pos - this.path[this.path.length - 1], child = parent.child(index)
    return dOff ? parent.child(index).cut(dOff) : child
  }

  /// Get the node directly before the position, if any. If the
  /// position points into a text node, only the part of that node
  /// before the position is returned.
  /** 获取当前位置前一个节点，如果位置指向一个文本节点，则只返回这个文本节点在位置之前的部分内容 */
  get nodeBefore(): Node | null {
    let index = this.index(this.depth)
    let dOff = this.pos - this.path[this.path.length - 1]
    if (dOff) return this.parent.child(index).cut(0, dOff)
    return index == 0 ? null : this.parent.child(index - 1)
  }

  /// Get the position at the given index in the parent node at the
  /// given depth (which defaults to `this.depth`).
  /**
   * 获取指定层级的父元素的指定索引子元素的位置
   * @param index 索引
   * @param depth 层级
   * @returns 返回在指定层级的父元素的指定索引元素的位置
   */
  posAtIndex(index: number, depth?: number | null): number {
    depth = this.resolveDepth(depth)
    let node = this.path[depth * 3], pos = depth == 0 ? 0 : this.path[depth * 3 - 1] + 1
    for (let i = 0; i < index; i++) pos += node.child(i).nodeSize
    return pos
  }

  /// Get the marks at this position, factoring in the surrounding
  /// marks' [`inclusive`](#model.MarkSpec.inclusive) property. If the
  /// position is at the start of a non-empty node, the marks of the
  /// node after it (if any) are returned.
  /**
   * 获取当前位置的marks，会考虑周边的marks的`inclusive`属性。如果位置在一个非空节点的起点，
   * 则会返回该位置之后的节点的marks
   * @returns 获取当前位置的marks
   */
  marks(): readonly Mark[] {
    let parent = this.parent, index = this.index()

    // In an empty parent, return the empty array
    if (parent.content.size == 0) return Mark.none

    // When inside a text node, just return the text node's marks
    if (this.textOffset) return parent.child(index).marks

    let main = parent.maybeChild(index - 1), other = parent.maybeChild(index)
    // If the `after` flag is true of there is no node before, make
    // the node after this position the main reference.
    if (!main) { let tmp = main; main = other; other = tmp }

    // Use all marks in the main node, except those that have
    // `inclusive` set to false and are not present in the other node.
    let marks = main!.marks
    for (var i = 0; i < marks.length; i++)
      // 要么次要节点不存在，如果次要节点存在但不包含当前节点的mark，那么将该mark从当前marks集合中移除
      if (marks[i].type.spec.inclusive === false && (!other || !marks[i].isInSet(other.marks)))
        // 精妙的写法，将第i个mark从marks集合中移除同时遍历索引前移一位
        marks = marks[i--].removeFromSet(marks)

    return marks
  }

  /// Get the marks after the current position, if any, except those
  /// that are non-inclusive and not present at position `$end`. This
  /// is mostly useful for getting the set of marks to preserve after a
  /// deletion. Will return `null` if this position is at the end of
  /// its parent node or its parent node isn't a textblock (in which
  /// case no marks should be preserved).
  /**
   * 获取当前位置之后的marks（看实现应该是获取当前位置与指定位置共有的marks），排除掉`inclusive`
   * 和不在`$end`的marks。这在获取删除内容后需要保留的marks极为有效。  
   * 返回`null`如果当前位置在其父节点内容末尾或者其父节点不是文本块（非文本块则没有marks需要被保留）
   * @param $end 指定的位置的resolvedPos
   * @returns 既存于当前位置又存于指定位置的marks集合
   */
  marksAcross($end: ResolvedPos): readonly Mark[] | null {
    let after = this.parent.maybeChild(this.index())
    // 存在但不是内联元素或者不存在（一般都是存在的，看这个节点是不是内联节点）
    if (!after || !after.isInline) return null

    let marks = after.marks, next = $end.parent.maybeChild($end.index())
    for (var i = 0; i < marks.length; i++)
      // 要么$end指向的节点不存在，如果$end指向的节点存在但不包含当前位置节点的mark，那么将该mark从当前marks集合中移除
      if (marks[i].type.spec.inclusive === false && (!next || !marks[i].isInSet(next.marks)))
        marks = marks[i--].removeFromSet(marks)
    return marks
  }

  /// The depth up to which this position and the given (non-resolved)
  /// position share the same parent nodes.
  /**
   * 指定的位置和当前位置在同一层级则返回该层级
   * @param pos 位置
   * @returns 指定的位置与当前的位置所在的同一层级
   */
  sharedDepth(pos: number): number {
    for (let depth = this.depth; depth > 0; depth--)
      if (this.start(depth) <= pos && this.end(depth) >= pos) return depth
    return 0
  }

  /// Returns a range based on the place where this position and the
  /// given position diverge around block content. If both point into
  /// the same textblock, for example, a range around that textblock
  /// will be returned. If they point into different blocks, the range
  /// around those blocks in their shared ancestor is returned. You can
  /// pass in an optional predicate that will be called with a parent
  /// node to see if a range into that parent is acceptable.
  /**
   * 返回一个基于被当前位置和指定位置分开的内容块的范围。
   * 如果两个都指向同一文本块，比如，内容块的那块区域将被返回
   * 如果它们指向了不同的块，则返回它们共同祖先元素的块的范围（通过层级确定的祖先元素节点）
   * 可以传入一个可选的被一个父元素调用的用于确定这个父元素的这个范围是否能被接受
   * @param other 另一个用于组成nodeRange的resolvedPos对象
   * @param pred 回调函数用于判断目标节点是否能用于构建nodeRange
   * @returns 一个nodeRange对象或者null
   */
  blockRange(other: ResolvedPos = this, pred?: (node: Node) => boolean): NodeRange | null {
    if (other.pos < this.pos) return other.blockRange(this)
    for (let d = this.depth - (this.parent.inlineContent || this.pos == other.pos ? 1 : 0); d >= 0; d--)
      if (other.pos <= this.end(d) && (!pred || pred(this.node(d))))
        return new NodeRange(this, other, d)
    return null
  }

  /// Query whether the given position shares the same parent node.
  /**
   * 查询传入的位置是否与当前位置共享一个父节点（本质是在比较两者父元素内容的开始位置）
   * @param other 另一个resolvedPos
   * @returns 如果传入的resolvedPos与当前的有同一个父节点则返回true否则返回false
   */
  sameParent(other: ResolvedPos): boolean {
    return this.pos - this.parentOffset == other.pos - other.parentOffset
  }

  /// Return the greater of this and the given position.
  /**
   * 返回传入位置与当前位置中较大的一个resolvedPos
   * @param other 用于比较的另一个resolvedPos
   * @returns 位置更大的resolvedPos
   */
  max(other: ResolvedPos): ResolvedPos {
    return other.pos > this.pos ? other : this
  }

  /// Return the smaller of this and the given position.
  /**
   * 返回传入位置与当前位置中较小的一个resolvedPos
   * @param other 用于比较的另一个resolvedPos
   * @returns 位置更小的resolvedPos
   */
  min(other: ResolvedPos): ResolvedPos {
    return other.pos < this.pos ? other : this
  }

  /// @internal
  /** 返回从第一层开始的nodeType_nodeIndex/...:parentOffset */
  toString() {
    let str = ""
    for (let i = 1; i <= this.depth; i++)
      str += (str ? "/" : "") + this.node(i).type.name + "_" + this.index(i - 1)
    return str + ":" + this.parentOffset
  }

  /// @internal
  /**
   * 将传入的pos在传入的doc上进行解析获取其详细的信息如path、parentOffset信息
   * @param doc 用于解析传入的pos的文档
   * @param pos 用于解析的位置
   * @returns resolvedPos对象
   */
  static resolve(doc: Node, pos: number): ResolvedPos {
    if (!(pos >= 0 && pos <= doc.content.size)) throw new RangeError("Position " + pos + " out of range")
    let path: Array<Node | number> = []
    let start = 0, parentOffset = pos
    for (let node = doc;;) {
      let {index, offset} = node.content.findIndex(parentOffset)
      let rem = parentOffset - offset
      path.push(node, index, start + offset)
      if (!rem) break
      node = node.child(index)
      if (node.isText) break
      parentOffset = rem - 1
      start += offset + 1
    }
    return new ResolvedPos(pos, path, parentOffset)
  }

  /// @internal
  /**
   * 函数会先尝试在缓存上查找，如果找到则直接返回缓存中的位置解析对象，如果没找到则在传入的文档中
   * 解析传入的pos并将解析结果缓存并返回。每个文档的位置解析缓存数量为12个
   * @param doc 用于解析传入的pos的文档
   * @param pos 用于解析的位置
   * @returns 返回解析的结果
   */
  static resolveCached(doc: Node, pos: number): ResolvedPos {
    let cache = resolveCache.get(doc)
    if (cache) {
      for (let i = 0; i < cache.elts.length; i++) {
        let elt = cache.elts[i]
        if (elt.pos == pos) return elt
      }
    } else {
      resolveCache.set(doc, cache = new ResolveCache)
    }
    let result = cache.elts[cache.i] = ResolvedPos.resolve(doc, pos)
    cache.i = (cache.i + 1) % resolveCacheSize
    return result
  }
}
/**
 * 解析缓存对象，i表示当前栈深度，resolvedPos则缓存着被解析的位置对象
 */
class ResolveCache {
  elts: ResolvedPos[] = []
  i = 0
}
/** 位置解析缓存数量 resolveCache是weakMap保存着不同的文档对应的位置解析缓存 */
const resolveCacheSize = 12, resolveCache = new WeakMap<Node, ResolveCache>()

/// Represents a flat range of content, i.e. one that starts and
/// ends in the same node.
/** 表示扁平化之后的内容，例如，一个在同一node开始和结束的内容 */
export class NodeRange {
  /// Construct a node range. `$from` and `$to` should point into the
  /// same node until at least the given `depth`, since a node range
  /// denotes an adjacent set of nodes in a single parent node.
  /**
   * 构造一个节点范围。`$from`和`$to`应当指向给定`depth`或更小的同一节点，
   * 因为一个`nodeRange`实例表示单个父节点中相邻的一系列节点
   * @param $from 开始位置的解析对象
   * @param $to 结束位置的解析对象
   * @param depth 当前位置的父节点的层级
   */
  constructor(
    /// A resolved position along the start of the content. May have a
    /// `depth` greater than this object's `depth` property, since
    /// these are the positions that were used to compute the range,
    /// not re-resolved positions directly at its boundaries.
    /** 内容起点被解析过的位置。也许有一个`depth`比当前对象的`depth`属性更大，
     * 因为这些位置是用来计算这个区域的而不是nodeRange边界处的被直接解析的位置
     */
    readonly $from: ResolvedPos,
    /// A position along the end of the content. See
    /// caveat for [`$from`](#model.NodeRange.$from).
    /** 内容重点被解析过的位置。与`$from`一致 */
    readonly $to: ResolvedPos,
    /// The depth of the node that this range points into.
    /** 当前nodeRange指向的节点的层级 */
    readonly depth: number
  ) {}

  /** start       开始时的位置(对应nodeSize，这个位置可以用于索引文档的任何地方) */
  /** startIndex  开始时的索引(对应nthChild，这个索引只有在其父元素内索引子元素有效)*/
  /// The position at the start of the range.
  /** 当前nodeRange的开始位置 */
  get start() { return this.$from.before(this.depth + 1) }
  /// The position at the end of the range.
  /** 当前nodeRange的结束位置 */
  get end() { return this.$to.after(this.depth + 1) }

  /// The parent node that the range points into.
  /** 当前nodeRange指向的父节点 */
  get parent() { return this.$from.node(this.depth) }
  /// The start index of the range in the parent node.
  /** 当前nodeRange指向父节点的开始索引 */
  get startIndex() { return this.$from.index(this.depth) }
  /// The end index of the range in the parent node.
  /** 当前nodeRange指向的父节点的结束索引 */
  get endIndex() { return this.$to.indexAfter(this.depth) }
}
