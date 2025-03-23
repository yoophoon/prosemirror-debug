import {Node, NodeType, Mark, MarkType, ContentMatch, Slice, Fragment, NodeRange, Attrs} from "prosemirror-model"

import {Mapping} from "./map"
import {Step} from "./step"
import {addMark, removeMark, clearIncompatible} from "./mark"
import {replaceStep, replaceRange, replaceRangeWith, deleteRange} from "./replace"
import {lift, wrap, setBlockType, setNodeMarkup, split, join} from "./structure"
import {AttrStep, DocAttrStep} from "./attr_step"
import {AddNodeMarkStep, RemoveNodeMarkStep} from "./mark_step"

/// @internal
/** 继承了Error的类，没有额外的属性方法 */
export let TransformError = class extends Error {}

TransformError = function TransformError(this: any, message: string) {
  let err = Error.call(this, message)
  ;(err as any).__proto__ = TransformError.prototype
  return err
} as any

TransformError.prototype = Object.create(Error.prototype)
TransformError.prototype.constructor = TransformError
TransformError.prototype.name = "TransformError"

/// Abstraction to build up and track an array of
/// [steps](#transform.Step) representing a document transformation.
///
/// Most transforming methods return the `Transform` object itself, so
/// that they can be chained.
/**
 * 用来构建和追踪表示文档变化信息的steps数组的类，大多数[转变方法(`transforming methods`)]
 * 返回`Transform`对象本身以便它们能被连接起来
 */
export class Transform {
  /// The steps in this transform.
  /** transform中的steps栈 */
  readonly steps: Step[] = []
  /// The documents before each of the steps.
  /** transform中的nodes栈，通常用来存储文档doc */
  readonly docs: Node[] = []
  /// A mapping with the maps for each of the steps in this transform.
  /** 一个带有关于当前transform的steps栈的映射信息的mapping对象，内有有个stepMap栈 */
  readonly mapping: Mapping = new Mapping

  /// Create a transform that starts with the given document.
  /**
   * 创建一个以传入的文档开始的transform
   * @param doc 当前文档（在transform中应用steps的结果）
   */
  constructor(
    /// The current document (the result of applying the steps in the
    /// transform).
    public doc: Node
  ) {}

  /// The starting document.
  /**
   * 获取起始文档或通过构造函数传入的文档，这时的文档还未应用step
   */
  get before() { return this.docs.length ? this.docs[0] : this.doc }

  /// Apply a new step in this transform, saving the result. Throws an
  /// error when the step fails.
  /**
   * 在当前transform中应用一个新的step并返回其结果。当应用失败时抛出一个错误
   * @param step 一个新的step
   * @returns 传入的step应用成功则返回应用step之后的stepResult，失败则抛出transformError实例
   */
  step(step: Step) {
    let result = this.maybeStep(step)
    if (result.failed) throw new TransformError(result.failed)
    return this
  }

  /// Try to apply a step in this transformation, ignoring it if it
  /// fails. Returns the step result.
  /**
   * 尝试应用一个step如果失败了则会被忽略
   * @param step 一个新的step
   * @returns stepResult
   */
  maybeStep(step: Step) {
    let result = step.apply(this.doc)
    if (!result.failed) this.addStep(step, result.doc!)
    return result
  }

  /// True when the document has been changed (when there are any
  /// steps).
  /**
   * 当文档被改动时则返回true（steps栈里有信息）
   */
  get docChanged() {
    return this.steps.length > 0
  }

  /// @internal
  /**
   * 将应用的新step及其产生的文档和stepMap添加到transform内部的栈中
   * @param step 新的step
   * @param doc 应用该step新产生的文档
   */
  addStep(step: Step, doc: Node) {
    this.docs.push(this.doc)
    this.steps.push(step)
    this.mapping.appendMap(step.getMap())
    this.doc = doc
  }

  /// Replace the part of the document between `from` and `to` with the
  /// given `slice`.
  /**
   * 使用传入的文档切片替换当前文档的from到to的位置，期间会自动生成一个关于该次变动的step
   * @param from 文档变动的起点
   * @param to 文档变动的重点
   * @param slice 文档切片
   * @returns 当前transform实例
   */
  replace(from: number, to = from, slice = Slice.empty): this {
    let step = replaceStep(this.doc, from, to, slice)
    if (step) this.step(step)
    return this
  }

  /// Replace the given range with the given content, which may be a
  /// fragment, node, or array of nodes.
  /**
   * 用传入的内容替换文档的范围，期间产生的step会被推入transform内部的栈中
   * @param from 文档变动的起点
   * @param to 文档变动的重点
   * @param content 用于替换的内容（fragment）
   * @returns 当前transform实例
   */
  replaceWith(from: number, to: number, content: Fragment | Node | readonly Node[]): this {
    return this.replace(from, to, new Slice(Fragment.from(content), 0, 0))
  }

  /// Delete the content between the given positions.
  /**
   * 将传入的位置信息对应的内容删除
   * @param from 文档变动的起点
   * @param to 文档变动的重点
   * @returns 当前transform实例
   */
  delete(from: number, to: number): this {
    return this.replace(from, to, Slice.empty)
  }

  /// Insert the given content at the given position.
  /**
   * 在给定的位置插入给定的内容
   * @param pos 插入内容的位置
   * @param content 用于插入的内容
   * @returns 当前transform实例
   */
  insert(pos: number, content: Fragment | Node | readonly Node[]): this {
    return this.replaceWith(pos, pos, content)
  }

  /// Replace a range of the document with a given slice, using
  /// `from`, `to`, and the slice's
  /// [`openStart`](#model.Slice.openStart) property as hints, rather
  /// than fixed start and end points. This method may grow the
  /// replaced area or close open nodes in the slice in order to get a
  /// fit that is more in line with WYSIWYG expectations, by dropping
  /// fully covered parent nodes of the replaced region when they are
  /// marked [non-defining as
  /// context](#model.NodeSpec.definingAsContext), or including an
  /// open parent node from the slice that _is_ marked as [defining
  /// its content](#model.NodeSpec.definingForContent).
  ///
  /// This is the method, for example, to handle paste. The similar
  /// [`replace`](#transform.Transform.replace) method is a more
  /// primitive tool which will _not_ move the start and end of its given
  /// range, and is useful in situations where you need more precise
  /// control over what happens.
  /**
   * 用传入的切片替换文档中的一个选区范围（用户选取内容则是选区范围，未选取内容则是在光标位置插入）
   * 使用参数from、to以及切片的起点开放长度及终点开放长度属性进行模糊替换而不是采用固定的开始和
   * 结束位置。这个方法可能会增加被替换的范围或者闭合在切片中被开放的节点以更适配所见即所得的期望
   * （如放弃完全覆盖被替换区域的非定义上下文父节点[对应前者扩大被替换范围]或者包含一个来自切片被
   * 定义为内容的开放父节点[对应后者闭合切片的开放节点]）  
   * 这个方法用来处理粘贴等。相似方法tr.replace则是更主要的不会更改给定的范围的开始和结束位置的
   * 工具也是在需要对事件有更精细的控制的情况下更有效
   * @param from 范围替换在文档中的起点
   * @param to 范围替换在文档中的重点
   * @param slice 用于替换的切片内容
   * @returns 应用本次替换的事务（transaction）
   */
  replaceRange(from: number, to: number, slice: Slice): this {
    replaceRange(this, from, to, slice)
    return this
  }

  /// Replace the given range with a node, but use `from` and `to` as
  /// hints, rather than precise positions. When from and to are the same
  /// and are at the start or end of a parent node in which the given
  /// node doesn't fit, this method may _move_ them out towards a parent
  /// that does allow the given node to be placed. When the given range
  /// completely covers a parent node, this method may completely replace
  /// that parent node.

  /**
   * 用传入的node替换由'from'和'to’示意的模糊范围而非精确位置。当from和to是一样的
   * 或者在某个传入的node不匹配的父节点的开始或结尾，这个方法可能会将这个范围扩大至允许替换
   * node的父节点，这个方法可能会完全覆盖这个父节点
   * @param from 范围替换在文档中的起点
   * @param to 范围替换在文档中的重点
   * @param node 用于范围替换的节点（内容）
   * @returns 返回应用本次替换的事务（transaction）
   */
  replaceRangeWith(from: number, to: number, node: Node): this {
    replaceRangeWith(this, from, to, node)
    return this
  }

  /// Delete the given range, expanding it to cover fully covered
  /// parent nodes until a valid replace is found.
  /**
   * 删除传入的范围，会自动扩展直到找到一个能有效删除的位置被找到
   * @param from 文档删除内容开始的位置
   * @param to 文档删除内容结束的位置
   * @returns 返回应用本次删除的事务（transaction）
   */
  deleteRange(from: number, to: number): this {
    deleteRange(this, from, to)
    return this
  }

  /// Split the content in the given range off from its parent, if there
  /// is sibling content before or after it, and move it up the tree to
  /// the depth specified by `target`. You'll probably want to use
  /// [`liftTarget`](#transform.liftTarget) to compute `target`, to make
  /// sure the lift is valid.
  /**
   * 将指定范围的内容从其父元素分离出来(如果有之前或之后有兄弟节点的话)并将其沿着节点树移动到由`target`指定的层级
   * 移动之前可能需要使用`liftTarget`来计算指定层级是否能接受此次移动
   * @param range 指定的节点范围
   * @param target 要被提升的层级
   * @returns 完成此次操作的transaction
   */
  lift(range: NodeRange, target: number): this {
    lift(this, range, target)
    return this
  }

  /// Join the blocks around the given position. If depth is 2, their
  /// last and first siblings are also joined, and so on.
  /**
   * 联合指定的位置周围的块节点。如果层级为2则前方块的最后节点和后方块的第一个节点也会被联合  
   * depth=1即默认只联合位置所在父元素的子节点 depth=2的话则第二层的节点也会进行联合  
   * 比如删除换行符的行为
   * @param pos 指定的位置
   * @param depth 指定的层级 默认层级为1
   * @returns 
   */
  join(pos: number, depth: number = 1): this {
    join(this, pos, depth)
    return this
  }

  /// Wrap the given [range](#model.NodeRange) in the given set of wrappers.
  /// The wrappers are assumed to be valid in this position, and should
  /// probably be computed with [`findWrapping`](#transform.findWrapping).
  /**
   * 用指定的包裹将指定的范围包裹起来。指定位置的包裹被假定为有效的，这应该采用`findWrapping`进行计算
   * @param range 被包裹的范围
   * @param wrappers 包裹
   * @returns 
   */
  wrap(range: NodeRange, wrappers: readonly {type: NodeType, attrs?: Attrs | null}[]): this {
    wrap(this, range, wrappers)
    return this
  }

  /// Set the type of all textblocks (partly) between `from` and `to` to
  /// the given node type with the given attributes.
  /**
   * 将`from`到`to`之间的文本块用指定的节点类型和属性包裹起来
   * @param from 指定开始位置
   * @param to 指定结束位置
   * @param type 指定节点类型
   * @param attrs 指定节点属性
   * @returns 返回应用操作之后的transaction
   */
  setBlockType(from: number, to = from, type: NodeType, attrs: Attrs | null | ((oldNode: Node) => Attrs) = null): this {
    setBlockType(this, from, to, type, attrs)
    return this
  }

  /// Change the type, attributes, and/or marks of the node at `pos`.
  /// When `type` isn't given, the existing node type is preserved,
  /** 改变指定位置的节点的类型及属性。如果节点类型没有指定则指定位置的节点类型会被保留但属性和marks会被更新为指定的
   * @param tr 
   * @param pos 指定位置
   * @param type 指定节点类型
   * @param attrs 指定节点属性
   * @param marks 指定marks
   * @returns 
   */
  setNodeMarkup(pos: number, type?: NodeType | null, attrs: Attrs | null = null, marks?: readonly Mark[]): this {
    setNodeMarkup(this, pos, type, attrs, marks)
    return this
  }

  /// Set a single attribute on a given node to a new value.
  /// The `pos` addresses the document content. Use `setDocAttribute`
  /// to set attributes on the document itself.
  /**
   * 设置指定节点的指定属性。`pos`是文档内容的位置。使用`setDocAttribute`设置文档根节点本身的属性
   * @param pos 指定位置
   * @param attr 指定属性名称
   * @param value 指定属性值
   * @returns 
   */
  setNodeAttribute(pos: number, attr: string, value: any): this {
    this.step(new AttrStep(pos, attr, value))
    return this
  }

  /// Set a single attribute on the document to a new value.
  /**
   * 设置文档根节点的属性
   * @param attr 指定属性名
   * @param value 指定属性值
   * @returns 
   */
  setDocAttribute(attr: string, value: any): this {
    this.step(new DocAttrStep(attr, value))
    return this
  }

  /// Add a mark to the node at position `pos`.
  /**
   * 给指定位置的节点添加一个mark
   * @param pos 指定位置
   * @param mark 指定mark
   * @returns 
   */
  addNodeMark(pos: number, mark: Mark): this {
    this.step(new AddNodeMarkStep(pos, mark))
    return this
  }

  /// Remove a mark (or a mark of the given type) from the node at
  /// position `pos`.
  /**
   * 从指定位置的节点移除指定的mark
   * @param pos 指定位置
   * @param mark 指定mark
   * @returns 
   */
  removeNodeMark(pos: number, mark: Mark | MarkType): this {
    // 如果指定的mark是markType实例
    if (!(mark instanceof Mark)) {
      let node = this.doc.nodeAt(pos)
      if (!node) throw new RangeError("No node at position " + pos)
      mark = mark.isInSet(node.marks)!
      // 如果指定位置的节点不存在这个mark则直接返回
      if (!mark) return this
    }
    this.step(new RemoveNodeMarkStep(pos, mark))
    return this
  }

  /// Split the node at the given position, and optionally, if `depth` is
  /// greater than one, any number of nodes above that. By default, the
  /// parts split off will inherit the node type of the original node.
  /// This can be changed by passing an array of types and attributes to
  /// use after the split (with the outermost nodes coming first).
  /**
   * 在指定层级分隔指定位置的节点。分隔出来的内容会默认继承原来的路径，可以用过指定路径typesAfter进行改变
   * @param pos 指定分隔的位置
   * @param depth 指定层级 默认为1即只分这个位置的父元素的子节点如果大于1则会继续往上拆分
   * @param typesAfter 分隔开后的节点类型及属性 默认继承原来的节点类型和属性(该数组应该理解为节点路径，头部为路径的上层节点尾部则为下层节点)
   * @returns 
   */
  split(pos: number, depth = 1, typesAfter?: (null | {type: NodeType, attrs?: Attrs | null})[]) {
    split(this, pos, depth, typesAfter)
    return this
  }

  /// Add the given mark to the inline content between `from` and `to`.
  /**
   * 给指定范围内的内联节点添加指定的mark
   * @param from 添加指定mark的开始位置
   * @param to 添加指定mark的结束位置
   * @param mark 要被添加的指定mark
   * @returns 
   */
  addMark(from: number, to: number, mark: Mark): this {
    addMark(this, from, to, mark)
    return this
  }

  /// Remove marks from inline nodes between `from` and `to`. When
  /// `mark` is a single mark, remove precisely that mark. When it is
  /// a mark type, remove all marks of that type. When it is null,
  /// remove all marks of any type.
  /**
   * 将指定mark从指定范围内的内联节点中移除。当指定的mark是一个单独的mark实例则只移除该mark，
   * 当是markType则移除该类型的mark，当为空时则移除全部mark
   * @param from 移除指定mark的开始位置
   * @param to 移除指定mark的结束位置
   * @param mark 要移除的mark
   * @returns 
   */
  removeMark(from: number, to: number, mark?: Mark | MarkType | null) {
    removeMark(this, from, to, mark)
    return this
  }

  /// Removes all marks and nodes from the content of the node at
  /// `pos` that don't match the given new parent node type. Accepts
  /// an optional starting [content match](#model.ContentMatch) as
  /// third argument.
  /**
   * 从指定位置的节点中移除所有不满足父节点类型的marks和nodes。接受一个可选的contentMatch的开始状态作为第三个参数
   * @param pos 指定位置
   * @param parentType 父节点的类型
   * @param match 指定的contentMatch
   * @returns 
   */
  clearIncompatible(pos: number, parentType: NodeType, match?: ContentMatch) {
    clearIncompatible(this, pos, parentType, match)
    return this
  }
}
