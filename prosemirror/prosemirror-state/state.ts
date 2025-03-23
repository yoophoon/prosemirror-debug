import {Node, Mark, Schema} from "prosemirror-model"

import {Selection, TextSelection} from "./selection"
import {Transaction} from "./transaction"
import {Plugin, StateField} from "./plugin"

/**
 * 
 * @param f 需要绑定的函数
 * @param self 被绑定的对象
 * @returns 如果绑定成功则返回绑定过的函数，如果`self`是假值则返回true，如果`f`是假值则返回f
 */
function bind<T extends Function>(f: T, self: any): T {
  return !self || !f ? f : f.bind(self)
}

//MARK class FieldDesc
/**
 * 字段描述对象，prosemirror的一些概念如doc\selection\marks\scrollToSelection\plugin
 * 包含init、apply两个方法，自重init会在实例化EditorState时调用，而apply则是在用户交互时调用
 */
class FieldDesc<T> {
  /**
   * 一般在EditorState.create创建一个新的状态用来初始化
   * @param config 编辑器状态配置
   * @param instance 编辑器状态
   */
  init: (config: EditorStateConfig, instance: EditorState) => T
  /**
   * 一般在EditorState.apply应用一个新的tr时用来更新
   * @param tr 用于更新状态的事务
   * @param value 新的状态值
   * @param oldState 更新之前的状态
   * @param newState 用于本次更新的新状态 so,order matters
   */
  apply: (tr: Transaction, value: T, oldState: EditorState, newState: EditorState) => T
  
  /**
   * 用于构造一个字段描述对象并把状态字段的init,apply函数绑定到拥有状态的对象上并将其作为自身属性
   * @param name 用于索引当前字段对象的名称，传入的plugin一般会是其PluginKey
   * @param desc 状态字段
   * @param self 拥有状态的对象自身
   */
  constructor(readonly name: string, desc: StateField<any>, self?: any) {
    this.init = bind(desc.init, self)
    this.apply = bind(desc.apply, self)
  }
}

/**
 * 4个基础字段用来初始化、应用tr，state.config.fields指向这4个基础字段
 * 后续的plugin也会生成一个FieldDesc实例并被push进state.config.fields  
 * doc：文档内容  
 * selection：选区内容  
 * storedMarks：文档格式  
 * scrollToSelection：文档变动  
 */
const baseFields = [
  new FieldDesc<Node>("doc", {
    init(config) { return config.doc || config.schema!.topNodeType.createAndFill() },
    apply(tr) { return tr.doc }
  }),

  new FieldDesc<Selection>("selection", {
    init(config, instance) { return config.selection || Selection.atStart(instance.doc) },
    apply(tr) { return tr.selection }
  }),

  new FieldDesc<readonly Mark[] | null>("storedMarks", {
    init(config) { return config.storedMarks || null },
    apply(tr, _marks, _old, state) { return (state.selection as TextSelection).$cursor ? tr.storedMarks : null }
  }),

  new FieldDesc<number>("scrollToSelection", {
    init() { return 0 },
    apply(tr, prev) { return tr.scrolledIntoView ? prev + 1 : prev }
  })
]

// Object wrapping the part of a state object that stays the same
// across transactions. Stored in the state's `config` property.
// 包含state里不受tr影响的属性方法对象，被挂载在state.config下
class Configuration {
  fields: FieldDesc<any>[]
  plugins: Plugin[] = []
  pluginsByKey: {[key: string]: Plugin} = Object.create(null)
  /**
   * 拥有4个属性 fileds、plugins、pluginsByKey、schema，
   * 构造函数会将拥有状态的plugins转变为字段描述对象并push进`fields`属性
   * 内部会生成一个由plugin和pluginKey作为键值对的对象并由`pluginsByKey`指向这个对象
   * @param schema 将传入的schema对象创建为`configuration.schema`属性
   * @param plugins 将传入的plugins数组创建为`configuration.plugins`属性
   */
  constructor(readonly schema: Schema, plugins?: readonly Plugin[]) {
    this.fields = baseFields.slice()
    if (plugins) plugins.forEach(plugin => {
      if (this.pluginsByKey[plugin.key])
        throw new RangeError("Adding different instances of a keyed plugin (" + plugin.key + ")")
      this.plugins.push(plugin)
      this.pluginsByKey[plugin.key] = plugin
      if (plugin.spec.state)
        this.fields.push(new FieldDesc<any>(plugin.key, plugin.spec.state, plugin))
    })
  }
}

/// The type of object passed to
/// [`EditorState.create`](#state.EditorState^create).
//MARK interface EditorStateConfig
/**
 * 传给[EditorState.create](#state.EditorState.create)的类型对象
 */
export interface EditorStateConfig {
  /// The schema to use (only relevant if no `doc` is specified).
  /** 当doc属性没有被指定时才会使用 */
  schema?: Schema

  /// The starting document. Either this or `schema` _must_ be
  /// provided.
  /** 初始文档，doc或schema必须指定一个 */
  doc?: Node

  /// A valid selection in the document.
  /** 文档中一个有效的选区 */
  selection?: Selection

  /// The initial set of [stored marks](#state.EditorState.storedMarks).
  /** [stored marks](#state.EditorState.storeMarks)的初始集合 */
  storedMarks?: readonly Mark[] | null

  /// The plugins that should be active in this state.
  /** 当前状态应该被激活的插件 */
  plugins?: readonly Plugin[]
}
/// The state of a ProseMirror editor is represented by an object of
/// this type. A state is a persistent data structure—it isn't
/// updated, but rather a new state value is computed from an old one
/// using the [`apply`](#state.EditorState.apply) method.
///
/// A state holds a number of built-in fields, and plugins can
/// [define](#state.PluginSpec.state) additional fields.
//MARK class EditorState
/**
 * prosemirror编辑器的状态由这个类实例描述。
 * 状态是一个不会被更新但可以通过使用`apply`方法从前一个旧的state计算出新的状态值的持久数据结构  
 * 状态保存着大量的内置字段并且插件也可以通过pluginSpec.state定义额外的字段
 * (只有插件定义了state属性才会被prosemirror内部认为是字段)
 */
export class EditorState {
  /// @internal
  /**
   * 一般是通过EditorState.create方法生成一个状态而不是直接new一个，因为构造函数所做的事情
   * 仅仅是把传入的配置对象作为自身的一个属性保留而初始化工作的放在EditorState.create方法里
   * @param config 状态的配置对象
   */
  constructor(
    /// @internal
    readonly config: Configuration
  ) {}

  /// The current document.
  /** 当前文档 */
  doc!: Node

  /// The selection.
  /** 选区 */
  selection!: Selection

  /// A set of marks to apply to the next input. Will be null when
  /// no explicit marks have been set.
  /** 要被应用于下次输入的mark集合。如果没有设置mark则会是null */
  storedMarks!: readonly Mark[] | null

  /// The schema of the state's document.
  /** 状态文档的架构 */
  get schema(): Schema {
    return this.config.schema
  }

  /// The plugins that are active in this state.
  /** 状态中激活的所有插件 */
  get plugins(): readonly Plugin[] {
    return this.config.plugins
  }

  /// Apply the given transaction to produce a new state.
  /** 应用给定的事务并产生一个新的state */
  apply(tr: Transaction): EditorState {
    return this.applyTransaction(tr).state
  }

  /// @internal
  /// 在apply->applytransaction时调用
  /// 函数会调用plugin的filterTransaction函数方便过滤transaction
  /**
   * 调用所有插件的filterTransaction函数对新事务进行过滤
   * @param tr 新产生的事务
   * @param ignore 指定应该跳过的插件即这个插件的filterTransaction函数不会被调用
   * @returns false则这个新事务会被取消true新事务继续应用于新状态
   */
  filterTransaction(tr: Transaction, ignore = -1) {
    for (let i = 0; i < this.config.plugins.length; i++)
      if (i != ignore) {
        let plugin = this.config.plugins[i];
        if (
          plugin.spec.filterTransaction &&
          !plugin.spec.filterTransaction.call(plugin, tr, this)
        )
          return false;
      }
    return true
  }

  /// Verbose variant of [`apply`](#state.EditorState.apply) that
  /// returns the precise transactions that were applied (which might
  /// be influenced by the [transaction
  /// hooks](#state.PluginSpec.filterTransaction) of
  /// plugins) along with the new state.
  /**
   * `editorState.apply`的实现方法。返回被应用于新状态的精确的tr
   * (不只1个，插件也能添加事务，这些tr可能是被插件的钩子(pluginSpec.filterTransaction)影响所产生的)
   * @param rootTr 触发此次更新的transaction期间可能会因为其他插件的作用产生新的tr
   * @returns 应用指定transaction的state以及期间产生的所有transaction
   */
  applyTransaction(rootTr: Transaction): {state: EditorState, transactions: readonly Transaction[]} {
    //有插件阻止了这次事务
    if (!this.filterTransaction(rootTr)) return {state: this, transactions: []}

    let trs = [rootTr], newState = this.applyInner(rootTr), seen = null
    // This loop repeatedly gives plugins a chance to respond to
    // transactions as new transactions are added, making sure to only
    // pass the transactions the plugin did not see before.
    // 这段代码是插件能添加事务的基础，一段非常漂亮的循环代码
    // 这个循环会重复的给插件机会响应其他插件新产生的事务，确保只将插件没有处理过的事务传给插件处理
    for (;;) {
      let haveNew = false
      for (let i = 0; i < this.config.plugins.length; i++) {
        let plugin = this.config.plugins[i]
        if (plugin.spec.appendTransaction) {
          let n = seen ? seen[i].n : 0, oldState = seen ? seen[i].state : this
          let tr = n < trs.length &&
              plugin.spec.appendTransaction.call(plugin, n ? trs.slice(n) : trs, oldState, newState)
          if (tr && newState.filterTransaction(tr, i)) {
            tr.setMeta("appendedTransaction", rootTr)
            if (!seen) {
              seen = []
              for (let j = 0; j < this.config.plugins.length; j++)
                seen.push(j < i ? {state: newState, n: trs.length} : {state: this, n: 0})
            }
            trs.push(tr)
            newState = newState.applyInner(tr)
            haveNew = true
          }
          if (seen) seen[i] = {state: newState, n: trs.length}
        }
      }
      if (!haveNew) return {state: newState, transactions: trs}
    }
  }

  /// @internal
  /**
   * 创建一个根据事务更新过内部字段的EditorState实例
   * @param tr 用于更新的新事务
   * @returns 字段已经更新的EditorState实例
   */
  applyInner(tr: Transaction) {
    if (!tr.before.eq(this.doc)) throw new RangeError("Applying a mismatched transaction")
    let newInstance = new EditorState(this.config), fields = this.config.fields
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i]
      //更新字段
      ;(newInstance as any)[field.name] = field.apply(tr, (this as any)[field.name], this, newInstance)
    }
    return newInstance
  }

  /// Accessor that constructs and returns a new [transaction](#state.Transaction) from this state.
  /** 从当前状态构建并返回一个新的事务的访问器 */
  get tr(): Transaction { return new Transaction(this) }

  /// Create a new state.
  //MARK EditorState.create
  /**
   * 这个函数会初始化state4个基础字段，如果传入的config包含plugin的话，state会将每个plugin的
   * key做为新的字段名称而其值则为pluginState
   * @param config 传入的配置，配置内容应该符合EditorStateConfig
   * @returns 创建一个EditorState实例，将其初始化并返回
   */
  static create(config: EditorStateConfig) {
    // 初始化state的config
    let $config = new Configuration(config.doc ? config.doc.type.schema : config.schema!, config.plugins)
    let instance = new EditorState($config)
    for (let i = 0; i < $config.fields.length; i++)
      (instance as any)[$config.fields[i].name] = $config.fields[i].init(config, instance)
    return instance
  }

  /// Create a new state based on this one, but with an adjusted set
  /// of active plugins. State fields that exist in both sets of
  /// plugins are kept unchanged. Those that no longer exist are
  /// dropped, and those that are new are initialized using their
  /// [`init`](#state.StateField.init) method, passing in the new
  /// configuration object..
  /**
   * 根据当前的状态创建一个新的拥有调整过的插件的集合的状态。两个状态都存在的字段将会保持不变
   * 剔除的字段则会被抛弃，新添加的字段则会通过它们的init方法进行初始化并由state.config保存
   * （带state属性的插件规范会被内部转换成一个field）
   * @param config 新的插件集合
   * @returns 新的state
   */
  reconfigure(config: {
    /// New set of active plugins.
    plugins?: readonly Plugin[]    
  }) {
    let $config = new Configuration(this.schema, config.plugins)
    let fields = $config.fields, instance = new EditorState($config)
    for (let i = 0; i < fields.length; i++) {
      let name = fields[i].name
      ;(instance as any)[name] = this.hasOwnProperty(name) ? (this as any)[name] : fields[i].init(config, instance)
    }
    return instance
  }

  /// Serialize this state to JSON. If you want to serialize the state
  /// of plugins, pass an object mapping property names to use in the
  /// resulting JSON object to plugin objects. The argument may also be
  /// a string or number, in which case it is ignored, to support the
  /// way `JSON.stringify` calls `toString` methods.
  /**
   * 将状态序列化为JSON。如果想序列化plugin的状态，传递一个对象映射属性名称用于JSON指向插件
   * 参数也可以是字符串或者数字（会被忽略）以支持`JSON.stringify`调用`toString`方法
   * @param pluginFields 插件字段对象，其键名会作为JSON的键而其插件的toJSON返回的值则会作为
   * JSON中该键对应的值
   * @returns 返回一个JSON对象
   */
  toJSON(pluginFields?: {[propName: string]: Plugin}): any {
    let result: any = {doc: this.doc.toJSON(), selection: this.selection.toJSON()}
    if (this.storedMarks) result.storedMarks = this.storedMarks.map(m => m.toJSON())
    if (pluginFields && typeof pluginFields == "object")
      for (let prop in pluginFields) {
        if (prop == "doc" || prop == "selection")
          throw new RangeError(
            "The JSON fields `doc` and `selection` are reserved"
          );
        let plugin = pluginFields[prop],
          state = plugin.spec.state;
        if (state && state.toJSON)
          result[prop] = state.toJSON.call(plugin, (this as any)[plugin.key]);
      }
    return result
  }

  /// Deserialize a JSON representation of a state. `config` should
  /// have at least a `schema` field, and should contain array of
  /// plugins to initialize the state with. `pluginFields` can be used
  /// to deserialize the state of plugins, by associating plugin
  /// instances with the property names they use in the JSON object.
  /**
   * 反序列化state的JSON对象。`config`应该至少有`schema`和用于初始化插件状态的`plugins`字段，
   * `pluginFields`通过用于JSON对象的属性名关联的插件实例来反序列化插件的状态
   * @param config 用于生成State的配置
   * @param json 反序列化的JSON对象
   * @param pluginFields 插件字段
   * @returns 一个新的state
   */
  static fromJSON(config: {
    /// The schema to use.
    schema: Schema
    /// The set of active plugins.
    plugins?: readonly Plugin[]
  }, json: any, pluginFields?: {[propName: string]: Plugin}) {
    if (!json) throw new RangeError("Invalid input for EditorState.fromJSON")
    if (!config.schema) throw new RangeError("Required config field 'schema' missing")
    let $config = new Configuration(config.schema, config.plugins)
    let instance = new EditorState($config)
    $config.fields.forEach(field => {
      if (field.name == "doc") {
        instance.doc = Node.fromJSON(config.schema, json.doc)
      } else if (field.name == "selection") {
        instance.selection = Selection.fromJSON(instance.doc, json.selection)
      } else if (field.name == "storedMarks") {
        if (json.storedMarks) instance.storedMarks = json.storedMarks.map(config.schema.markFromJSON)
      } else {
        if (pluginFields) for (let prop in pluginFields) {
          let plugin = pluginFields[prop], state = plugin.spec.state
          if (plugin.key == field.name && state && state.fromJSON &&
              Object.prototype.hasOwnProperty.call(json, prop)) {
            // This field belongs to a plugin mapped to a JSON field, read it from there.
            ;(instance as any)[field.name] = state.fromJSON.call(plugin, config, json[prop], instance)
            return
          }
        }
        ;(instance as any)[field.name] = field.init(config, instance)
      }
    })
    return instance
  }
}
