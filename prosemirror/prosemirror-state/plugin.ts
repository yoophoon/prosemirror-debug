import {type EditorView, type EditorProps} from "prosemirror-view"
import {EditorState, EditorStateConfig} from "./state"
import {Transaction} from "./transaction"

/// This is the type passed to the [`Plugin`](#state.Plugin)
/// constructor. It provides a definition for a plugin.
//MARK interface PluginSpec
/**
 * 传给`plugin`构造函数的数据类型。为插件提供了定义
 */
export interface PluginSpec<PluginState> {
  /// The [view props](#view.EditorProps) added by this plugin. Props
  /// that are functions will be bound to have the plugin instance as
  /// their `this` binding.
  /** 通过插件增加的view props。函数类型的Props会被绑定到持有plugin的实例 */
  props?: EditorProps<Plugin<PluginState>>

  /// Allows a plugin to define a [state field](#state.StateField), an
  /// extra slot in the state object in which it can keep its own data.
  /** 允许插件定义一个状态字段，state对象中的一个额外的可以保存自己的数据的插槽 */
  state?: StateField<PluginState>

  /// Can be used to make this a keyed plugin. You can have only one
  /// plugin with a given key in a given state, but it is possible to
  /// access the plugin's configuration and state through the key,
  /// without having access to the plugin instance object.
  /** 让插件具有一个键。状态对象里一个key只能对应一个插件，
   * 可以用这个键来访问插件的配置和状态而不用访问插件的实例 */
  key?: PluginKey

  /// When the plugin needs to interact with the editor view, or
  /// set something up in the DOM, use this field. The function
  /// will be called when the plugin's state is associated with an
  /// editor view.
  /** 当插件需要与编辑器视图交互或在DOM上设置一些属性时使用这个字段。
   * 函数会在插件的状态被关联到一个编辑器视图的时候调用。（设置一些dom与用户交互）
   * @param view 编辑器视图
   * @returns 一个pluginView对象
   */
  view?: (view: EditorView) => PluginView

  /// When present, this will be called before a transaction is
  /// applied by the state, allowing the plugin to cancel it (by
  /// returning false).
  /** 当设置时，函数会在事务被应用到state前被调用，允许插件取消该事务（通过返回false）
   * @param tr 要被应用于的事务
   * @param state 当前状态
   * @returns false则取消事务 
   */
  filterTransaction?: (tr: Transaction, state: EditorState) => boolean

  /// Allows the plugin to append another transaction to be applied
  /// after the given array of transactions. When another plugin
  /// appends a transaction after this was called, it is called again
  /// with the new state and new transactions—but only the new
  /// transactions, i.e. it won't be passed transactions that it
  /// already saw.
  /**
   * 允许插件向已经应用过事务的数组中添加一个新的事务。当其他插件在这之后也添加了新的事务，
   * 这个函数会重新调用并传入新的状态和事务，已经应用过的事务将不会被传递到这个函数
   * @param transactions 事务数组
   * @param oldState 上一次更新的state
   * @param newState 新的state
   * @returns 根据事务数组生成一个新的tr
   */
  appendTransaction?: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => Transaction | null | undefined

  /// Additional properties are allowed on plugin specs, which can be
  /// read via [`Plugin.spec`](#state.Plugin.spec).
  /** 额外的属性允许被指定在plugin规范上，能通过Plugin.spec读取 */
  [key: string]: any
}

/// A stateful object that can be installed in an editor by a
/// [plugin](#state.PluginSpec.view).
/** 通过插件[pluginSpec.view]生成的可以被安装到编辑器的带状态的对象 */
export type PluginView = {
  /// Called whenever the view's state is updated.
  /**
   * 当视图状态被更新时被调用
   * @param view 当前编辑器的视图对象
   * @param prevState 上一个状态
   * @returns void
   */
  update?: (view: EditorView, prevState: EditorState) => void

  /// Called when the view is destroyed or receives a state
  /// with different plugins.
  /**
   * 当视图被摧毁或者接收一个包含另一个插件的状态时被摧毁
   * @returns void
   */
  destroy?: () => void
}

function bindProps(obj: {[prop: string]: any}, self: any, target: {[prop: string]: any}) {
  for (let prop in obj) {
    let val = obj[prop]
    if (val instanceof Function) val = val.bind(self)
    else if (prop == "handleDOMEvents") val = bindProps(val, self, {})
    target[prop] = val
  }
  return target
}

/// Plugins bundle functionality that can be added to an editor.
/// They are part of the [editor state](#state.EditorState) and
/// may influence that state and the view that contains it.
export class Plugin<PluginState = any> {
  /// Create a plugin.
  constructor(
    /// The plugin's [spec object](#state.PluginSpec).
    readonly spec: PluginSpec<PluginState>
  ) {
    if (spec.props) bindProps(spec.props, this, this.props)
    this.key = spec.key ? spec.key.key : createKey("plugin")
  }

  /// The [props](#view.EditorProps) exported by this plugin.
  readonly props: EditorProps<Plugin<PluginState>> = {}

  /// @internal
  key: string

  /// Extract the plugin's state field from an editor state.
  getState(state: EditorState): PluginState | undefined { return (state as any)[this.key] }
}

/// A plugin spec may provide a state field (under its
/// [`state`](#state.PluginSpec.state) property) of this type, which
/// describes the state it wants to keep. Functions provided here are
/// always called with the plugin instance as their `this` binding.
/**
 * 一个插件配置(pluginSpec，用户定义的插件内容)可能提供一个state字段
 * [state](state.pluginSpec.state)，这个字段描述了插件想要保留的状态值。
 * 字段里提供的函数总是自身的插件实例调用(prosemirror内部对这些函数做了绑定处理)
 */
export interface StateField<T> {
  /// Initialize the value of the field. `config` will be the object
  /// passed to [`EditorState.create`](#state.EditorState^create). Note
  /// that `instance` is a half-initialized state instance, and will
  /// not have values for plugin fields initialized after this one.
  /**
   * 
   * @param config EditorStateConfig的实例
   * @param instance 
   * @returns 
   */
  init: (config: EditorStateConfig, instance: EditorState) => T

  /// Apply the given transaction to this state field, producing a new
  /// field value. Note that the `newState` argument is again a partially
  /// constructed state does not yet contain the state from plugins
  /// coming after this one.
  apply: (tr: Transaction, value: T, oldState: EditorState, newState: EditorState) => T

  /// Convert this field to JSON. Optional, can be left off to disable
  /// JSON serialization for the field.
  toJSON?: (value: T) => any

  /// Deserialize the JSON representation of this field. Note that the
  /// `state` argument is again a half-initialized state.
  fromJSON?: (config: EditorStateConfig, value: any, state: EditorState) => T
}

const keys = Object.create(null)
/**
 * 如果构造plugin时不指定key则plugin实例的key=createKey('plugin')
 * 这个函数会给每个未分配key的plugin指定一个key，key的命名规则 plugin$,plugin$1,plugin$2...
 * 常量keys记录每种类型的plugin实例的数量
 * @param name Plugin构造函数传入的值:plugin,PluginKey实例则为构造函数传入的name
 * @returns 如果是第一个未分配key的plugin则返回plugin$，后续的未分配key的plugin则返回plugin$n-1
 */
function createKey(name: string) {
  if (name in keys) return name + "$" + ++keys[name]
  keys[name] = 0
  return name + "$"
}

/// A key is used to [tag](#state.PluginSpec.key) plugins in a way
/// that makes it possible to find them, given an editor state.
/// Assigning a key does mean only one plugin of that type can be
/// active in a state.
export class PluginKey<PluginState = any> {
  /// @internal
  key: string

  /// Create a plugin key.
  constructor(name = "key") { this.key = createKey(name) }

  /// Get the active plugin with this key, if any, from an editor
  /// state.
  get(state: EditorState): Plugin<PluginState> | undefined { return state.config.pluginsByKey[this.key] }

  /// Get the plugin's state from an editor state.
  getState(state: EditorState): PluginState | undefined { return (state as any)[this.key] }
}
