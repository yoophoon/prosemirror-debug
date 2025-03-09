import OrderedMap from "orderedmap"

import {Node, TextNode} from "./node"
import {Fragment} from "./fragment"
import {Mark} from "./mark"
import {ContentMatch} from "./content"
import {DOMOutputSpec} from "./to_dom"
import {ParseRule, TagParseRule} from "./from_dom"

/// An object holding the attributes of a node.
/** 存储节点属性的对象 */
export type Attrs = {readonly [attr: string]: any}

// For node types where all attrs have a default value (or which don't
// have any attributes), build up a single reusable default attribute
// object, and use it for all nodes that don't specify specific
// attributes.
/**
 * 对于节点类型所有的属性都应该有其默认值（或者没有该属性），
 * 构建单例可复用的默认属性对象并将其用于所有未指定特定属性的节点
 * @param attrs 属性对象，结构类似于attrs[name].default
 * @returns 包含传入属性对象的默认值的对象
 */
function defaultAttrs(attrs: {[name: string]: Attribute}) {
  let defaults = Object.create(null)
  for (let attrName in attrs) {
    let attr = attrs[attrName]
    if (!attr.hasDefault) return null
    defaults[attrName] = attr.default
  }
  return defaults
}
/**
 * 计算属性，如果传入的value中有attrs属性名对应的值则将该属性名和值作为返回对象的键值队
 * 否则取attrs中关于该属性名的默认值，如果value不提供该值且attrs又无其对应名称的默认值则抛出错误
 * @param attrs 属性对象
 * @param value 节点属性对象
 * @returns 返回属性名与属性值的键值对
 */
function computeAttrs(attrs: {[name: string]: Attribute}, value: Attrs | null) {
  let built = Object.create(null)
  for (let name in attrs) {
    let given = value && value[name]
    if (given === undefined) {
      let attr = attrs[name]
      if (attr.hasDefault) given = attr.default
      else throw new RangeError("No value supplied for attribute " + name)
    }
    built[name] = given
  }
  return built
}
/**
 * 检查属性，如果values的键名不在attrs中则直接抛出错误，然后分别采用attrs的属性对象的validate方法对value的值进行验证
 * @param attrs 属性对象
 * @param values 值对象
 * @param type 类型
 * @param name 名称
 */
export function checkAttrs(attrs: {[name: string]: Attribute}, values: Attrs, type: string, name: string) {
  for (let name in values)
    if (!(name in attrs)) throw new RangeError(`Unsupported attribute ${name} for ${type} of type ${name}`)
  for (let name in attrs) {
    let attr = attrs[name]
    if (attr.validate) attr.validate(values[name])
  }
}
/**
 * @param typeName 类型名称
 * @param attrs 属性对象规范集合
 * @returns 将传入的属性对象规范转换成属性对象集合
 */
function initAttrs(typeName: string, attrs?: {[name: string]: AttributeSpec}) {
  let result: {[name: string]: Attribute} = Object.create(null)
  if (attrs) for (let name in attrs) result[name] = new Attribute(typeName, name, attrs[name])
  return result
}

/// Node types are objects allocated once per `Schema` and used to
/// [tag](#model.Node.type) `Node` instances. They contain information
/// about the node type, such as its name and what kind of node it
/// represents.
/**
 * 每个`Schema`分配一个节点类型并被用来标记`model.Node.type`节点实例。它们包含节点类型的信息
 * 比如它的名字和它表示的节点的种类
 */
export class NodeType {
  /// @internal
  /** 节点类型所属的组 */
  groups: readonly string[]
  /** attrs与defaultAttrs两者的区别：前者存储的是该值的标准 后者才是真正的值 */
  /// @internal
  /** 节点类型所包含的属性 键值为属性对象 */
  attrs: {[name: string]: Attribute}
  /// @internal
  /** 节点类型所包含的默认属性 键值为其名称所对应属性对象的类型的值*/
  defaultAttrs: Attrs

  /// @internal
  /**
   * 构造一个nodeType对象
   * @param name 节点类型的名称
   * @param schema 节点类型所属架构
   * @param spec 节点的规范（schema 由 spec生成）
   */
  constructor(
    /// The name the node type has in this schema.
    /** 当前架构中该节点类型的名称 */
    readonly name: string,
    /// A link back to the `Schema` the node type belongs to.
    /** 当前节点类型所属的架构 */
    readonly schema: Schema,
    /// The spec that this type is based on
    /** 生成该节点类型的规范 */
    readonly spec: NodeSpec
  ) {
    this.groups = spec.group ? spec.group.split(" ") : []
    /** 根据传入的attributeSpec生成其对应的属性对象描述符 */
    this.attrs = initAttrs(name, spec.attrs)
    /** 真正存储该属性值的对象 */
    this.defaultAttrs = defaultAttrs(this.attrs)

    // Filled in later
    ;(this as any).contentMatch = null
    ;(this as any).inlineContent = null

    this.isBlock = !(spec.inline || name == "text")
    this.isText = name == "text"
  }

  /// True if this node type has inline content.
  /** 如果当前节点类型拥有内联内容节点则为true */
  inlineContent!: boolean
  /// True if this is a block type
  /** 如果当前节点类型为块节点则为true */
  isBlock: boolean
  /// True if this is the text node type.
  /** 如果当前节点类型为文本节点类型则为true */
  isText: boolean

  /// True if this is an inline type.
  /** 如果当前节点类型为内联类型则为true 节点的本质只有两种类型 内联节点类型和块节点类型 */
  get isInline() { return !this.isBlock }

  /// True if this is a textblock type, a block that contains inline
  /// content.
  /** 如果是文本块类型的节点（节点本身是块但其内容为内联节点）则为true */
  get isTextblock() { return this.isBlock && this.inlineContent }

  /// True for node types that allow no content.
  /** 节点类型允许`no content`则为true 即prosemirror概念中的叶子节点  
   * （这里的no content指node.content=[]，典型的就是textNodeType，没有更深层次的子节点了） */
  get isLeaf() { return this.contentMatch == ContentMatch.empty }

  /// True when this node is an atom, i.e. when it does not have
  /// directly editable content.
  /** 当前节点是原子节点则为true，如当它没有能够直接编辑的内容时。
   * （叶子节点必是原子节点或者通过节点规范(nodeSpec)定义了atom属性为true时的节点也为原子节点）
   * （其在视图上的表现及与输入的交互行为依然可以被定义）
   */
  get isAtom() { return this.isLeaf || !!this.spec.atom }

  /// Return true when this node type is part of the given
  /// [group](#model.NodeSpec.group).
  /**
   * @param group 给定的节点组名称
   * @returns 如果给定的节点组是当前节点组集合的成员则返回true
   */
  isInGroup(group: string) {
    return this.groups.indexOf(group) > -1
  }

  /// The starting match of the node type's content expression.
  /** 节点类型的内容表达式的初始匹配模式 */
  contentMatch!: ContentMatch

  /// The set of marks allowed in this node. `null` means all marks
  /// are allowed.
  /** 当前节点允许的marks集合。`null`意味着所有的marks都能应用于当前节点 */
  markSet: readonly MarkType[] | null = null

  /// The node type's [whitespace](#model.NodeSpec.whitespace) option.
  /** 当前节点类型的[`whitespace`](#model.NodeSpec.whitespace)选项 */
  get whitespace(): "pre" | "normal" {
    return this.spec.whitespace || (this.spec.code ? "pre" : "normal")
  }

  /// Tells you whether this node type has any required attributes.
  /** 表明当前节点类型是否存在必要的属性 */
  hasRequiredAttrs() {
    for (let n in this.attrs) if (this.attrs[n].isRequired) return true
    return false
  }

  /// Indicates whether this node allows some of the same content as
  /// the given node type.
  /**
   * 表明当前节点是否允许指定节点类型的内容，允许则返回true否则false
   * @param other 指定的节点类型
   */
  compatibleContent(other: NodeType) {
    return this == other || this.contentMatch.compatible(other.contentMatch)
  }

  /// @internal
  /**
   * 获取当前节点的属性，如果传入的是null则会直接返回当前节点类型的默认属性，否则属性值会被传入的attrs对应的值替换
   * @param attrs 指定的attrsSpec对象或者null
   * @returns 返回符合当前节点属性的键值对对象
   */
  computeAttrs(attrs: Attrs | null): Attrs {
    if (!attrs && this.defaultAttrs) return this.defaultAttrs
    else return computeAttrs(this.attrs, attrs)
  }

  /// Create a `Node` of this type. The given attributes are
  /// checked and defaulted (you can pass `null` to use the type's
  /// defaults entirely, if no required attributes exist). `content`
  /// may be a `Fragment`, a node, an array of nodes, or
  /// `null`. Similarly `marks` may be `null` to default to the empty
  /// set of marks.
  /**
   * 创建当前节点类型的节点。传入的属性对象会被检查并被赋予默认值（也可以传入null以完全使用节点类型的默认值，
   * 如果没有必须指定的属性存在的话）,`content`也许是一个文档片段、节点、节点数组或者null。
   * 相似的`marks`也可能是null，这样创建出来的node实例的marks就是空的
   * @param attrs 属性对象
   * @param content 内容
   * @param marks marks
   * @returns 一个节点实例
   */
  create(attrs: Attrs | null = null, content?: Fragment | Node | readonly Node[] | null, marks?: readonly Mark[]) {
    if (this.isText) throw new Error("NodeType.create can't construct text nodes")
    return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks))
  }

  /// Like [`create`](#model.NodeType.create), but check the given content
  /// against the node type's content restrictions, and throw an error
  /// if it doesn't match.
  /**
   * 与`create`方法相似，但会严格的检查传入的content与当前节点类型的内容的限制如果不匹配则会抛出错误
   * @param attrs 属性对象
   * @param content 内容
   * @param marks marks实例
   * @returns 一个节点实例
   */
  createChecked(attrs: Attrs | null = null, content?: Fragment | Node | readonly Node[] | null, marks?: readonly Mark[]) {
    content = Fragment.from(content)
    this.checkContent(content)
    return new Node(this, this.computeAttrs(attrs), content, Mark.setFrom(marks))
  }

  /// Like [`create`](#model.NodeType.create), but see if it is
  /// necessary to add nodes to the start or end of the given fragment
  /// to make it fit the node. If no fitting wrapping can be found,
  /// return null. Note that, due to the fact that required nodes can
  /// always be created, this will always succeed if you pass null or
  /// `Fragment.empty` as content.
  createAndFill(attrs: Attrs | null = null, content?: Fragment | Node | readonly Node[] | null, marks?: readonly Mark[]) {
    attrs = this.computeAttrs(attrs)
    content = Fragment.from(content)
    if (content.size) {
      let before = this.contentMatch.fillBefore(content)
      if (!before) return null
      content = before.append(content)
    }
    let matched = this.contentMatch.matchFragment(content)
    let after = matched && matched.fillBefore(Fragment.empty, true)
    if (!after) return null
    return new Node(this, attrs, (content as Fragment).append(after), Mark.setFrom(marks))
  }

  /// Returns true if the given fragment is valid content for this node
  /// type.
  /**
   * @param content 如果传入的文档片段是当前节点类型的有效内容则返回true
   * @returns 
   */
  validContent(content: Fragment) {
    let result = this.contentMatch.matchFragment(content)
    if (!result || !result.validEnd) return false
    for (let i = 0; i < content.childCount; i++)
      if (!this.allowsMarks(content.child(i).marks)) return false
    return true
  }

  /// Throws a RangeError if the given fragment is not valid content for this
  /// node type.
  /// @internal
  /**
   * @param content 如果传入的文档片段不是当前节点类型的有效内容则抛出错误
   */
  checkContent(content: Fragment) {
    if (!this.validContent(content))
      throw new RangeError(`Invalid content for node ${this.name}: ${content.toString().slice(0, 50)}`)
  }

  /// @internal
  /**
   * @param attrs 检查传入的属性对象是否满足当前节点类型的属性对象描述符
   */
  checkAttrs(attrs: Attrs) {
    checkAttrs(this.attrs, attrs, "node", this.name)
  }

  /// Check whether the given mark type is allowed in this node.
  /**
   * 检查当前节点类型是否允许传入的markType
   * @param markType 需用应用到当前节点类型的markType
   * @returns 允许则返回true 否则返回false
   */
  allowsMarkType(markType: MarkType) {
    return this.markSet == null || this.markSet.indexOf(markType) > -1
  }

  /// Test whether the given set of marks are allowed in this node.
  /**
   * 测试当前节点类型是否允许传入的marksSet
   * 会对传入的marksSet进行遍历如果存在当前节点不允许的markType则返回false
   * @param marks 需要应用到当前节点类型的markType集合
   * @returns 允许则返回true 否则返回false
   */
  allowsMarks(marks: readonly Mark[]) {
    if (this.markSet == null) return true
    for (let i = 0; i < marks.length; i++) if (!this.allowsMarkType(marks[i].type)) return false
    return true
  }

  /// Removes the marks that are not allowed in this node from the given set.
  /**
   * 从传入的marksSet中移除当前节点类型不允许的marks返回允许的marksSet
   * @param marks 需要应用于当前节点类型的marksType集合
   * @returns 返回能够用于当前节点类型的marksType集合
   */
  allowedMarks(marks: readonly Mark[]): readonly Mark[] {
    if (this.markSet == null) return marks
    let copy
    for (let i = 0; i < marks.length; i++) {
      if (!this.allowsMarkType(marks[i].type)) {
        if (!copy) copy = marks.slice(0, i)
      } else if (copy) {
        copy.push(marks[i])
      }
    }
    return !copy ? marks : copy.length ? copy : Mark.none
  }

  /// @internal
  /**
   * 有点像state.schema.nodes
   * 传入的nodes,schemaSpec必须要有doc节点或其内部指定一个topNode否则报错
   * 传入的nodes必须要有text节点并且text节点不能有attrs属性
   * @param nodes OrderedMap类型的nodeSpec
   * @param schema 节点架构
   * @returns 返回键名为nodeName键值为nodeType的对象
   */
  static compile<Nodes extends string>(nodes: OrderedMap<NodeSpec>, schema: Schema<Nodes>): {readonly [name in Nodes]: NodeType} {
    let result = Object.create(null)
    nodes.forEach((name, spec) => result[name] = new NodeType(name, schema, spec))

    let topType = schema.spec.topNode || "doc"
    if (!result[topType]) throw new RangeError("Schema is missing its top node type ('" + topType + "')")
    if (!result.text) throw new RangeError("Every schema needs a 'text' type")
    for (let _ in result.text.attrs) throw new RangeError("The text node type should not have attributes")

    return result
  }
}
/**
 * @param typeName 类型抿成
 * @param attrName 属性名称
 * @param type 属性类型
 * @returns 返回一个验证传入属性值验证的函数，如果传入的值的类型不符合参数type则抛出一个错误
 */
function validateType(typeName: string, attrName: string, type: string) {
  let types = type.split("|")
  return (value: any) => {
    let name = value === null ? "null" : typeof value
    if (types.indexOf(name) < 0) throw new RangeError(`Expected value of type ${types} for attribute ${attrName} on type ${typeName}, got ${name}`)
  }
}

// Attribute descriptors
/** 属性描述符，与AttributeSpec(属性规范)对应 [这与nodeSpec和nodeType对应]*/
class Attribute {
  /** 当前属性是否存在默认属性值的布尔值 */
  hasDefault: boolean
  /** 当前属性的默认值 */
  default: any
  /** 属性验证函数，验证传入的属性是否为有效属性，具体查看[`validate`](#AttributeSpec.validate) */
  validate: undefined | ((value: any) => void)
  /**
   * 根据传入的参数构造一个属性描述符
   * @param typeName 类型名称 应该是节点的类型名称
   * @param attrName 属性名称
   * @param options 属性规范（NodeSpec.Attrs）
   */
  constructor(typeName: string, attrName: string, options: AttributeSpec) {
    this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default")
    this.default = options.default
    this.validate = typeof options.validate == "string" ? validateType(typeName, attrName, options.validate) : options.validate
  }
  /** 有默认值的属性描述符就不是必须的 */
  get isRequired() {
    return !this.hasDefault
  }
}

// Marks

/// Like nodes, marks (which are associated with nodes to signify
/// things like emphasis or being part of a link) are
/// [tagged](#model.Mark.type) with type objects, which are
/// instantiated once per `Schema`.
/** 像节点一样，marks(与节点关联的用于标记某些像斜体或者链接的东西)也是被markType标记，
 * 每一个`Schema`都会实例化一次markType */
export class MarkType {
  /// @internal
  /** 属性描述符对象 */
  attrs: {[name: string]: Attribute}
  /// @internal
  /** 不包含的markSet */
  excluded!: readonly MarkType[]
  /// @internal
  /** 当前markType的实例 */
  instance: Mark | null

  /// @internal
  /**
   * 构建一个markType
   * @param name 当前markType的名称
   * @param rank 优先级(直译为等级、排名等)
   * @param schema 架构
   * @param spec 规范
   */
  constructor(
    /// The name of the mark type.
    /** markType的名字 */
    readonly name: string,
    /// @internal
    /** markType的优先级 */
    readonly rank: number,
    /// The schema that this mark type instance is part of.
    /** 当前markTypde的实例是架构的一部分 */
    readonly schema: Schema,
    /// The spec on which the type is based.
    /** markType的规范 */
    readonly spec: MarkSpec
  ) {
    this.attrs = initAttrs(name, spec.attrs)
    ;(this as any).excluded = null
    let defaults = defaultAttrs(this.attrs)
    this.instance = defaults ? new Mark(this, defaults) : null
  }

  /// Create a mark of this type. `attrs` may be `null` or an object
  /// containing only some of the mark's attributes. The others, if
  /// they have defaults, will be added.
  /**
   * 创建一个当前markType的实例。`attrs`也许是null或者包含部分当前markType的属性的对象
   * 其余的属性会用默认属性值替代
   * @param attrs 属性对象
   * @returns mark实例
   */
  create(attrs: Attrs | null = null) {
    if (!attrs && this.instance) return this.instance
    return new Mark(this, computeAttrs(this.attrs, attrs))
  }

  /// @internal
  /**
   * 有点像state.schema.marks
   * 将传入的OrderedMap类型的marks转换成marks实例对象，后添加进对象的优先级越
   * (不知道这个优先级是怎么用的，是越大优先级越高还是越小优先级越高)
   * @param marks OrderedMap类型的marks
   * @param schema 文档架构
   * @returns 返回mark实例对象
   */
  static compile(marks: OrderedMap<MarkSpec>, schema: Schema) {
    let result = Object.create(null), rank = 0
    marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec))
    return result
  }

  /// When there is a mark of this type in the given set, a new set
  /// without it is returned. Otherwise, the input set is returned.
  /**
   * 当传入的marksSet中存在当前markType时创建一个新的不包含当前markType实例的marksSet
   * 否则直接返回传入的marksSet
   * @param set marksSet
   * @returns 移除当前markType的markSet
   */
  removeFromSet(set: readonly Mark[]): readonly Mark[] {
    for (var i = 0; i < set.length; i++) if (set[i].type == this) {
      set = set.slice(0, i).concat(set.slice(i + 1))
      i--
    }
    return set
  }

  /// Tests whether there is a mark of this type in the given set.
  /**
   * 测试传入的marksSet集合中是否存在当前markType的实例
   * @param set marksSet集合
   * @returns 如果当前markType的实例存在于结合中则返回该实例否则返回undefined
   */
  isInSet(set: readonly Mark[]): Mark | undefined {
    for (let i = 0; i < set.length; i++)
      if (set[i].type == this) return set[i]
  }

  /// @internal
  /**
   * @param attrs 检查传入的属性对象是否满足当前mark类型的属性对象描述符
   */
  checkAttrs(attrs: Attrs) {
    checkAttrs(this.attrs, attrs, "mark", this.name)
  }

  /// Queries whether a given mark type is
  /// [excluded](#model.MarkSpec.excludes) by this one.
  /**
   * 查询传入的markType是否被当前markType排除
   * @param other markType
   * @returns 如果当前markType不包含传入的markType则返回true否则false
   */
  excludes(other: MarkType) {
    return this.excluded.indexOf(other) > -1
  }
}

/// An object describing a schema, as passed to the [`Schema`](#model.Schema)
/// constructor.
/** 用于描述schema的对象，被传递给`Schema`构造函数 */
export interface SchemaSpec<Nodes extends string = any, Marks extends string = any> {
  /// The node types in this schema. Maps names to
  /// [`NodeSpec`](#model.NodeSpec) objects that describe the node type
  /// associated with that name. Their order is significant—it
  /// determines which [parse rules](#model.NodeSpec.parseDOM) take
  /// precedence by default, and which nodes come first in a given
  /// [group](#model.NodeSpec.group).
  /**
   * schema中的nodeType。映射名字到描述关联该名字的节点类型的`nodeSpec`对象
   * 它们的顺序很重要因为这决定着哪个`parse rules`优先被默认执行以及哪个节点优先出现在给定的组
   */
  nodes: {[name in Nodes]: NodeSpec} | OrderedMap<NodeSpec>,

  /// The mark types that exist in this schema. The order in which they
  /// are provided determines the order in which [mark
  /// sets](#model.Mark.addToSet) are sorted and in which [parse
  /// rules](#model.MarkSpec.parseDOM) are tried.
  /** 当前架构的markTypes。它们的顺序决定了它们被存储的顺序以及`parse rules`尝试转换的顺序 */
  marks?: {[name in Marks]: MarkSpec} | OrderedMap<MarkSpec>

  /// The name of the default top-level node for the schema. Defaults
  /// to `"doc"`.
  /** 架构中的默认顶层节点的名字，默认为doc */
  topNode?: string
}

/// A description of a node type, used when defining a schema.
/** 被用来定义架构的节点类型的规范(a description of a node.../a specification of a node...) */
export interface NodeSpec {
  /// The content expression for this node, as described in the [schema
  /// guide](/docs/guide/#schema.content_expressions). When not given,
  /// the node does not allow any content.
  /** 当前节点类型的内容表达式，如schema guide中描述的。当没被指定时，这个节点不允许有内容 */
  content?: string

  /// The marks that are allowed inside of this node. May be a
  /// space-separated string referring to mark names or groups, `"_"`
  /// to explicitly allow all marks, or `""` to disallow marks. When
  /// not given, nodes with inline content default to allowing all
  /// marks, other nodes default to not allowing marks.
  /** 当前节点内部允许的marks。也许是一个以空格分隔的关于mark名字或组的字符串
   * `"_"`显示的允许所有marks，`""`则禁止marks。当没被指定时，带有内联内容的节点默认允许所有marks
   * 其它节点则默认不允许marks
   */
  marks?: string

  /// The group or space-separated groups to which this node belongs,
  /// which can be referred to in the content expressions for the
  /// schema.
  /** 当前节点所属的组或者空格分隔的组(群)，在schema中可以被内容表达式引用 */
  group?: string

  /// Should be set to true for inline nodes. (Implied for text nodes.)
  /** 内联节点应该设置inline属性为true。比如文本节点 */
  inline?: boolean

  /// Can be set to true to indicate that, though this isn't a [leaf
  /// node](#model.NodeType.isLeaf), it doesn't have directly editable
  /// content and should be treated as a single unit in the view.
  /** 可以设置为true将一个非`leaf node`视作一个单独的单元且不能直接编辑其内容 */
  atom?: boolean

  /// The attributes that nodes of this type get.
  /** 当前节点类型获取的属性 */
  attrs?: {[name: string]: AttributeSpec}

  /// Controls whether nodes of this type can be selected as a [node
  /// selection](#state.NodeSelection). Defaults to true for non-text
  /// nodes.
  /** 控制当前节点类型是否能被作为一个`node selection`选中。对于非文本节点默认为true */
  selectable?: boolean

  /// Determines whether nodes of this type can be dragged without
  /// being selected. Defaults to false.
  /** 确定当前节点类型是否能在未被选中时被拖动。默认为false */
  draggable?: boolean

  /// Can be used to indicate that this node contains code, which
  /// causes some commands to behave differently.
  /** 用来表明当前节点包含code，这会导致某些命令的行为发生改变 */
  code?: boolean

  /// Controls way whitespace in this a node is parsed. The default is
  /// `"normal"`, which causes the [DOM parser](#model.DOMParser) to
  /// collapse whitespace in normal mode, and normalize it (replacing
  /// newlines and such with spaces) otherwise. `"pre"` causes the
  /// parser to preserve spaces inside the node. When this option isn't
  /// given, but [`code`](#model.NodeSpec.code) is true, `whitespace`
  /// will default to `"pre"`. Note that this option doesn't influence
  /// the way the node is rendered—that should be handled by `toDOM`
  /// and/or styling.
  /** 控制当前节点中的whitespace被解析的方式。默认的值是`"normal"`，这会导致`DOM parser`
   * 以`normal mode`方式折叠`whitespace`或者格式化（替换新行和诸如这类带空格的）。
   * `"pre"`则会导致解析器保留节点中的空拜。当这个选项未被指定但`code`选项为true时，
   * `whitespace`将会默认为`"pre"`。注意，这个选项并不会影响节点被渲染的方式，
   * 节点渲染应该被`toDOM`或者样式化处理
   */
  whitespace?: "pre" | "normal"

  /// Determines whether this node is considered an important parent
  /// node during replace operations (such as paste). Non-defining (the
  /// default) nodes get dropped when their entire content is replaced,
  /// whereas defining nodes persist and wrap the inserted content.
  /** 决定当前节点在替换操作(粘贴也一样)时是否被认为是重要父节点。默认情况当节点整个内容被替换时
   * 这个节点也会被抛弃，但该值为true时则会继续存在并包裹被插入的内容
   */
  definingAsContext?: boolean

  /// In inserted content the defining parents of the content are
  /// preserved when possible. Typically, non-default-paragraph
  /// textblock types, and possibly list items, are marked as defining.
  /** 在被插入的内容中该值为true并且包含该内容的父节点会被尽可能的保留。
   * 典型的，非默认段落文本节点类型及可能的列表元素的该值会被标记为true
   */
  definingForContent?: boolean

  /// When enabled, enables both
  /// [`definingAsContext`](#model.NodeSpec.definingAsContext) and
  /// [`definingForContent`](#model.NodeSpec.definingForContent).
  /** 当启用时，`definingAsContext`和`definingForContent`都会被启用 */
  defining?: boolean

  /// When enabled (default is false), the sides of nodes of this type
  /// count as boundaries that regular editing operations, like
  /// backspacing or lifting, won't cross. An example of a node that
  /// should probably have this enabled is a table cell.
  /** 当启用时(默认值为false)，常规编辑操作(如退格或者内容移动)将不会穿过当前节点类型的节点的边界
   * 当前选项可能启用的节点例子是表格的单元格
   */
  isolating?: boolean

  /// Defines the default way a node of this type should be serialized
  /// to DOM/HTML (as used by
  /// [`DOMSerializer.fromSchema`](#model.DOMSerializer^fromSchema)).
  /// Should return a DOM node or an [array
  /// structure](#model.DOMOutputSpec) that describes one, with an
  /// optional number zero (“hole”) in it to indicate where the node's
  /// content should be inserted.
  ///
  /// For text nodes, the default is to create a text DOM node. Though
  /// it is possible to create a serializer where text is rendered
  /// differently, this is not supported inside the editor, so you
  /// shouldn't override that in your text node spec.
  /** 定义当前类型的节点应该被转换到DOM/HTML的默认方式（如被`DOMSerializer.fromSchema`应用的方式） 
   * 应该返回一个DOM节点或者一个带有一个可选的数字0("hole")的数组结构以表明节点的内容应该被插入的位置
   * 
   * 对于文本节点，默认行为就是创建一个文本DOM节点。尽管它有可能创建一个序列化器让文本以不同的方式被渲染
   * 这在编辑器内部是不被支持的，因此不应该在文本节点规范中重载这个方法
  */
  toDOM?: (node: Node) => DOMOutputSpec

  /// Associates DOM parser information with this node, which can be
  /// used by [`DOMParser.fromSchema`](#model.DOMParser^fromSchema) to
  /// automatically derive a parser. The `node` field in the rules is
  /// implied (the name of this node will be filled in automatically).
  /// If you supply your own parser, you do not need to also specify
  /// parsing rules in your schema.
  /** 将DOM解析器与当前节点关联起来，这能被应用于`DOMParser.fromSchema`以自动获取一个解析器
   * 规则中的`node`字段是隐含的(同样的节点会被自动填充)。如果提供了自己的解析器则不必在schema中指定解析规则
   */
  parseDOM?: readonly TagParseRule[]

  /// Defines the default way a node of this type should be serialized
  /// to a string representation for debugging (e.g. in error messages).
  /** 定义节点应该被序列化用于调试的字符串形式的方式 */
  toDebugString?: (node: Node) => string

  /// Defines the default way a [leaf node](#model.NodeType.isLeaf) of
  /// this type should be serialized to a string (as used by
  /// [`Node.textBetween`](#model.Node^textBetween) and
  /// [`Node.textContent`](#model.Node^textContent)).
  /** 定义叶子节点应该被序列化成字符串的默认方式（如被`Node.textBetween`和`Node.textContent`） */
  leafText?: (node: Node) => string

  /// A single inline node in a schema can be set to be a linebreak
  /// equivalent. When converting between block types that support the
  /// node and block types that don't but have
  /// [`whitespace`](#model.NodeSpec.whitespace) set to `"pre"`,
  /// [`setBlockType`](#transform.Transform.setBlockType) will convert
  /// between newline characters to or from linebreak nodes as
  /// appropriate.
  /** schema中可以被设置成换行形式的单个内联节点。当块类型间转换时那些支持换行或不支持但`whitespace`
   * 设置为`"pre"`的节点和块类型会被`setBlockType`自动将断行节点中间的字符转换为新行
   * (ai说是为了支持段内换行的场景) */
  linebreakReplacement?: boolean

  /// Node specs may include arbitrary properties that can be read by
  /// other code via [`NodeType.spec`](#model.NodeType.spec).
  /** 节点规范可能包含任意的可以被其他代码通过`NodeType.spec`读取的属性 */
  [key: string]: any
}

/// Used to define marks when creating a schema.
/** 当创建schema时用于定义marks */
export interface MarkSpec {
  /// The attributes that marks of this type get.
  /** 当前markType获得的属性(定义当前markType的一些属性的默认值) */
  attrs?: {[name: string]: AttributeSpec}

  /// Whether this mark should be active when the cursor is positioned
  /// at its end (or at its start when that is also the start of the
  /// parent node). Defaults to true.
  /** 当光标被指向mark的终点时是否应该激活（或者指向起点同样也是父节点的起点）默认为true
   * （即光标位于行首或者行尾这个marks是否会继续应用于新的内容）
   */
  inclusive?: boolean

  /// Determines which other marks this mark can coexist with. Should
  /// be a space-separated strings naming other marks or groups of marks.
  /// When a mark is [added](#model.Mark.addToSet) to a set, all marks
  /// that it excludes are removed in the process. If the set contains
  /// any mark that excludes the new mark but is not, itself, excluded
  /// by the new mark, the mark can not be added an the set. You can
  /// use the value `"_"` to indicate that the mark excludes all
  /// marks in the schema.
  ///
  /// Defaults to only being exclusive with marks of the same type. You
  /// can set it to an empty string (or any string not containing the
  /// mark's own name) to allow multiple marks of a given type to
  /// coexist (as long as they have different attributes).
  /** 确定当前mark不能共存的marks。应该是以空格分隔的且是其他marks的名字或者组名的字符串。
   * 当mark被添加到[added](#model.Mark.addToSet)集合中，所有被当前markType排除的marks
   * 都会在加入过程中被移除。如果这个集合包含任意不排除其本身mark但如果被排除的话(new mark)那这个mark
   * 将不会被添加这个集合中
   * 
   */
  excludes?: string

  /// The group or space-separated groups to which this mark belongs.
  /** 当前mark所属的组或被空格分隔的组群 */
  group?: string

  /// Determines whether marks of this type can span multiple adjacent
  /// nodes when serialized to DOM/HTML. Defaults to true.
  /** 确定当被转换成DOM/HTML时当前markType是否能跨越多个相邻的节点，默认为true */
  spanning?: boolean

  /// Defines the default way marks of this type should be serialized
  /// to DOM/HTML. When the resulting spec contains a hole, that is
  /// where the marked content is placed. Otherwise, it is appended to
  /// the top node.
  /** 定义当前markType应该被转换成DOM/HTML的默认方式。当结果规范包含一个洞，那就是被标记的内容
   * 被替换的地方。否则，它会被添加到顶级节点上
   */
  toDOM?: (mark: Mark, inline: boolean) => DOMOutputSpec

  /// Associates DOM parser information with this mark (see the
  /// corresponding [node spec field](#model.NodeSpec.parseDOM)). The
  /// `mark` field in the rules is implied.
  /** 关联DOM解析器信息和当前mark(查看nodeSpec中对应的parseDOM)。`mark`字段在规则中被隐藏了 */
  parseDOM?: readonly ParseRule[]

  /// Mark specs can include additional properties that can be
  /// inspected through [`MarkType.spec`](#model.MarkType.spec) when
  /// working with the mark.
  /** 当与当前mark一起协作时，mark规范能包含额外的能被`markType.spec`引用的属性 */
  [key: string]: any
}

/// Used to [define](#model.NodeSpec.attrs) attributes on nodes or
/// marks.
/** 用于定义nodes或marks属性的接口 */
export interface AttributeSpec {
  /// The default value for this attribute, to use when no explicit
  /// value is provided. Attributes that have no default must be
  /// provided whenever a node or mark of a type that has them is
  /// created.
  /** 当前属性描述符的默认值，当没有显示提供该属性值时使用。没有默认值的属性描述符必须提供该值
   * 无论何时拥有该属性描述符的node或者mark被创建时（要使用这个属性就得提供其默认值）
   */
  default?: any
  /// A function or type name used to validate values of this
  /// attribute. This will be used when deserializing the attribute
  /// from JSON, and when running [`Node.check`](#model.Node.check).
  /// When a function, it should raise an exception if the value isn't
  /// of the expected type or shape. When a string, it should be a
  /// `|`-separated string of primitive types (`"number"`, `"string"`,
  /// `"boolean"`, `"null"`, and `"undefined"`), and the library will
  /// raise an error when the value is not one of those types.
  /** 用于验证当前属性描述符的值的函数或者类型名称。这将在从JSON反序列化该属性描述符时
   * 以及当运行`Node.check`时使用。当为函数时，这应该抛出一个异常如果值不是期望的类型或格式
   * 当为字符串时，这应该是以`|`分隔的主要类型格式的字符串(`"number"`, `"string"`,
  /// `"boolean"`, `"null"`, and `"undefined"`)，当传入的值不是指定的类型时库会抛出错误
   * 
   */
  validate?: string | ((value: any) => void)
}

/// A document schema. Holds [node](#model.NodeType) and [mark
/// type](#model.MarkType) objects for the nodes and marks that may
/// occur in conforming documents, and provides functionality for
/// creating and deserializing such documents.
///
/// When given, the type parameters provide the names of the nodes and
/// marks in this schema.
/** 文档架构，拥有用于生成node和mark使文档一致的nodeType(nodes)和markType(marks)对象
 * 并提供创建和反序列化文档的功能性
 */
export class Schema<Nodes extends string = any, Marks extends string = any> {
  /// The [spec](#model.SchemaSpec) on which the schema is based,
  /// with the added guarantee that its `nodes` and `marks`
  /// properties are
  /// [`OrderedMap`](https://github.com/marijnh/orderedmap) instances
  /// (not raw objects).
  /**
   * 文档架构的基础规范，类型申明确保`nodes`和`marks`属性是`OrderedMap`实例(而非原始对象)
   */
  spec: {
    nodes: OrderedMap<NodeSpec>,
    marks: OrderedMap<MarkSpec>,
    topNode?: string
  }

  /// An object mapping the schema's node names to node type objects.
  /** 映射架构的节点名字到节点类型对象的对象 */
  nodes: {readonly [name in Nodes]: NodeType} & {readonly [key: string]: NodeType}

  /// A map from mark names to mark type objects.
  /** 从mark名字到markType对象的映射 */
  marks: {readonly [name in Marks]: MarkType} & {readonly [key: string]: MarkType}

  /// The [linebreak
  /// replacement](#model.NodeSpec.linebreakReplacement) node defined
  /// in this schema, if any.
  /** 架构中定义的换行符(linebreakReplacement为true的节点) */
  linebreakReplacement: NodeType | null = null

  /// Construct a schema from a schema [specification](#model.SchemaSpec).
  /**
   * 从文档规范中构造文档架构
   * @param spec 文档规范
   */
  constructor(spec: SchemaSpec<Nodes, Marks>) {
    let instanceSpec = this.spec = {} as any
    for (let prop in spec) instanceSpec[prop] = (spec as any)[prop]
    // 将规范中的nodes和marks转换成OrderedMap对象实例
    instanceSpec.nodes = OrderedMap.from(spec.nodes),
    instanceSpec.marks = OrderedMap.from(spec.marks || {}),
    // 生成nodeType和markType并将其和当前架构关联
    this.nodes = NodeType.compile(this.spec.nodes, this)
    this.marks = MarkType.compile(this.spec.marks, this)

    let contentExprCache = Object.create(null)
    for (let prop in this.nodes) {
      if (prop in this.marks)
        throw new RangeError(prop + " can not be both a node and a mark")
      let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks
      // 内容匹配
      type.contentMatch = contentExprCache[contentExpr] ||
        (contentExprCache[contentExpr] = ContentMatch.parse(contentExpr, this.nodes))
      ;(type as any).inlineContent = type.contentMatch.inlineContent
      // 处理架构中的换行节点问题
      if (type.spec.linebreakReplacement) {
        if (this.linebreakReplacement) throw new RangeError("Multiple linebreak nodes defined")
        if (!type.isInline || !type.isLeaf) throw new RangeError("Linebreak replacement nodes must be inline leaf nodes")
        this.linebreakReplacement = type
      }
      // 处理nodeType的mark问题
      type.markSet = markExpr == "_" ? null :                 //显示定义允许所有markType
        markExpr ? gatherMarks(this, markExpr.split(" ")) :   //如果有值，则获取当前架构的所有当前nodeType允许的markType（包含分组的问题，所以无法直接使用markType.name获取其markType）
        markExpr == "" || !type.inlineContent ? [] : null     //当前节点mark属性为空(定义了该属性但其值为"")或者当前节点类型不是内联节点则当前节点不允许任何mark否则默认允许任何markType
    }
    // 处理各个markType的包含关系
    for (let prop in this.marks) {
      let type = this.marks[prop], excl = type.spec.excludes
      type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks(this, excl.split(" "))
    }

    this.nodeFromJSON = this.nodeFromJSON.bind(this)
    this.markFromJSON = this.markFromJSON.bind(this)
    this.topNodeType = this.nodes[this.spec.topNode || "doc"]
    this.cached.wrappings = Object.create(null)
  }

  /// The type of the [default top node](#model.SchemaSpec.topNode)
  /// for this schema.
  /** 当前架构的顶层节点类型 */
  topNodeType: NodeType

  /// An object for storing whatever values modules may want to
  /// compute and cache per schema. (If you want to store something
  /// in it, try to use property names unlikely to clash.)
  /** 存储任何值的对象，模块可能会计算并缓存这些数据
   * (如果想自己存储些数据进去的话则尽可能使用不会起冲突的属性名)*/
  cached: {[key: string]: any} = Object.create(null)

  /// Create a node in this schema. The `type` may be a string or a
  /// `NodeType` instance. Attributes will be extended with defaults,
  /// `content` may be a `Fragment`, `null`, a `Node`, or an array of
  /// nodes.
  /**
   * 在当前架构中创建一个节点。`type`可能是字符串或者一个`nodeType`实例。
   * 属性将会使用默认值，内容也许是文档片段、空值、节点或者节点数组
   * @param type 节点的类型名称
   * @param attrs 节点的属性
   * @param content 节点的内容
   * @param marks 节点marks
   * @returns 新建的节点
   */
  node(type: string | NodeType,
       attrs: Attrs | null = null,
       content?: Fragment | Node | readonly Node[],
       marks?: readonly Mark[]) {
    if (typeof type == "string")
      type = this.nodeType(type)
    else if (!(type instanceof NodeType))
      throw new RangeError("Invalid node type: " + type)
    else if (type.schema != this)
      throw new RangeError("Node type from different schema used (" + type.name + ")")

    return type.createChecked(attrs, content, marks)
  }

  /// Create a text node in the schema. Empty text nodes are not
  /// allowed.
  /**
   * 在当前架构中创建一个文本节点。空文本节点是不被允许的（空文本会导致块级内容的高度塌陷）
   * @param text 文本内容
   * @param marks 用于该文本节点的mark
   * @returns 新建的文本节点
   */
  text(text: string, marks?: readonly Mark[] | null): Node {
    let type = this.nodes.text
    return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks))
  }

  /// Create a mark with the given type and attributes.
  /**
   * 用传入的类型和属性创建一个mark实例
   * @param type markType
   * @param attrs markAttrs
   * @returns 新建的mark实例
   */
  mark(type: string | MarkType, attrs?: Attrs | null) {
    if (typeof type == "string") type = this.marks[type]
    return type.create(attrs)
  }

  /// Deserialize a node from its JSON representation. This method is
  /// bound.
  /** 从JSON对象中反序列化节点。方法被绑定到当前实例 */
  nodeFromJSON(json: any): Node {
    return Node.fromJSON(this, json)
  }

  /// Deserialize a mark from its JSON representation. This method is
  /// bound.
  /** 从JSON对象中反序列化mark。方法被绑定到当前实例 */
  markFromJSON(json: any): Mark {
    return Mark.fromJSON(this, json)
  }

  /// @internal
  /**
   * @param name 节点类型的名称
   * @returns 如果名称对应的节点类型对象存在则返回该对象，否则抛出错误
   */
  nodeType(name: string) {
    let found = this.nodes[name]
    if (!found) throw new RangeError("Unknown node type: " + name)
    return found
  }
}

/**
 * @param schema 文档架构
 * @param marks mark集合（markSpec.name）
 * @returns 从传入的架构中获取marks对应的markType实例集合，如果传入的架构中不存在marks所对应的markType则抛出错误
 */
function gatherMarks(schema: Schema, marks: readonly string[]) {
  let found: MarkType[] = []
  // 遍历传入的marks 
  for (let i = 0; i < marks.length; i++) {
    let name = marks[i], mark = schema.marks[name], ok = mark
    // 如果直接找到了markType
    if (mark) {
      found.push(mark)
    } else {
      // 遍历当前架构的markType实例
      for (let prop in schema.marks) {
        let mark = schema.marks[prop]
        // 如果要找的markType的名字是"_"或者markType实例的规范所在组包含这个要找的mark
        if (name == "_" || (mark.spec.group && mark.spec.group.split(" ").indexOf(name) > -1))
          //将当前的markType实例推入找到的结果中
          found.push(ok = mark)
      }
    }
    // 如果要找的mark不存在则抛出错误
    if (!ok) throw new SyntaxError("Unknown mark type: '" + marks[i] + "'")
  }
  return found
}
