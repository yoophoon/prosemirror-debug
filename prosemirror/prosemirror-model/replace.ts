import {Fragment} from "./fragment"
import {Schema} from "./schema"
import {Node, TextNode} from "./node"
import {ResolvedPos} from "./resolvedpos"

/// Error type raised by [`Node.replace`](#model.Node.replace) when
/// given an invalid replacement.
/// 当node.replace被传入一个无效替换时引发的错误类型
export class ReplaceError extends Error {}
/*
// 兼容写法
ReplaceError = function(this: any, message: string) {
  let err = Error.call(this, message)
  ;(err as any).__proto__ = ReplaceError.prototype
  return err
} as any

ReplaceError.prototype = Object.create(Error.prototype)
ReplaceError.prototype.constructor = ReplaceError
ReplaceError.prototype.name = "ReplaceError"
*/

/// A slice represents a piece cut out of a larger document. It
/// stores not only a fragment, but also the depth up to which nodes on
/// both side are ‘open’ (cut through).
/// 一个切片表示从一个更大的文档中切出一片。它存储着fragment、以及两边被切开的节点的深度
export class Slice {
  /// Create a slice. When specifying a non-zero open depth, you must
  /// make sure that there are nodes of at least that depth at the
  /// appropriate side of the fragment—i.e. if the fragment is an
  /// empty paragraph node, `openStart` and `openEnd` can't be greater
  /// than 1.
  ///
  /// It is not necessary for the content of open nodes to conform to
  /// the schema's content constraints, though it should be a valid
  /// start/end/middle for such a node, depending on which sides are
  /// open.
  /**
   * 创建一个内容切片。当指定一个非0的开放深度时则必须确保文档在这一侧的深度必须存在节点。
   * 比如，一个空内容的slice，`openStart`和`openEnd`不能比1大  
   * (因为1的层级就是这个paragraph的内容层级，当时它已经没有内容了)  
   * 内容的开放节点以适应架构的内容限制并不是必须的，尽管这样的节点应该有一个有效的start\end\middle
   * 这取决于节点的哪一侧是开放的
   * @param content 切片的内容
   * @param openStart 开放起点长度
   * @param openEnd 开放终点长度
   */
  constructor(
    /// The slice's content.
    readonly content: Fragment,
    /// The open depth at the start of the fragment.
    readonly openStart: number,
    /// The open depth at the end.
    readonly openEnd: number
  ) {}

  /// The size this slice would add when inserted into a document.
  /** 切片的尺寸，当被插入到文档中时，文档会增加的尺寸 */
  get size(): number {
    return this.content.size - this.openStart - this.openEnd
  }

  /// @internal
  /**
   * 在当前切片的指定位置插入一个fragment
   * @param pos 当前切片被插入的位置 这个位置不包含开放深度
   * @param fragment 被插入的fragment
   * @returns 如果被插入文档之后的内容仍然有效则根据该内容重新创建一个切片
   */
  insertAt(pos: number, fragment: Fragment) {
    let content = insertInto(this.content, pos + this.openStart, fragment)
    return content && new Slice(content, this.openStart, this.openEnd)
  }

  /// @internal
  /**
   * @param from 文档的开始位置
   * @param to 文档的结束位置
   * @returns 移除切片中`from`到`to`之间的内容之后生成的新的切片
   */
  removeBetween(from: number, to: number) {
    return new Slice(removeRange(this.content, from + this.openStart, to + this.openStart), this.openStart, this.openEnd)
  }

  /// Tests whether this slice is equal to another slice.
  /**
   * 测试当前切片是否与传入的切片相同
   * @param other 另一个切片
   * @returns 如果两个切片相同则返回true否则返回false
   */
  eq(other: Slice): boolean {
    return this.content.eq(other.content) && this.openStart == other.openStart && this.openEnd == other.openEnd
  }

  /// @internal
  /** 将当前切片转换为字符串 */
  toString() {
    return this.content + "(" + this.openStart + "," + this.openEnd + ")"
  }

  /// Convert a slice to a JSON-serializable representation.
  /** 将当前切片转换为一个JSON对象 */
  toJSON(): any {
    if (!this.content.size) return null
    let json: any = {content: this.content.toJSON()}
    if (this.openStart > 0) json.openStart = this.openStart
    if (this.openEnd > 0) json.openEnd = this.openEnd
    return json
  }

  /// Deserialize a slice from its JSON representation.
  /**
   * 从一个JSON对象中反序列化生成一个切片
   * @param schema 文档架构
   * @param json JSON对象
   * @returns 根据传入的文档架构和JSON对象生成一个文档切片
   */
  static fromJSON(schema: Schema, json: any): Slice {
    if (!json) return Slice.empty
    let openStart = json.openStart || 0, openEnd = json.openEnd || 0
    if (typeof openStart != "number" || typeof openEnd != "number")
      throw new RangeError("Invalid input for Slice.fromJSON")
    return new Slice(Fragment.fromJSON(schema, json.content), openStart, openEnd)
  }

  /// Create a slice from a fragment by taking the maximum possible
  /// open value on both side of the fragment.
  /**
   * 创建一个文档内容能最大可能接受的开放深度的切片
   * @param fragment 文档Fragment
   * @param openIsolating 开放隔离单元 如果开放隔离单元，开放边界将会进入隔离单
   * @returns slice
   */
  static maxOpen(fragment: Fragment, openIsolating = true) {
    let openStart = 0, openEnd = 0
    for (let n = fragment.firstChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.firstChild) openStart++
    for (let n = fragment.lastChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.lastChild) openEnd++
    return new Slice(fragment, openStart, openEnd)
  }

  /// The empty slice.
  /** 创建一个空切片 */
  static empty = new Slice(Fragment.empty, 0, 0)
}
/**
 * 
 * @param content fragment
 * @param from 开始位置
 * @param to 结束位置
 * @returns fragment
 */
function removeRange(content: Fragment, from: number, to: number): Fragment {
  // child为from所在位置的子元素
  let {index, offset} = content.findIndex(from), child = content.maybeChild(index)
  let {index: indexTo, offset: offsetTo} = content.findIndex(to)
  // 如果开始位置的偏移值等于开始位置 或者开始位置是一个文本节点
  // 即开始位置处于节点连接处或者处于文本节点内
  if (offset == from || child!.isText) {
    // 如果结束位置的偏移值不为传入的结束位置并且结束位置也不是文本节点 抛出错误
    // 移除会导致开放节点
    // 结束位置处于节点内但该节点不是文本节点
    if (offsetTo != to && !content.child(indexTo).isText) throw new RangeError("Removing non-flat range")
    return content.cut(0, from).append(content.cut(to))
  }
  // 开始索引不等于结束索引(这两个位置不在同一个子节点内)
  if (index != indexTo) throw new RangeError("Removing non-flat range")
  // index==indexTo
  // 将指定索引位置的节点用移除其对应内容之后的节点替换并返回content
  // -offset-1 缩小位置范围并消除子节点两端token的影响
  return content.replaceChild(index, child!.copy(removeRange(child!.content, from - offset - 1, to - offset - 1)))
}
/**
 * @param content 当前文档
 * @param dist 当前文档被插入的位置
 * @param insert 被插入的文档
 * @param parent 父节点 如果指定了父节点但父节点在被插入的地方不接受被插入的内容则直接返回null
 * @returns 内容被插入当前fragment之后的fragment
 */
function insertInto(content: Fragment, dist: number, insert: Fragment, parent?: Node): Fragment | null {
  let {index, offset} = content.findIndex(dist), child = content.maybeChild(index)
  // 如果插入点刚好在节点的after位置或者插入点是个文本节点
  if (offset == dist || child!.isText) {
    // 如果父节点存在但不允许插入该内容
    if (parent && !parent.canReplace(index, index, insert)) return null
    return content.cut(0, dist).append(insert).append(content.cut(dist))
  }
  // 插入点在子节点内部
  let inner = insertInto(child!.content, dist - offset - 1, insert)
  return inner && content.replaceChild(index, child!.copy(inner))
}
/**
 * 
 * @param $from 开始位置的解析对象
 * @param $to 结束位置的解析对象
 * @param slice 内容切片
 * @returns 
 */
export function replace($from: ResolvedPos, $to: ResolvedPos, slice: Slice) {
  // 如果切片的开放深度比插入点的开放深度深 这必然导致slice的一侧是没有openToken所以报错
  if (slice.openStart > $from.depth)
    throw new ReplaceError("Inserted content deeper than insertion position")
  // 如果两头的深度差不一致导致有剩余的openStart或者openEnd所以报错
  if ($from.depth - slice.openStart != $to.depth - slice.openEnd)
    throw new ReplaceError("Inconsistent open depths")
  return replaceOuter($from, $to, slice, 0)
}
/**
 * 尝试在指定层级的指定开始位置和指定结束位置用指定的slice替换其内容
 * @param $from 开始位置的解析对象
 * @param $to 结束位置的解析对象
 * @param slice 用于替换的内容切片
 * @param depth 用于处理本次替换的层级
 * @returns 被替换过的节点
 */
function replaceOuter($from: ResolvedPos, $to: ResolvedPos, slice: Slice, depth: number): Node {
  // 指定层级开始位置所在子元素索引    指定层级开始位置的元素
  let index = $from.index(depth), node = $from.node(depth)
  // 如果开始和结束位置在同一个元素且开始位置的层级与切片的开口深度之差大于指定替换层级
  if (index == $to.index(depth) && depth < $from.depth - slice.openStart) {
    // 深入一层处理本次替换
    let inner = replaceOuter($from, $to, slice, depth + 1)
    return node.copy(node.content.replaceChild(index, inner))
  } else if (!slice.content.size) {
    // 如果切片的内容长度为0，则直接删除开始位置到结束位置的内容
    return close(node, replaceTwoWay($from, $to, depth))
  // 如果切片的起始开放深度为0且终止开放深度为0且开始位置的深度、结束位置的深度及指定的深度一样
  } else if (!slice.openStart && !slice.openEnd && $from.depth == depth && $to.depth == depth) { // Simple, flat case
    // parent开始位置的父节点 content开始位置的父节点的内容
    let parent = $from.parent, content = parent.content
    return close(parent, content.cut(0, $from.parentOffset).append(slice.content).append(content.cut($to.parentOffset)))
  } else {
    // 确保start、end已经和$from同层  $from.depth>slice.openStart已经被`replace`函数过滤了
    let {start, end} = prepareSliceForReplace(slice, $from)
    return close(node, replaceThreeWay($from, start, end, $to, depth))
  }
}
/**
 * 检查是否能将两种节点组合起来
 * @param main 主要节点
 * @param sub 子节点
 */
function checkJoin(main: Node, sub: Node) {
  if (!sub.type.compatibleContent(main.type))
    throw new ReplaceError("Cannot join " + sub.type.name + " onto " + main.type.name)
}
/**
 * 获取能够组合指定两处位置的指定层级的节点
 * @param $before 前一个位置的解析对象
 * @param $after 后一个位置的解析对象
 * @param depth 指定层级
 * @returns 如果两处位置指定层级的节点能组合则返回该指定层级的节点否则抛出错误(由checkJoin抛出的)
 */
function joinable($before: ResolvedPos, $after: ResolvedPos, depth: number) {
  let node = $before.node(depth)
  checkJoin(node, $after.node(depth))
  return node
}
/**
 * 如果被添加的节点是文本节点且与目标节点最后一个子节点有同样的属性则直接将其并入目标节点最后一个子元素
 * 否则将被添加节点作为最后一个子元素添加到目标节点中
 * @param child 被添加的节点
 * @param target 目标节点数组
 */
function addNode(child: Node, target: Node[]) {
  let last = target.length - 1
  if (last >= 0 && child.isText && child.sameMarkup(target[last]))
    target[last] = (child as TextNode).withText(target[last].text! + child.text!)
  else
    target.push(child)
}
/**
 * 将开始到结束位置之间的指定层级的内容添加到target节点数组中，如果开始位置和结束位置在文本节点中间
 * 这部分文本内容也会被添加到target节点数组中  
 * 如果$start.depth>depth则会导致$start的父元素内容被跳过，这和这个函数被调用的方式有关
 * @param $start 开始位置的解析对象
 * @param $end 结束位置的解析对象
 * @param depth 层级
 * @param target 目标节点数组
 */
function addRange($start: ResolvedPos | null, $end: ResolvedPos | null, depth: number, target: Node[]) {
  // 开始或结束位置的父元素
  let node = ($end || $start)!.node(depth)
  // 开始索引 结束索引如果$end存在则为其所在元素所处层级的索引否则为所有子元素的数量
  let startIndex = 0, endIndex = $end ? $end.index(depth) : node.childCount
  // 如果指定了开始位置
  if ($start) {

    startIndex = $start.index(depth)
    if ($start.depth > depth) {
      startIndex++
    } else if ($start.textOffset) {
      // 如果开始位置在文本节点中，则将开始位置之后的文本加入到目标节点组中
      addNode($start.nodeAfter!, target)
      startIndex++
    }
  }
  // 将开始到结束位置的节点添加到目标节点组中
  for (let i = startIndex; i < endIndex; i++) addNode(node.child(i), target)
  if ($end && $end.depth == depth && $end.textOffset)
    // 如果结束位置在文本节点中，则将结束位置之前的文本加入到目标节点组中
    addNode($end.nodeBefore!, target)
}
/**
 * 用指定的节点将指定的内容包裹起来
 * @param node 节点
 * @param content 内容
 * @returns 尝试给指定的内容创建一个与指定节点属性一致的新节点
 */
function close(node: Node, content: Fragment) {
  node.type.checkContent(content)
  return node.copy(content)
}
/**
 * `$from`和`$to`是相对于当前slice  
 * `$start`和`$end`是相对于用于替换的slice，经过`prepareForReplace`函数这两个位置的路径已经和`$from`一致了
 * @param $from 开始替换的位置
 * @param $start 用于替换的开始位置
 * @param $end 用于替换的结束位置
 * @param $to 结束替换的位置
 * @param depth 层级
 * @returns fragment
 */
function replaceThreeWay($from: ResolvedPos, $start: ResolvedPos, $end: ResolvedPos, $to: ResolvedPos, depth: number) {
  // from的层级比指定的depth深且from及start这两个位置在depth下层能联合
  // 返回$from在depth+1层级的父元素
  let openStart = $from.depth > depth && joinable($from, $start, depth + 1)
  // to的层级比指定的depth深且to及end这两个位置在depth下层能联合
  // 返回$to在depth+1层级的父元素
  let openEnd = $to.depth > depth && joinable($end, $to, depth + 1)

  let content: Node[] = []
  addRange(null, $from, depth, content)
  if (openStart && openEnd && $start.index(depth) == $end.index(depth)) {
    checkJoin(openStart, openEnd)
    addNode(close(openStart, replaceThreeWay($from, $start, $end, $to, depth + 1)), content)
  } else {
    if (openStart)
      addNode(close(openStart, replaceTwoWay($from, $start, depth + 1)), content)
    addRange($start, $end, depth, content)
    if (openEnd)
      addNode(close(openEnd, replaceTwoWay($end, $to, depth + 1)), content)
  }
  addRange($to, null, depth, content)
  return new Fragment(content)
}
/**
 * 抛弃from到to之间的内容，其余内容作为fragment的内容返回
 * @param $from 开始位置的解析对象
 * @param $to 结束位置的解析对象
 * @param depth 层级
 * @returns 
 */
function replaceTwoWay($from: ResolvedPos, $to: ResolvedPos, depth: number) {
  let content: Node[] = []
  // 将from之前的节点添加到content
  addRange(null, $from, depth, content)
  // 如果开始位置的层级比指定的层级深
  if ($from.depth > depth) {
    // 检查开始位置到结束位置是否能联合并放回from位置在depth+1层级的父节点
    let type = joinable($from, $to, depth + 1)
    // 在depth下一层将from到to之间的内容去掉并将内容添加到content中
    addNode(close(type, replaceTwoWay($from, $to, depth + 1)), content)
  }
  // 将to之后的内容加入到content中
  addRange($to, null, depth, content)
  // 返回关于content的新fragment
  return new Fragment(content)
}
/**
 * 准备用于替换的切片，如果目标位置比slice的开放起始位置深则会根据两者的层级差创建对应的路径
 * 以确保两者路径一致
 * @param slice 用于替换的内容切片
 * @param $along 指定的解析位置对象
 * @returns 关于指定切片的开始位置解析对象和结束位置解析对象
 */
function prepareSliceForReplace(slice: Slice, $along: ResolvedPos) {
  // extra：指定位置的层级与指定切片的层级差  parent：指定位置与slice同一层级的父元素
  let extra = $along.depth - slice.openStart, parent = $along.node(extra)
  // 根据父元素及指定的slice创建同类型的节点
  let node = parent.copy(slice.content)
  for (let i = extra - 1; i >= 0; i--)
    // 从silice上层到最顶层 给切片创建一样的路径节点
    node = $along.node(i).copy(Fragment.from(node))
  // 返回该slice的开始位置解析对象和结束位置的解析对象
  return {start: node.resolveNoCache(slice.openStart + extra),
          end: node.resolveNoCache(node.content.size - slice.openEnd - extra)}
}
