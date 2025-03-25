import {InputRule} from "./inputrules"
import {findWrapping, canJoin} from "prosemirror-transform"
import {NodeType, Node, Attrs} from "prosemirror-model"

/// Build an input rule for automatically wrapping a textblock when a
/// given string is typed. The `regexp` argument is
/// directly passed through to the `InputRule` constructor. You'll
/// probably want the regexp to start with `^`, so that the pattern can
/// only occur at the start of a textblock.
///
/// `nodeType` is the type of node to wrap in. If it needs attributes,
/// you can either pass them directly, or pass a function that will
/// compute them from the regular expression match.
///
/// By default, if there's a node with the same type above the newly
/// wrapped node, the rule will try to [join](#transform.Transform.join) those
/// two nodes. You can pass a join predicate, which takes a regular
/// expression match and the node before the wrapped node, and can
/// return a boolean to indicate whether a join should happen.
/// 构建一个当给定的字符穿被输入时自动包裹文本块的输入规则。
/// 'regexp'参数被直接传递给'InputRule'的构造函数。你可能会设置正则表达式以'^'开头，
/// 这样规则匹配就会发生在文本块的开头
///
/// 'nodeType'是当前需要被包裹进去的节点类型。如果需要属性则可以直接传递进去
/// 或者传递一个会从正则匹配结果中获取属性的函数。
///
/// 如果新包裹的节点上有一个相同类型的节点（这里的above应该指的是新包裹的节点的父节点之类的），
/// 规则默认会尝试将两个节点连接起来。可以传递一个接受正则匹配结果和节点（被包裹节点之前的节点）
/// 'joinPredicate'（连接断言）参数，这个参数将返回一个布尔值以表明一个连接是否发生

export function wrappingInputRule(
  regexp: RegExp,
  nodeType: NodeType,
  getAttrs: Attrs | null | ((matches: RegExpMatchArray) => Attrs | null) = null,
  joinPredicate?: (match: RegExpMatchArray, node: Node) => boolean
) {
  return new InputRule(regexp, (state, match, start, end) => {
    let attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs
    let tr = state.tr.delete(start, end)
    let $start = tr.doc.resolve(start), range = $start.blockRange(), wrapping = range && findWrapping(range, nodeType, attrs)
    if (!wrapping) return null
    tr.wrap(range!, wrapping)
    let before = tr.doc.resolve(start - 1).nodeBefore
    if (before && before.type == nodeType && canJoin(tr.doc, start - 1) &&
        (!joinPredicate || joinPredicate(match, before)))
      tr.join(start - 1)
    return tr
  })
}

/// Build an input rule that changes the type of a textblock when the
/// matched text is typed into it. You'll usually want to start your
/// regexp with `^` to that it is only matched at the start of a
/// textblock. The optional `getAttrs` parameter can be used to compute
/// the new node's attributes, and works the same as in the
/// `wrappingInputRule` function.
/// 构建一个当匹配的文本被输入时改变文本块类型的输入规则。输入规则的正则表达式通常
/// 以'^'开头，这将只会被文本块的开头匹配。可选参数'getAttrs'可以用来计算新node的属性
/// 这与'wrappingInputRule'函数的参数'getAttrs'作用一样
/**
 * 
 * @param regexp 用于检测输入的正则表达式
 * @param nodeType 新node的类型
 * @param getAttrs 用于获取新node的属性
 * @returns 返回一个InputRule实例
 */
export function textblockTypeInputRule(
  regexp: RegExp,
  nodeType: NodeType,
  getAttrs: Attrs | null | ((match: RegExpMatchArray) => Attrs | null) = null
) {
  return new InputRule(regexp, (state, match, start, end) => {
    let $start = state.doc.resolve(start)
    let attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs
    // 确定替换操作是否可行，如果不可行则返回null（handler需要返回一个tr并传递给view.dispatch()函数分发）
    // 判断逻辑
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) return null
    return state.tr
      .delete(start, end)
      .setBlockType(start, start, nodeType, attrs)
  })
}
