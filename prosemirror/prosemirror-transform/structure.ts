import {Slice, Fragment, NodeRange, NodeType, Node, Mark, Attrs, ContentMatch} from "prosemirror-model"

import {Transform} from "./transform"
import {ReplaceStep, ReplaceAroundStep} from "./replace_step"
import {clearIncompatible} from "./mark"
/**
 * 测试指定节点在指定的start和end位置能否被切割
 * @param node 将要被切割的节点
 * @param start 开始切割的位置
 * @param end 结束切割的位置
 * @returns 如果能切割则返回true否则返回false
 */
function canCut(node: Node, start: number, end: number) {
  return (start == 0 || node.canReplace(start, node.childCount)) &&
    (end == node.childCount || node.canReplace(0, end))
}

/// Try to find a target depth to which the content in the given range
/// can be lifted. Will not go across
/// [isolating](#model.NodeSpec.isolating) parent nodes.
/**
 * 尝试找到一个目标层级能接受指定范围的内容能提升到该层级作为其子节点。不会跨越`isolation`父节点
 * @param range 要被提升的范围
 * @returns 返回第一次能接受指定范围内容的层级(如果更高层级能接受也不会向上提升了)或者null
 * 如果向上查找到根节点或者到一个isolation节点或者节点不能被切割
 */
export function liftTarget(range: NodeRange): number | null {
  let parent = range.parent
  let content = parent.content.cutByIndex(range.startIndex, range.endIndex)
  for (let depth = range.depth;; --depth) {
    let node = range.$from.node(depth)
    let index = range.$from.index(depth), endIndex = range.$to.indexAfter(depth)
    if (depth < range.depth && node.canReplace(index, endIndex, content))
      return depth
    if (depth == 0 || node.type.spec.isolating || !canCut(node, index, endIndex)) break
  }
  return null
}
/**
 * 将指定范围的内容提升到指定的层级，range指定的内容会被直接作为指定层级的节点的内容，
 * 方法与replaceAroundStep完美联动
 * @param tr 应用这次操作的transaction
 * @param range 要被提升的范围
 * @param target 要被提升的指定层级
 */
export function lift(tr: Transform, range: NodeRange, target: number) {
  let {$from, $to, depth} = range
  // gapStart:开始范围在指定层级的下一级节点的before gapEnd:结束范围在指定层级的下一级节点的after
  let gapStart = $from.before(depth + 1), gapEnd = $to.after(depth + 1)
  let start = gapStart, end = gapEnd

  let before = Fragment.empty, openStart = 0
  for (let d = depth, splitting = false; d > target; d--){
    // 如果需要拆分或者内容在指定的层级的节点不是第一个 如果是第一个子节点则抛弃这个节点
    // (内容要向上提升，这个包裹节点已经没用了)
    if (splitting || $from.index(d) > 0) {
      splitting = true
      before = Fragment.from($from.node(d).copy(before))
      // 开放深度+1 因为套了一层父节点
      openStart++
    // 替换范围开始位置-1(要抛弃包裹提升范围的父节点)
    } else {
      start--
    }
  }
  let after = Fragment.empty, openEnd = 0
  for (let d = depth, splitting = false; d > target; d--)
    if (splitting || $to.after(d + 1) < $to.end(d)) {
      splitting = true
      after = Fragment.from($to.node(d).copy(after))
      openEnd++
    } else {
      end++
    }
  // gapStart和gapEnd为后续文档要提升的范围，start、end则为要删除的范围，插入的slice用于闭合
  // 这个范围的前后内容，提升的内容则插在这个slice中间(只能说牛逼)
  tr.step(new ReplaceAroundStep(start, end, gapStart, gapEnd,
                                new Slice(before.append(after), openStart, openEnd),
                                before.size - openStart, true))
}

/// Try to find a valid way to wrap the content in the given range in a
/// node of the given type. May introduce extra nodes around and inside
/// the wrapper node, if necessary. Returns null if no valid wrapping
/// could be found. When `innerRange` is given, that range's content is
/// used as the content to fit into the wrapping, instead of the
/// content of `range`.
/**
 * 尝试找到一种有效的方式将指定范围的内容用指定的节点类型包裹。指定节点可能产生额外的上级或下级元素
 * 如果没找到有效的包裹路径则返回null。当指定`innerRange`时则会采用该范围作为被包裹的内容而不是
 * 指定的range
 * @param range 将被包裹的指定范围
 * @param nodeType 包裹指定范围的节点类型
 * @param attrs 指定节点类型的属性
 * @param innerRange 被包裹范围的内容范围
 * @returns 返回满足指定节点类型及属性的包裹路径 如果包裹失败则返回null
 */
export function findWrapping(
  range: NodeRange,
  nodeType: NodeType,
  attrs: Attrs | null = null,
  innerRange = range
): {type: NodeType, attrs: Attrs | null}[] | null {
  let around = findWrappingOutside(range, nodeType)
  let inner = around && findWrappingInside(innerRange, nodeType)
  if (!inner) return null
  return (around!.map(withAttrs) as {type: NodeType, attrs: Attrs | null}[])
    .concat({type: nodeType, attrs}).concat(inner.map(withAttrs))
}
/** 工具函数，根据节点类型生成`{type, attrs: null}`对象 */
function withAttrs(type: NodeType) { return {type, attrs: null} }
/**
 * 查找指定range的父元素是否可以包裹指定节点类型
 * @param range 指定节点范围
 * @param type 指定节点类型
 * @returns 如果指定的range的父元素能包裹指定类型节点则返回包裹路径否则返回null
 */
function findWrappingOutside(range: NodeRange, type: NodeType) {
  let {parent, startIndex, endIndex} = range
  let around = parent.contentMatchAt(startIndex).findWrapping(type)
  if (!around) return null
  let outer = around.length ? around[0] : type
  return parent.canReplaceWith(startIndex, endIndex, outer) ? around : null
}
/**
 * 查找指定节点类型是否可以包裹指定range的父元素的子元素(及range所在位置的子元素)
 * @param range 指定range
 * @param type 指定节点类型
 * @returns 如果指定节点类型能包裹指定range父元素的子元素则返回包裹路径否则返回null
 */
function findWrappingInside(range: NodeRange, type: NodeType) {
  let {parent, startIndex, endIndex} = range
  let inner = parent.child(startIndex)
  let inside = type.contentMatch.findWrapping(inner.type)
  if (!inside) return null
  let lastType = inside.length ? inside[inside.length - 1] : type
  let innerMatch: ContentMatch | null = lastType.contentMatch
  for (let i = startIndex; innerMatch && i < endIndex; i++)
    innerMatch = innerMatch.matchType(parent.child(i).type)
  if (!innerMatch || !innerMatch.validEnd) return null
  return inside
}
/**
 * 方法只检查指定的包裹层级是否为有效嵌套不会检查包裹的内容是否能应用于包裹及包裹是否能应用于指定范围的父节点  
 * 包裹的方式为数组开始的一端为外层包裹结束一段为内层包裹  
 * @param tr transaction
 * @param range 被包裹的范围
 * @param wrappers 包裹
 */
export function wrap(tr: Transform, range: NodeRange, wrappers: readonly {type: NodeType, attrs?: Attrs | null}[]) {
  let content = Fragment.empty
  for (let i = wrappers.length - 1; i >= 0; i--) {
    if (content.size) {
      let match = wrappers[i].type.contentMatch.matchFragment(content)
      if (!match || !match.validEnd)
        throw new RangeError("Wrapper type given to Transform.wrap does not form valid content of its parent wrapper")
    }
    content = Fragment.from(wrappers[i].type.create(wrappers[i].attrs, content))
  }

  let start = range.start, end = range.end
  tr.step(new ReplaceAroundStep(start, end, start, end, new Slice(content, 0, 0), wrappers.length, true))
}
/**
 * 函数与`lift`有点类似，将指定范围的内容用指定的节点类型及属性进行包裹，包裹过程中会清除不兼容的marks和节点类型  
 * 内容的换行符会根据schema.linebreakReplacement和nodeSpec.whitespace进行相应的转换  
 * 节点类型只接受文本块节点类型
 * @param tr 
 * @param from 开始位置
 * @param to 结束位置
 * @param type 节点类型
 * @param attrs 节点属性
 */
export function setBlockType(tr: Transform, from: number, to: number,
                             type: NodeType, attrs: Attrs | null | ((oldNode: Node) => Attrs)) {
  if (!type.isTextblock) throw new RangeError("Type given to setBlockType should be a textblock")
  let mapFrom = tr.steps.length
  tr.doc.nodesBetween(from, to, (node, pos) => {
    let attrsHere = typeof attrs == "function" ? attrs(node) : attrs
    if (node.isTextblock && !node.hasMarkup(type, attrsHere) &&
        canChangeType(tr.doc, tr.mapping.slice(mapFrom).map(pos), type)) {
      let convertNewlines = null
      if (type.schema.linebreakReplacement) {
        let pre = type.whitespace == "pre", supportLinebreak = !!type.contentMatch.matchType(type.schema.linebreakReplacement)
        if (pre && !supportLinebreak) convertNewlines = false
        else if (!pre && supportLinebreak) convertNewlines = true
      }
      // Ensure all markup that isn't allowed in the new node type is cleared
      if (convertNewlines === false) replaceLinebreaks(tr, node, pos, mapFrom)
      clearIncompatible(tr, tr.mapping.slice(mapFrom).map(pos, 1), type, undefined, convertNewlines === null)
      let mapping = tr.mapping.slice(mapFrom)
      let startM = mapping.map(pos, 1), endM = mapping.map(pos + node.nodeSize, 1)
      tr.step(new ReplaceAroundStep(startM, endM, startM + 1, endM - 1,
                                    new Slice(Fragment.from(type.create(attrsHere, null, node.marks)), 0, 0), 1, true))
      if (convertNewlines === true) replaceNewlines(tr, node, pos, mapFrom)
      return false
    }
  })
}
/**
 * 将指定节点的文本子节点中的换行符替换成换行节点
 * @param tr transaction
 * @param node 指定的节点
 * @param pos 指定的位置
 * @param mapFrom 需要映射的索引
 */
function replaceNewlines(tr: Transform, node: Node, pos: number, mapFrom: number) {
  node.forEach((child, offset) => {
    if (child.isText) {
      let m, newline = /\r?\n|\r/g
      while (m = newline.exec(child.text!)) {
        let start = tr.mapping.slice(mapFrom).map(pos + 1 + offset + m.index)
        tr.replaceWith(start, start + 1, node.type.schema.linebreakReplacement!.create())
      }
    }
  })
}
/**
 * 将指定节点的换行节点(子节点)替换成"\n"文本
 * @param tr 应用替换操作的transaction
 * @param node 包含被替换换行节点的父节点
 * @param pos 指定父节点的before位置，用于计算节点在文档中的对应位置
 * @param mapFrom 开始映射的索引
 */
function replaceLinebreaks(tr: Transform, node: Node, pos: number, mapFrom: number) {
  node.forEach((child, offset) => {
    if (child.type == child.type.schema.linebreakReplacement) {
      let start = tr.mapping.slice(mapFrom).map(pos + 1 + offset)
      tr.replaceWith(start, start + 1, node.type.schema.text("\n"))
    }
  })
}
/**
 * 测试是否能用指定节点类型替换指定位置的节点
 * @param doc 文档节点
 * @param pos 指定位置
 * @param type 指定节点类型
 * @returns 如果能用指定节点类型替换指定位置的节点则返回true否则返回false
 */
function canChangeType(doc: Node, pos: number, type: NodeType) {
  let $pos = doc.resolve(pos), index = $pos.index()
  return $pos.parent.canReplaceWith(index, index + 1, type)
}

/// Change the type, attributes, and/or marks of the node at `pos`.
/// When `type` isn't given, the existing node type is preserved,
/**
 * 该变指定位置的节点的类型及属性。如果节点类型没有指定则指定位置的节点类型会被保留但属性和marks会被更新为指定的
 * @param tr 
 * @param pos 指定位置
 * @param type 指定节点类型
 * @param attrs 指定节点属性
 * @param marks 指定marks
 * @returns 
 */
export function setNodeMarkup(tr: Transform, pos: number, type: NodeType | undefined | null,
                              attrs: Attrs | null, marks: readonly Mark[] | undefined) {
  let node = tr.doc.nodeAt(pos)
  if (!node) throw new RangeError("No node at given position")
  if (!type) type = node.type
  let newNode = type.create(attrs, null, marks || node.marks)
  if (node.isLeaf)
    return tr.replaceWith(pos, pos + node.nodeSize, newNode)

  if (!type.validContent(node.content))
    throw new RangeError("Invalid content for node type " + type.name)

  tr.step(new ReplaceAroundStep(pos, pos + node.nodeSize, pos + 1, pos + node.nodeSize - 1,
                                new Slice(Fragment.from(newNode), 0, 0), 1, true))
}

/// Check whether splitting at the given position is allowed.
/**
 * 检查是否能在指定位置进行分割  
 * 感觉和split不同 canSplit好像是分离而split是分隔  
 * 前者会把分出来的内容挂载到指定层级的上层父节点而后者则是将一个节点一分为二(分离出来的内容节点父元素节点类型不变)
 * @param doc 指定文档节点
 * @param pos 指定位置
 * @param depth 指定向上分隔层级 默认为1
 * @param typesAfter 分隔出来的内容的节点路径，如果没有指定则将分隔出来的内容作为上层父元素的内容
 * @returns 
 */
export function canSplit(doc: Node, pos: number, depth = 1,
                         typesAfter?: (null | {type: NodeType, attrs?: Attrs | null})[]): boolean {
  let $pos = doc.resolve(pos), base = $pos.depth - depth
  let innerType = (typesAfter && typesAfter[typesAfter.length - 1]) || $pos.parent
  // 如果分割点的根超出根节点或者分割点的父元素节点类型为isolation或者分割点所在层级不接受分隔或者指定路径不接受分隔出来的内容
  // 返回false(不能分隔)
  if (base < 0 || $pos.parent.type.spec.isolating ||
      !$pos.parent.canReplace($pos.index(), $pos.parent.childCount) ||
      !innerType.type.validContent($pos.parent.content.cutByIndex($pos.index(), $pos.parent.childCount)))
    return false
  // 向上分隔 会尝试将分隔出来的内容直接挂载到其上一层的父节点上
  for (let d = $pos.depth - 1, i = depth - 2; d > base; d--, i--) {
    let node = $pos.node(d), index = $pos.index(d)
    // 指定层级父元素不接受分隔
    if (node.type.spec.isolating) return false
    let rest = node.content.cutByIndex(index, node.childCount)
    let overrideChild = typesAfter && typesAfter[i + 1]
    // 如果指定了接收分隔内容的路径节点
    if (overrideChild)
      // 使用路径节点接收边缘节点即被分割出来的内容节点
      rest = rest.replaceChild(0, overrideChild.type.create(overrideChild.attrs))
    let after = (typesAfter && typesAfter[i]) || node
    // 检查指定层级的父节点在指定索引之后的节点是否可被替换(被分割出去了)或者节点路径是否接收分隔出来的内容
    if (!node.canReplace(index + 1, node.childCount) || !after.type.validContent(rest))
      return false
  }
  let index = $pos.indexAfter(base)
  let baseType = typesAfter && typesAfter[0]
  return $pos.node(base).canReplaceWith(index, index, baseType ? baseType.type : $pos.node(base + 1).type)
}
/**
 * 在指定位置沿着上层进行分隔，分隔点后续的内容会采用指定的typesAfter路径，如果未指定则采用原来的路径  
 * 操作通过replaceStep实现
 * @param tr 应用本次分离的transaction
 * @param pos 分离的位置
 * @param depth 需要分离的层级
 * @param typesAfter 用于分离出来的内容的节点路径
 */
export function split(tr: Transform, pos: number, depth = 1, typesAfter?: (null | {type: NodeType, attrs?: Attrs | null})[]) {
  let $pos = tr.doc.resolve(pos), before = Fragment.empty, after = Fragment.empty
  // d:指定位置所在层级 e:指定位置上方层级 i:指定depth-1(指定位置层级到目标层级所需步数)
  for (let d = $pos.depth, e = $pos.depth - depth, i = depth - 1; d > e; d--, i--) {
    before = Fragment.from($pos.node(d).copy(before))
    let typeAfter = typesAfter && typesAfter[i]
    after = Fragment.from(typeAfter ? typeAfter.type.create(typeAfter.attrs, after) : $pos.node(d).copy(after))
  }
  tr.step(new ReplaceStep(pos, pos, new Slice(before.append(after), depth, depth), true))
}

/// Test whether the blocks before and after a given position can be
/// joined.
/**
 * 测试指定位置的前后块是否能合并
 * @param doc 文档节点
 * @param pos 指定位置
 * @returns 
 */
export function canJoin(doc: Node, pos: number): boolean {
  let $pos = doc.resolve(pos), index = $pos.index()
  return joinable($pos.nodeBefore, $pos.nodeAfter) &&
    $pos.parent.canReplace(index, index + 1)
}
/** 是否能将替换过的换行符的b节点追加到a节点(会把b节点的换行节点替换成文本节点类型) */
function canAppendWithSubstitutedLinebreaks(a: Node, b: Node) {
  // 应该是要返回的
  if (!b.content.size) return a.type.compatibleContent(b.type)
  let match: ContentMatch | null = a.contentMatchAt(a.childCount)
  let {linebreakReplacement} = a.type.schema
  for (let i = 0; i < b.childCount; i++) {
    let child = b.child(i)
    let type = child.type == linebreakReplacement ? a.type.schema.nodes.text : child.type
    match = match.matchType(type)
    if (!match) return false
    if (!a.type.allowsMarks(child.marks)) return false
  }
  return match.validEnd
}
/** 指定的两个节点是否能合并 */
function joinable(a: Node | null, b: Node | null) {
  return !!(a && b && !a.isLeaf && canAppendWithSubstitutedLinebreaks(a, b))
}

/// Find an ancestor of the given position that can be joined to the
/// block before (or after if `dir` is positive). Returns the joinable
/// point, if any.
/**
 * 找到指定位置可以合并之前块内容(或之后如果`dir`是正数)的上层元素。如果存在则返回可以合并的位置
 * @param doc 文档节点
 * @param pos 指定位置
 * @param dir 查找方向
 * @returns 
 */
export function joinPoint(doc: Node, pos: number, dir = -1) {
  let $pos = doc.resolve(pos)
  for (let d = $pos.depth;; d--) {
    let before, after, index = $pos.index(d)
    if (d == $pos.depth) {
      before = $pos.nodeBefore
      after = $pos.nodeAfter
    // 向文档后方查找
    } else if (dir > 0) {
      before = $pos.node(d + 1)
      index++
      // 后面节点接收前面节点的内容
      after = $pos.node(d).maybeChild(index)
    // 向文档前方查找
    } else {
      // 前面节点接收后面节点的内容
      before = $pos.node(d).maybeChild(index - 1)
      after = $pos.node(d + 1)
    }
    // before存在且非文本节点且能与after合并且当前层级索引指向的两个节点能合并 则返回指定pos
    if (before && !before.isTextblock && joinable(before, after) &&
        $pos.node(d).canReplace(index, index + 1)) return pos
    // 查找到根节点了则退出
    if (d == 0) break
    // 更新pos 向前查找则返回before向后查找则返回after
    pos = dir < 0 ? $pos.before(d) : $pos.after(d)
  }
}
/**
 * 将指定位置在指定层级的前后节点联合起来，后方被联合的内容会受到前方父节点类型的影响如marks和nodeType
 * @param tr 应用本次联合的transaction
 * @param pos 进行联合操作的位置
 * @param depth 联合的层级
 * @returns 
 */
export function join(tr: Transform, pos: number, depth: number) {
  let convertNewlines = null
  let {linebreakReplacement} = tr.doc.type.schema
  let $before = tr.doc.resolve(pos - depth), beforeType = $before.node().type
  // 如果定义了换行节点且前一个节点是内联内容节点
  if (linebreakReplacement && beforeType.inlineContent) {
    // 是否保留whitespace
    let pre = beforeType.whitespace == "pre"
    // 前一个节点是否支持换行节点
    let supportLinebreak = !!beforeType.contentMatch.matchType(linebreakReplacement)
    // 保留whitespace但不支持换行节点 则不转换新行
    if (pre && !supportLinebreak) convertNewlines = false
    // 不保留whitespace但支持换行节点 则转换新行
    else if (!pre && supportLinebreak) convertNewlines = true
  }
  let mapFrom = tr.steps.length
  // 处理转换新行
  if (convertNewlines === false) {
    let $after = tr.doc.resolve(pos + depth)
    // 将指定位置后的节点的换行子节点全部替换为"\n"
    replaceLinebreaks(tr, $after.node(), $after.before(), mapFrom)
  }
  // 如果前一个节点是内联内容节点
  if (beforeType.inlineContent)
    clearIncompatible(tr, pos + depth - 1, beforeType,
                      $before.node().contentMatchAt($before.index()), convertNewlines == null)
  // 获取映射之后的开始位置
  let mapping = tr.mapping.slice(mapFrom), start = mapping.map(pos - depth)
  // 添加一个合并step，如果指定范围内有内容则会在应用replaceStep的时候抛出错误
  tr.step(new ReplaceStep(start, mapping.map(pos + depth, - 1), Slice.empty, true))
  // 如果转换新行则将指定位置在指定层级的节点的文本子节点中的换行符都换成换行节点
  if (convertNewlines === true) {
    let $full = tr.doc.resolve(start)
    replaceNewlines(tr, $full.node(), $full.before(), tr.steps.length)
  }
  return tr
}

/// Try to find a point where a node of the given type can be inserted
/// near `pos`, by searching up the node hierarchy when `pos` itself
/// isn't a valid place but is at the start or end of a node. Return
/// null if no position was found.
/// 尝试找到一个可以在给定位置附近插入给定类型的节点的点，如果传入的pos不在有效的位置
/// 如节点的开头或者结尾那么将会向顶层逐层搜索有效的位置。如果最终没有找到则返回null
export function insertPoint(doc: Node, pos: number, nodeType: NodeType): number | null {
  let $pos = doc.resolve(pos)
  if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), nodeType)) return pos

  if ($pos.parentOffset == 0)
    for (let d = $pos.depth - 1; d >= 0; d--) {
      let index = $pos.index(d)
      if ($pos.node(d).canReplaceWith(index, index, nodeType)) return $pos.before(d + 1)
      if (index > 0) return null
    }
  if ($pos.parentOffset == $pos.parent.content.size)
    for (let d = $pos.depth - 1; d >= 0; d--) {
      let index = $pos.indexAfter(d)
      if ($pos.node(d).canReplaceWith(index, index, nodeType)) return $pos.after(d + 1)
      if (index < $pos.node(d).childCount) return null
    }
  return null
}

/// Finds a position at or around the given position where the given
/// slice can be inserted. Will look at parent nodes' nearest boundary
/// and try there, even if the original position wasn't directly at the
/// start or end of that node. Returns null when no position was found.
/**
 * 找到指定位置周围能插入指定切片的位置。会查找父元素节点的边界并尝试插入指定切片即便指定的位置不是直接指向边界
 * 如果找不到能插入切片的位置则返回null
 * @param doc 指定文档
 * @param pos 指定位置
 * @param slice 指定切片
 * @returns 
 */
export function dropPoint(doc: Node, pos: number, slice: Slice): number | null {
  let $pos = doc.resolve(pos)
  // 切片没有内容
  if (!slice.content.size) return pos
  let content = slice.content
  // 找到切片开始的真正内容(闭合的节点或文本节点内容)
  for (let i = 0; i < slice.openStart; i++) content = content.firstChild!.content
  // 如果切片为闭合fragment则只进行直接插入，因为包裹出来的路径也是文档的层级路径
  // 如果切片为开放fragment则直接插入和包裹插入都尝试
  for (let pass = 1; pass <= (slice.openStart == 0 && slice.size ? 2 : 1); pass++) {
    // 遍历层级
    for (let d = $pos.depth; d >= 0; d--) {
      // 方向如果插入位置靠近start则取-1否则取1
      let bias = d == $pos.depth ? 0 : $pos.pos <= ($pos.start(d + 1) + $pos.end(d + 1)) / 2 ? -1 : 1
      // 插入点的索引刚好是当前层级节点的前后位置  妙
      let insertPos = $pos.index(d) + (bias > 0 ? 1 : 0)
      let parent = $pos.node(d), fits: boolean | null = false
      // 直接插入
      if (pass == 1) {
        fits = parent.canReplace(insertPos, insertPos, content)
      // 包裹插入
      } else {
        let wrapping = parent.contentMatchAt(insertPos).findWrapping(content.firstChild!.type)
        fits = wrapping && parent.canReplaceWith(insertPos, insertPos, wrapping[0])
      }
      if (fits)
        // bias=0只会出现在指定位置所处层级故指定位置即为插入位置
        // bias!=0则出现在指定位置的上层，根据插入位置与当前层级节点的start和end关系选取插入位置 
        return bias == 0 ? $pos.pos : bias < 0 ? $pos.before(d + 1) : $pos.after(d + 1)
    }
  }
  return null
}
