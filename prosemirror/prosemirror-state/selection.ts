import {Slice, Fragment, ResolvedPos, Node} from "prosemirror-model"
import {ReplaceStep, ReplaceAroundStep, Mappable} from "prosemirror-transform"
import {Transaction} from "./transaction"

const classesById = Object.create(null)

/// Superclass for editor selections. Every selection type should
/// extend this. Should not be instantiated directly.
/** editorSelections的超类。每个selection类型都应该继承这个类。不应该被直接实例化 */
export abstract class Selection {
  /// Initialize a selection with the head and anchor and ranges. If no
  /// ranges are given, constructs a single range across `$anchor` and
  /// `$head`.
  /**
   * 用指定的head、anchor和ranges初始化一个选区。如果没有ranges被指定则构造一个跨越`$anchor`
   * 的`$head`的单个range
   * @param $anchor 锚点
   * @param $head 头部
   * @param ranges 选区的范围，如果未指定则会根据指定的`$anchor`和`$head`构造一个选区
   */
  constructor(
    /// The resolved anchor of the selection (the side that stays in
    /// place when the selection is modified).
    readonly $anchor: ResolvedPos,
    /// The resolved head of the selection (the side that moves when
    /// the selection is modified).
    readonly $head: ResolvedPos,
    ranges?: readonly SelectionRange[]
  ) {
    this.ranges = ranges || [new SelectionRange($anchor.min($head), $anchor.max($head))]
  }

  /// The ranges covered by the selection.
  /** 被当前选区覆盖的范围 */
  ranges: readonly SelectionRange[]

  /// The selection's anchor, as an unresolved position.
  /** 选区位置未被解析的锚点 */
  get anchor() { return this.$anchor.pos }

  /// The selection's head.
  /** 选区的头部 */
  get head() { return this.$head.pos }

  /// The lower bound of the selection's main range.
  /** 选区的主范围的开始边界位置 */
  get from() { return this.$from.pos }

  /// The upper bound of the selection's main range.
  /** 选区主范围的结束边界位置 */
  get to() { return this.$to.pos }

  /// The resolved lower  bound of the selection's main range.
  /** 选区主范围的被解析过的开始边界位置 */
  get $from() {
    return this.ranges[0].$from
  }

  /// The resolved upper bound of the selection's main range.
  /** 选区主范围的被解析过的结束边界位置 */
  get $to() {
    return this.ranges[0].$to
  }

  /// Indicates whether the selection contains any content.
  /** 表明当前选区是否包含内容 原理就是检测每个选区的开始位置是否等于结束位置如果不相等则包含内容 */
  get empty(): boolean {
    let ranges = this.ranges
    for (let i = 0; i < ranges.length; i++)
      if (ranges[i].$from.pos != ranges[i].$to.pos) return false
    return true
  }

  /// Test whether the selection is the same as another selection.
  /**
   * 测试当前选区是否与指定选区相同
   * @param selection 指定选区用于与当前选区进行比较
   */
  abstract eq(selection: Selection): boolean

  /// Map this selection through a [mappable](#transform.Mappable)
  /// thing. `doc` should be the new document to which we are mapping.
  /**
   * 通过一个映射对象映射当前选区。`doc`应该是正在映射的新文档
   * @param doc 当前选区映射的新文档
   * @param mapping 可映射对象
   */
  abstract map(doc: Node, mapping: Mappable): Selection

  /// Get the content of this selection as a slice.
  /** 获取作为当前选区内容的slice */
  content() {
    return this.$from.doc.slice(this.from, this.to, true)
  }

  /// Replace the selection with a slice or, if no slice is given,
  /// delete the selection. Will append to the given transaction.
  //MARK selection.replace
  /**
   * 用指定的切片替换当前选区如果未指定切片则删除当前选区。会被附加到指定的事务(transaction)上  
   * 指定的用于替换的内容只会替换第一个选区范围其余选区范围则删除  
   * 关于替换之后的选区：  
   * 生成一个被插入内容的新选区。当内容是以内联节点结束时则继续向后搜索(文档结束方向)以获取这个节点的after位置
   * 如果不是内联内容则向前搜索(文档开始方向)(目的应该是选中范围内的文本节点而非中间的部分范围)
   * @param tr 记录当前替换操作的事务
   * @param content 用于替换当前选区的切片
   */
  replace(tr: Transaction, content = Slice.empty) {
    // Put the new selection at the position after the inserted
    // content. When that ended in an inline node, search backwards,
    // to get the position after that node. If not, search forward.
    let lastNode = content.content.lastChild, lastParent = null
    for (let i = 0; i < content.openEnd; i++) {
      lastParent = lastNode!
      lastNode = lastNode!.lastChild
    }

    let mapFrom = tr.steps.length, ranges = this.ranges
    for (let i = 0; i < ranges.length; i++) {
      let {$from, $to} = ranges[i], mapping = tr.mapping.slice(mapFrom)
      // 替换选区第一个主范围并删除后续选区内容
      tr.replaceRange(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content)
      // 关于替换选区主范围时新选区的处理
      if (i == 0)
        // 如果最后一个节点存在则根据最后节点的类型决定搜索方向 内联节点则向后非内联节点则向前
        // 如果最后一个节点不存在但其父元素存在且父元素是为本块则向后搜索否则向前搜索
        selectionToInsertionEnd(tr, mapFrom, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1)
    }
  }

  /// Replace the selection with the given node, appending the changes
  /// to the given transaction.
  /**
   * 用指定的节点替换当前的选区并把这些变化添加到指定的事务中
   * @param tr 应用当前操作的事务
   * @param node 用于替换当前选区的节点
   */
  replaceWith(tr: Transaction, node: Node) {
    let mapFrom = tr.steps.length, ranges = this.ranges
    for (let i = 0; i < ranges.length; i++) {
      let {$from, $to} = ranges[i], mapping = tr.mapping.slice(mapFrom)
      let from = mapping.map($from.pos), to = mapping.map($to.pos)
      // 选区后面的非主范围的区域直接删除
      if (i) {
        tr.deleteRange(from, to)
      // 选区的第一个range则用指定的节点进行替换并自动为插入的内容生成一个选区
      } else {
        tr.replaceRangeWith(from, to, node)
        selectionToInsertionEnd(tr, mapFrom, node.isInline ? -1 : 1)
      }
    }
  }

  /// Convert the selection to a JSON representation. When implementing
  /// this for a custom selection class, make sure to give the object a
  /// `type` property whose value matches the ID under which you
  /// [registered](#state.Selection^jsonID) your class.
  /** 将当前选区转换成JSON对象。当为自定义选区类实现这个方法时需确保给这个对象一个`type`属性
   * 它的值要匹配你注册的类的ID
   */
  abstract toJSON(): any

  /// Find a valid cursor or leaf node selection starting at the given
  /// position and searching back if `dir` is negative, and forward if
  /// positive. When `textOnly` is true, only consider cursor
  /// selections. Will return null when no valid selection position is
  /// found.
  //MARK Selection.findFrom
  /**
   * 查找一个开始于指定位置的有效的光标或者节点选区。如果`dir`是负数则向文档开始方向搜索否则向文档
   * 结束方向搜索。当`textOnly`为true时只会查找光标选区。如果没有有效的选区位置被找到则返回null
   * @param $pos 指定位置的解析对象
   * @param dir 搜索方向 如果小于零则向文档开始的方向搜索如果大于或等于0则向文档结束的方向搜索
   * @param textOnly 是否只查找文本 如果true则只考虑光标位置 默认false
   * @returns 
   */
  static findFrom($pos: ResolvedPos, dir: number, textOnly: boolean = false): Selection | null {
    let inner = $pos.parent.inlineContent ? new TextSelection($pos)
        : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly)
    if (inner) return inner

    for (let depth = $pos.depth - 1; depth >= 0; depth--) {
      let found = dir < 0
          ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
          : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly)
      if (found) return found
    }
    return null
  }

  /// Find a valid cursor or leaf node selection near the given
  /// position. Searches forward first by default, but if `bias` is
  /// negative, it will search backwards first.
  /**
   * 查找一个靠近指定位置的有效的光标或者叶子节点选区。默认向前搜索(文档尾部)如果指定`bias`为负数则默认向后(文档首部)
   * @param $pos 指定位置解析对象
   * @param bias 查找方向
   * @returns 
   */
  static near($pos: ResolvedPos, bias = 1): Selection {
    return this.findFrom($pos, bias) || this.findFrom($pos, -bias) || new AllSelection($pos.node(0))
  }

  /// Find the cursor or leaf node selection closest to the start of
  /// the given document. Will return an
  /// [`AllSelection`](#state.AllSelection) if no valid position
  /// exists.
  /**
   * 查找最靠近指定文档开始位置的光标或叶子节点选区。如果没有有效的位置存在的话就返回一个全选选区
   * @param doc 文档节点
   */
  static atStart(doc: Node): Selection {
    return findSelectionIn(doc, doc, 0, 0, 1) || new AllSelection(doc)
  }

  /// Find the cursor or leaf node selection closest to the end of the
  /// given document.
  /**
   * 查找最靠近指定文档结束位置的光标或叶子节点选区。如果没有有效的位置存在的话就返回一个全选选区
   * @param doc 文档节点
   * @returns 
   */
  static atEnd(doc: Node): Selection {
    return findSelectionIn(doc, doc, doc.content.size, doc.childCount, -1) || new AllSelection(doc)
  }

  /// Deserialize the JSON representation of a selection. Must be
  /// implemented for custom classes (as a static class method).
  /**
   * 反序列化一个JSON格式的选区。这个方法在自定义选区类里必须要作为一个静态方法实现
   * @param doc 文档节点
   * @param json JSON对象
   * @returns 
   */
  static fromJSON(doc: Node, json: any): Selection {
    if (!json || !json.type) throw new RangeError("Invalid input for Selection.fromJSON")
    let cls = classesById[json.type]
    if (!cls) throw new RangeError(`No selection type ${json.type} defined`)
    return cls.fromJSON(doc, json)
  }

  /// To be able to deserialize selections from JSON, custom selection
  /// classes must register themselves with an ID string, so that they
  /// can be disambiguated. Try to pick something that's unlikely to
  /// clash with classes from other modules.
  /**
   * 为了能够从JSON对象中反序列化选区，自定义选区类必须用一个ID注册它们自己以便消除歧义。
   * 尝试使用一些不可能与其他模块起冲突的名字
   * @param id 用于标识选区类的标识符
   * @param selectionClass 选区类
   * @returns 
   */
  static jsonID(id: string, selectionClass: {fromJSON: (doc: Node, json: any) => Selection}) {
    if (id in classesById) throw new RangeError("Duplicate use of selection JSON ID " + id)
    classesById[id] = selectionClass
    ;(selectionClass as any).prototype.jsonID = id
    return selectionClass
  }

  /// Get a [bookmark](#state.SelectionBookmark) for this selection,
  /// which is a value that can be mapped without having access to a
  /// current document, and later resolved to a real selection for a
  /// given document again. (This is used mostly by the history to
  /// track and restore old selections.) The default implementation of
  /// this method just converts the selection to a text selection and
  /// returns the bookmark for that.
  /** 获取当前选区的书签，这是一个能在不访问当前文档的情况下被映射的值并且后面会再次被解析为一个用于
   * 指定文档的真实的选区。(这通常用于追踪和存储旧选区比如history插件)。该方法的默认实现只是将选区
   * 转换为文本选区并且返回对应的书签 
   */
  getBookmark(): SelectionBookmark {
    return TextSelection.between(this.$anchor, this.$head).getBookmark()
  }

  /// Controls whether, when a selection of this type is active in the
  /// browser, the selected range should be visible to the user.
  /// Defaults to `true`.
  /** 控制浏览器中当前类型的选区被激活时被选中的区域是否对用户可见 */
  visible!: boolean
}

Selection.prototype.visible = true

/// A lightweight, document-independent representation of a selection.
/// You can define a custom bookmark type for a custom selection class
/// to make the history handle it well.
/** 一个轻量级的独立于文档的选区表示，可以定义一个自定义书签类型用于自定义选区类以让编辑历史更好的处理它们  
 * 这里指的应该是history插件用于追踪和存储这些选区的方式
 */
export interface SelectionBookmark {
  /// Map the bookmark through a set of changes.
  /**
   * 通过一系列变化映射选区书签
   * @param mapping 可映射对象
   * @returns 
   */
  map: (mapping: Mappable) => SelectionBookmark

  /// Resolve the bookmark to a real selection again. This may need to
  /// do some error checking and may fall back to a default (usually
  /// [`TextSelection.between`](#state.TextSelection^between)) if
  /// mapping made the bookmark invalid.
  /**
   * 解析当前书签到一个真实的选区。这可能需要做一些错误检查，如果映射使得书签无效的话可能导致书签
   * 回滚到默认选区(通常是`textSelection.between)
   * @param doc 文档节点
   * @returns 
   */
  resolve: (doc: Node) => Selection
}

/// Represents a selected range in a document.
/** 表示文档中的一个选区范围 */
export class SelectionRange {
  /// Create a range.
  /**
   * 创建一个选区范围
   * @param $from 选区的开始边界
   * @param $to 选区结束边界
   */
  constructor(
    /// The lower bound of the range.
    readonly $from: ResolvedPos,
    /// The upper bound of the range.
    readonly $to: ResolvedPos
  ) {}
}

let warnedAboutTextSelection = false
/**
 * 检查指定位置的父节点是否为内联内容元素，如果指定位置的父节点不是内联内容节点控制台打印错误  
 * 看结构应该只会警告一次
 * @param $pos 位置解析对象
 */
function checkTextSelection($pos: ResolvedPos) {
  if (!warnedAboutTextSelection && !$pos.parent.inlineContent) {
    warnedAboutTextSelection = true
    console["warn"]("TextSelection endpoint not pointing into a node with inline content (" + $pos.parent.type.name + ")")
  }
}

/// A text selection represents a classical editor selection, with a
/// head (the moving side) and anchor (immobile side), both of which
/// point into textblock nodes. It can be empty (a regular cursor
/// position).
/**
 * 文本选区表示经典的编辑器选区，带有一个头部和一个锚点，这两指向文本块节点。如果为空则是常规的光标位置
 */
export class TextSelection extends Selection {
  /// Construct a text selection between the given points.
  /**
   * 根据指定的点构造一个文本选区
   * @param $anchor 文本选区的锚点所在位置的解析对象
   * @param $head 文本选区的头部所在位置的解析对象
   */
  constructor($anchor: ResolvedPos, $head = $anchor) {
    checkTextSelection($anchor)
    checkTextSelection($head)
    super($anchor, $head)
  }

  /// Returns a resolved position if this is a cursor selection (an
  /// empty text selection), and null otherwise.
  /** 如果当前选区是光标状态(空的文本选区)则返回一个位置解析对象否则返回null */
  get $cursor() { return this.$anchor.pos == this.$head.pos ? this.$head : null }
  /**
   * 根据指定的节点和映射对象返回新的文本选区。如果选区头部所处位置不是文本区域则会自动移动位置以排除
   * 或包括这个节点优先向文本尾部移动
   * @param doc 文档节点
   * @param mapping 映射对象
   * @returns 
   */
  map(doc: Node, mapping: Mappable): Selection {
    let $head = doc.resolve(mapping.map(this.head))
    if (!$head.parent.inlineContent) return Selection.near($head)
    let $anchor = doc.resolve(mapping.map(this.anchor))
    return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head)
  }
  
  replace(tr: Transaction, content = Slice.empty) {
    super.replace(tr, content)
    if (content == Slice.empty) {
      let marks = this.$from.marksAcross(this.$to)
      if (marks) tr.ensureMarks(marks)
    }
  }

  eq(other: Selection): boolean {
    return other instanceof TextSelection && other.anchor == this.anchor && other.head == this.head
  }

  getBookmark() {
    return new TextBookmark(this.anchor, this.head)
  }

  toJSON(): any {
    return {type: "text", anchor: this.anchor, head: this.head}
  }

  /// @internal
  static fromJSON(doc: Node, json: any) {
    if (typeof json.anchor != "number" || typeof json.head != "number")
      throw new RangeError("Invalid input for TextSelection.fromJSON")
    return new TextSelection(doc.resolve(json.anchor), doc.resolve(json.head))
  }

  /// Create a text selection from non-resolved positions.
  /**
   * 从给定的未被解析的位置创建一个文本选区
   * @param doc 文档节点
   * @param anchor 用于创建选区的锚点位置
   * @param head 用于创建选区的头部位置
   * @returns 返回一个文本选区
   */
  static create(doc: Node, anchor: number, head = anchor) {
    let $anchor = doc.resolve(anchor)
    return new this($anchor, head == anchor ? $anchor : doc.resolve(head))
  }

  /// Return a text selection that spans the given positions or, if
  /// they aren't text positions, find a text selection near them.
  /// `bias` determines whether the method searches forward (default)
  /// or backwards (negative number) first. Will fall back to calling
  /// [`Selection.near`](#state.Selection^near) when the document
  /// doesn't contain a valid text position.
  /**
   * 返回一个跨越指定位置的文本选区，如果指定的位置不在文本范围则会找到一个靠近它们的文本选区。
   * `bias`确定方法搜索的方向，默认优先向文档尾部搜索。如果文档不包含一个有效的文本位置则会调用
   * `selection.near`方法创建一个靠近头部位置的选区
   * @param $anchor 用于作为锚点的位置解析对象
   * @param $head 用于作为头部的位置解析对象
   * @param bias 搜索方向 如果未指定的话则会根据锚点和头部进行计算
   * @returns 返回一个选区如果可能的话则会返回文本选区
   */
  static between($anchor: ResolvedPos, $head: ResolvedPos, bias?: number): Selection {
    let dPos = $anchor.pos - $head.pos
    if (!bias || dPos) bias = dPos >= 0 ? 1 : -1
    if (!$head.parent.inlineContent) {
      let found = Selection.findFrom($head, bias, true) || Selection.findFrom($head, -bias, true)
      if (found) $head = found.$head
      else return Selection.near($head, bias)
    }
    if (!$anchor.parent.inlineContent) {
      if (dPos == 0) {
        $anchor = $head
      } else {
        $anchor = (Selection.findFrom($anchor, -bias, true) || Selection.findFrom($anchor, bias, true))!.$anchor
        if (($anchor.pos < $head.pos) != (dPos < 0)) $anchor = $head
      }
    }
    return new TextSelection($anchor, $head)
  }
}

Selection.jsonID("text", TextSelection)
/** 文本选区书签 用于文本选区的追踪和存储 */
class TextBookmark {
  /**
   * 
   * @param anchor 当前文本选区书签的锚点
   * @param head 当前文本选区书签的头部
   */
  constructor(readonly anchor: number, readonly head: number) {}
  /**
   * 根据指定的映射对象 返回一个新的文本选区书签
   * @param mapping 用于映射当前文本选区的映射对象
   */
  map(mapping: Mappable) {
    return new TextBookmark(mapping.map(this.anchor), mapping.map(this.head))
  }
  /**
   * 根据指定的文档节点返回一个真实的文本选区
   * @param doc 文档节点
   */
  resolve(doc: Node) {
    return TextSelection.between(doc.resolve(this.anchor), doc.resolve(this.head))
  }
}

/// A node selection is a selection that points at a single node. All
/// nodes marked [selectable](#model.NodeSpec.selectable) can be the
/// target of a node selection. In such a selection, `from` and `to`
/// point directly before and after the selected node, `anchor` equals
/// `from`, and `head` equals `to`..
//MARK class NodeSelection
/**
 * 节点选区是一个指向单个节点的选区。所有被标记为`selectable`的节点都能作为节点选区的对象。
 * 选区的`from`和`to`直接指向被选中节点的before和after位置，`anchor`与`from`相同而`head`与`to`相同
 */
export class NodeSelection extends Selection {
  /// Create a node selection. Does not verify the validity of its
  /// argument.
  /**
   * 创建一个节点选区，不会验证参数的有效性  
   * 一般这个位置位于节点的before位置，被选中的节点则是这个位置正后方的节点
   * @param $pos 指定的被解析的位置
   */
  constructor($pos: ResolvedPos) {
    let node = $pos.nodeAfter!
    let $end = $pos.node(0).resolve($pos.pos + node.nodeSize)
    super($pos, $end)
    this.node = node
  }

  /// The selected node.
  /** 被选中的节点 */
  node: Node

  map(doc: Node, mapping: Mappable): Selection {
    let {deleted, pos} = mapping.mapResult(this.anchor)
    let $pos = doc.resolve(pos)
    if (deleted) return Selection.near($pos)
    return new NodeSelection($pos)
  }

  content() {
    return new Slice(Fragment.from(this.node), 0, 0)
  }

  eq(other: Selection): boolean {
    return other instanceof NodeSelection && other.anchor == this.anchor
  }

  toJSON(): any {
    return {type: "node", anchor: this.anchor}
  }

  getBookmark() { return new NodeBookmark(this.anchor) }

  /// @internal
  static fromJSON(doc: Node, json: any) {
    if (typeof json.anchor != "number")
      throw new RangeError("Invalid input for NodeSelection.fromJSON")
    return new NodeSelection(doc.resolve(json.anchor))
  }

  /// Create a node selection from non-resolved positions.
  /**
   * 从一个未被解析的位置创建一个节点选区
   * @param doc 该节点选区的根节点
   * @param from 指定未被解析位置
   * @returns 节点选区
   */
  static create(doc: Node, from: number) {
    return new NodeSelection(doc.resolve(from))
  }

  /// Determines whether the given node may be selected as a node
  /// selection.
  /**
   * 确定指定节点是否能作为节点选区选中，节点不能是文本节点且节点规范不能禁止该节点被选中  
   * 文本节点应该适用于文本选区而非节点选区
   * @param node 指定节点
   * @returns 
   */
  static isSelectable(node: Node) {
    return !node.isText && node.type.spec.selectable !== false
  }
}

NodeSelection.prototype.visible = false

Selection.jsonID("node", NodeSelection)
/** 节点选区书签 */
class NodeBookmark {
  /**
   * 根据指定的位置构造一个节点选区书签
   * @param anchor 节点选区的锚点位置
   */
  constructor(readonly anchor: number) {}
  /**
   * 根据指定的映射对象更新当前节点选区书签，如果对应位置的节点被删除的话则会返回一个该位置的文本选区书签
   * @param mapping 用于跟新当前节点选区书签的映射对象
   */
  map(mapping: Mappable) {
    let {deleted, pos} = mapping.mapResult(this.anchor)
    return deleted ? new TextBookmark(pos, pos) : new NodeBookmark(pos)
  }
  /**
   * 根据指定的文档节点将当前的节点选区书签生成一个实际的节点选区
   * @param doc 文档节点
   */
  resolve(doc: Node) {
    let $pos = doc.resolve(this.anchor), node = $pos.nodeAfter
    if (node && NodeSelection.isSelectable(node)) return new NodeSelection($pos)
    return Selection.near($pos)
  }
}

/// A selection type that represents selecting the whole document
/// (which can not necessarily be expressed with a text selection, when
/// there are for example leaf block nodes at the start or end of the
/// document).
/**
 * 表示选中整个文档的选区类型(不一定能用文本选区表示的比如当文档的首尾存在叶子块节点时)
 */
export class AllSelection extends Selection {
  /// Create an all-selection over the given document.
  /**
   * 创建一个覆盖指定文档的全选区域
   * @param doc 文档节点
   */
  constructor(doc: Node) {
    super(doc.resolve(0), doc.resolve(doc.content.size))
  }

  replace(tr: Transaction, content = Slice.empty) {
    if (content == Slice.empty) {
      tr.delete(0, tr.doc.content.size)
      let sel = Selection.atStart(tr.doc)
      if (!sel.eq(tr.selection)) tr.setSelection(sel)
    } else {
      super.replace(tr, content)
    }
  }

  toJSON(): any { return {type: "all"} }

  /// @internal
  static fromJSON(doc: Node) { return new AllSelection(doc) }

  map(doc: Node) { return new AllSelection(doc) }

  eq(other: Selection) { return other instanceof AllSelection }

  getBookmark() { return AllBookmark }
}

Selection.jsonID("all", AllSelection)

const AllBookmark = {
  map() { return this },
  resolve(doc: Node) { return new AllSelection(doc) }
}

// FIXME we'll need some awareness of text direction when scanning for selections

// Try to find a selection inside the given node. `pos` points at the
// position where the search starts. When `text` is true, only return
// text selections.
//MARK findSelectionIn
/**
 * 尝试找到指定节点的选区。`pos`指向开始搜索的位置。`text`为true时只返回文本选区
 * @param doc 文档节点
 * @param node 指定节点
 * @param pos 被查找的位置
 * @param index 被查找的位置所在节点的索引(与查找方向有关如果查找方向为文档首则为该位置所在节点的索引否则为这个节点的后一个节点的索引)
 * @param dir 查找方向
 * @param text 是否只查找文本选区 默认false
 * @returns 
 */
function findSelectionIn(doc: Node, node: Node, pos: number, index: number, dir: number, text = false): Selection | null {
  // 如果指定的节点是内联内容节点 则根据指定的位置创建一个文本选区(光标)
  if (node.inlineContent) return TextSelection.create(doc, pos)
  // i：如果向文档尾查找则索引不变，如果向文档首查找则将索引指向其前一个节点
  // 退出条件：如果向文档尾查找则i不能超过指定节点的子节点最大索引如果向前查找则不能超过指定节点的开始子节点的索引
  // 更新i的位置
  for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
    let child = node.child(i)
    // 子节点不是原子节点
    if (!child.isAtom) {
      // 继续向内部查找
      let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text)
      if (inner) return inner
    // 不要求文本节点选区且可作为节点选区
    } else if (!text && NodeSelection.isSelectable(child)) {
      return NodeSelection.create(doc, pos - (dir < 0 ? child.nodeSize : 0))
    }
    pos += child.nodeSize * dir
  }
  return null
}
//MARK selectionToInsertionEnd
/**
 * 
 * @param tr 应用当前选区的事务
 * @param startLen 定位此次插入在事务transaction中的step的索引
 * @param bias 搜索方向 小于或等于0则向前搜索大于0则向后搜索
 * @returns 
 */
function selectionToInsertionEnd(tr: Transaction, startLen: number, bias: number) {
  let last = tr.steps.length - 1
  if (last < startLen) return
  let step = tr.steps[last]
  if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return
  let map = tr.mapping.maps[last], end: number | undefined
  map.forEach((_from, _to, _newFrom, newTo) => { if (end == null) end = newTo })
  tr.setSelection(Selection.near(tr.doc.resolve(end!), bias))
}
