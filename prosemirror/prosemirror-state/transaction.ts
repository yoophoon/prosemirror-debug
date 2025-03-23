import {Transform, Step} from "prosemirror-transform"
import {Mark, MarkType, Node, Slice} from "prosemirror-model"
import {type EditorView} from "prosemirror-view"
import {Selection} from "./selection"
import {Plugin, PluginKey} from "./plugin"
import {EditorState} from "./state"

/// Commands are functions that take a state and a an optional
/// transaction dispatch function and...
///
///  - determine whether they apply to this state
///  - if not, return false
///  - if `dispatch` was passed, perform their effect, possibly by
///    passing a transaction to `dispatch`
///  - return true
///
/// In some cases, the editor view is passed as a third argument.
/**
 * 
 * ([`keymap`](prosemirror-keymap)则是利用插件监听了handleKeydown事件
 * prosemirror-view内部会在触发该事件时调用该事件处理函数f(view,event)，
 * 这个命令正是位于该事件函数内部被调用)
 * @param state 编辑器状态
 * @param dispatch 事务分发函数
 * @returns 成功应用到状态则返回true，否则返回false
 */
export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean

/**
 * UPDATED_SEL   =0b001
 * UPDATED_MARKS =0b010
 * UPDATED_SCROLL=0b100
 */
const UPDATED_SEL = 1, UPDATED_MARKS = 2, UPDATED_SCROLL = 4

/// An editor state transaction, which can be applied to a state to
/// create an updated state. Use
/// [`EditorState.tr`](#state.EditorState.tr) to create an instance.
///
/// Transactions track changes to the document (they are a subclass of
/// [`Transform`](#transform.Transform)), but also other state changes,
/// like selection updates and adjustments of the set of [stored
/// marks](#state.EditorState.storedMarks). In addition, you can store
/// metadata properties in a transaction, which are extra pieces of
/// information that client code or plugins can use to describe what a
/// transaction represents, so that they can update their [own
/// state](#state.StateField) accordingly.
///
/// The [editor view](#view.EditorView) uses a few metadata
/// properties: it will attach a property `"pointer"` with the value
/// `true` to selection transactions directly caused by mouse or touch
/// input, a `"composition"` property holding an ID identifying the
/// composition that caused it to transactions caused by composed DOM
/// input, and a `"uiEvent"` property of that may be `"paste"`,
/// `"cut"`, or `"drop"`.
/**
 * transaction可以被应用于state(editorState.apply)产生更新过的状态，
 * editorState.tr可以产生新的transaction实例
 * 
 * transaction可以跟踪文档的变动（是transform的子类）及其他状态变动如选区更新和storeMarks调整，
 * 此外，还可以在transaction上存储metadata属性
 * （客户端代码或者插件可以用来描述transaction行为的额外属性，并根据这个更新他们自己的状态）
 * 
 * editorView会用到少量的metadata属性如它会附加一个值为`true`的pointer属性到由鼠标或触控输入产生的选区tr，
 * 一个持有id信息用于标识由DOM组合事件引起的transaction的组合信息`composition`属性
 * 一个可能是`"paste"`,`"cut"`或者`"drop"`的`"uiEvent"`属性
 * （大概意思就是如果metadata可以让tr附带身份信息，以便代码分辨tr）
 */
export class Transaction extends Transform {
  /// The timestamp associated with this transaction, in the same
  /// format as `Date.now()`.
  /** 与当前事务关联的时间戳，与`Date.now()`格式一致(生成tr时这个字段就是设置为Date.now()) */
  time: number
  /** 当前状态的选区 */
  private curSelection: Selection
  // The step count for which the current selection is valid.
  /** 当前的选区对应transaction的step的索引 */
  private curSelectionFor = 0
  // Bitfield to track which aspects of the state were updated by
  // this transaction.
  /** 用于追踪被当前transaction更新的状态的类型的比特位 */
  private updated = 0
  // Object used to store metadata properties for the transaction.
  /** 用于存储当前transaction的metadata属性的对象，metadata可能应用于不同的插件 */
  private meta: {[name: string]: any} = Object.create(null)

  /// The stored marks set by this transaction, if any.
  /** 被当前transaction设置的storedMarks */
  storedMarks: readonly Mark[] | null

  /// @internal
  /**
   * 根据指定的editorState生成一个transaction，方法一般为prosemirror内部使用
   * @param state editorState
   */
  constructor(state: EditorState) {
    super(state.doc)
    this.time = Date.now()
    this.curSelection = state.selection
    this.storedMarks = state.storedMarks
  }

  /// The transaction's current selection. This defaults to the editor
  /// selection [mapped](#state.Selection.map) through the steps in the
  /// transaction, but can be overwritten with
  /// [`setSelection`](#state.Transaction.setSelection).
  /** transaction的当前选区。默认会把编辑器的选区通过当前transaction的steps进行映射，但是可以
   * 用selection覆写这个操作(意思直接给transaction一个新的选区，之前的选区直接被覆盖了也不需要进行映射了)
   */
  get selection(): Selection {
    if (this.curSelectionFor < this.steps.length) {
      this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor))
      this.curSelectionFor = this.steps.length
    }
    return this.curSelection
  }

  /// Update the transaction's current selection. Will determine the
  /// selection that the editor gets when the transaction is applied.
  /**
   * 更新当前transaction的当前选区。当transaction被应用时会确定编辑器所得到的选区  
   * 函数会把mark的更新位置0 把选区更新位置1
   * @param selection 
   * @returns 
   */
  setSelection(selection: Selection): this {
    if (selection.$from.doc != this.doc)
      throw new RangeError("Selection passed to setSelection must point at the current document")
    this.curSelection = selection
    this.curSelectionFor = this.steps.length
    this.updated = (this.updated | UPDATED_SEL) & ~UPDATED_MARKS
    this.storedMarks = null
    return this
  }

  /// Whether the selection was explicitly updated by this transaction.
  /** 当前选区是否被当前transaction显示更新(当前transaction的选区更新位是否为1) */
  get selectionSet() {
    return (this.updated & UPDATED_SEL) > 0
  }

  /// Set the current stored marks.
  /**
   * 设置当前的storedMarks 函数会把marks的更新位调整位1
   * @param marks 将要被挂载到当前transaction.storedMarks的marks集合
   * @returns 
   */
  setStoredMarks(marks: readonly Mark[] | null): this {
    this.storedMarks = marks
    this.updated |= UPDATED_MARKS
    return this
  }

  /// Make sure the current stored marks or, if that is null, the marks
  /// at the selection, match the given set of marks. Does nothing if
  /// this is already the case.
  /**
   * 确保当前的storedMarks或者选区的marks匹配指定的marks集合。如果匹配则啥也不会做
   * @param marks 当前transaction需要匹配的marks集合
   * @returns 
   */
  ensureMarks(marks: readonly Mark[]): this {
    if (!Mark.sameSet(this.storedMarks || this.selection.$from.marks(), marks))
      this.setStoredMarks(marks)
    return this
  }

  /// Add a mark to the set of stored marks.
  /**
   * 添加一个mark实例到当前storedMarks集合
   * @param mark 将要添加到当前storedMarks的mark
   * @returns 
   */
  addStoredMark(mark: Mark): this {
    return this.ensureMarks(mark.addToSet(this.storedMarks || this.selection.$head.marks()))
  }

  /// Remove a mark or mark type from the set of stored marks.
  /**
   * 从当前storedMarks中移除指定的mark或移除某一类属于markType的实例
   * @param mark 将要从当前transaction移除的mark(实例或者类型)
   * @returns 
   */
  removeStoredMark(mark: Mark | MarkType): this {
    return this.ensureMarks(mark.removeFromSet(this.storedMarks || this.selection.$head.marks()))
  }

  /// Whether the stored marks were explicitly set for this transaction.
  /** 当前transaction是否显示的设置了storedMarks(存储的marks是否被用于当前transaction) */
  get storedMarksSet() {
    return (this.updated & UPDATED_MARKS) > 0
  }

  /// @internal
  /**
   * 为当前的transaction新添加一个step，本次文档变动不包含marks变动
   * @param step 文档变化的最小原子单位
   * @param doc 应用该step产生的新文档
   */
  addStep(step: Step, doc: Node) {
    super.addStep(step, doc)
    this.updated = this.updated & ~UPDATED_MARKS
    this.storedMarks = null
  }

  /// Update the timestamp for the transaction.
  /**
   * 为当前transaction更新时间戳
   * @param time 时间戳
   * @returns 当前transaction
   */
  setTime(time: number): this {
    this.time = time
    return this
  }

  /// Replace the current selection with the given slice.
  /**
   * 用指定的文档切片替换当前选区
   * @param slice 用于替换的文档切片
   * @returns 
   */
  replaceSelection(slice: Slice): this {
    this.selection.replace(this, slice)
    return this
  }

  /// Replace the selection with the given node. When `inheritMarks` is
  /// true and the content is inline, it inherits the marks from the
  /// place where it is inserted.
  /**
   * 用指定的节点替换选区。当`inheritMarks`为true且选区为内联内容时，被插入的节点将会继承被插入的
   * 地方的marks
   * @param node 节点
   * @param inheritMarks 是否继承marks
   * @returns 
   */
  replaceSelectionWith(node: Node, inheritMarks = true): this {
    let selection = this.selection
    if (inheritMarks)
      node = node.mark(this.storedMarks || (selection.empty ? selection.$from.marks() : (selection.$from.marksAcross(selection.$to) || Mark.none)))
    selection.replaceWith(this, node)
    return this
  }

  /// Delete the selection.
  /** 删除选区 */
  deleteSelection(): this {
    // 因为replace没有传入用于替换的内容所以直接删除了该选区
    this.selection.replace(this)
    return this
  }

  /// Replace the given range, or the selection if no range is given,
  /// with a text node containing the given string.
  /**
   * 用一个包含指定文本的文本节点替换指定的范围，如果没有指定范围则替换选区  
   * 光标也是一类选区 锚点和头部在一起
   * @param text 文本内容
   * @param from 开始位置
   * @param to 结束位置
   * @returns 
   */
  insertText(text: string, from?: number, to?: number): this {
    let schema = this.doc.type.schema
    if (from == null) {
      if (!text) return this.deleteSelection()
      return this.replaceSelectionWith(schema.text(text), true)
    } else {
      if (to == null) to = from
      if (!text) return this.deleteRange(from, to)
      let marks = this.storedMarks
      if (!marks) {
        let $from = this.doc.resolve(from)
        marks = to == from ? $from.marks() : $from.marksAcross(this.doc.resolve(to))
      }
      this.replaceRangeWith(from, to, schema.text(text, marks))
      if (!this.selection.empty) this.setSelection(Selection.near(this.selection.$to))
      return this
    }
  }

  /// Store a metadata property in this transaction, keyed either by
  /// name or by plugin.
  /**
   * 在tr上存储一个元数据，键值只能是字符串形式的name或者插件
   * 只是在事务上存储一些元数据
   * @param key 键
   * @param value 值
   * @returns 当前事务
   */
  setMeta(key: string | Plugin | PluginKey, value: any): this {
    this.meta[typeof key == "string" ? key : key.key] = value
    return this
  }

  /// Retrieve a metadata property for a given name or plugin.
  /**
   * 根据传入的键返回对应的值
   * @param key 键
   * @returns 存储在tr上的键所对应的值
   */
  getMeta(key: string | Plugin | PluginKey) {
    return this.meta[typeof key == "string" ? key : key.key]
  }

  /// Returns true if this transaction doesn't contain any metadata,
  /// and can thus safely be extended.
  /** 如果当前transaction不包含任何的metadata则返回true，这样当前transaction就能被安全的继承了 */
  get isGeneric() {
    for (let _ in this.meta) return false
    return true
  }

  /// Indicate that the editor should scroll the selection into view
  /// when updated to the state produced by this transaction.
  /** 表明编辑器应该将选区滚动到视图中  当被更新到由当前transaction产生的状态时 */
  scrollIntoView(): this {
    this.updated |= UPDATED_SCROLL
    return this
  }

  /// True when this transaction has had `scrollIntoView` called on it.
  /** 当前transaction调用了`scrollIntoView方法则返回true */
  get scrolledIntoView() {
    return (this.updated & UPDATED_SCROLL) > 0
  }
}
