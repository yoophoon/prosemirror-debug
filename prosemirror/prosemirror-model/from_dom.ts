import {Fragment} from "./fragment"
import {Slice} from "./replace"
import {Mark} from "./mark"
import {Node, TextNode} from "./node"
import {ContentMatch} from "./content"
import {ResolvedPos} from "./resolvedpos"
import {Schema, Attrs, NodeType, MarkType} from "./schema"
import {DOMNode} from "./dom"

/// These are the options recognized by the
/// [`parse`](#model.DOMParser.parse) and
/// [`parseSlice`](#model.DOMParser.parseSlice) methods.
//MARK interface ParseOptions
/** 能被`parse(#model.DOMParser.parse)`和
 * `parseSlice(#model.DOMParser.parseSlice)`方法辨认的选项
*/
export interface ParseOptions {
  /// By default, whitespace is collapsed as per HTML's rules. Pass
  /// `true` to preserve whitespace, but normalize newlines to
  /// spaces, and `"full"` to preserve whitespace entirely.
  /** whitespace在HTML的规则中会被默认折叠。传递`true`以保留whitespace，
   * 但如果想要完全保留换行符，则传递`full` */
  preserveWhitespace?: boolean | "full"

  /// When given, the parser will, beside parsing the content,
  /// record the document positions of the given DOM positions. It
  /// will do so by writing to the objects, adding a `pos` property
  /// that holds the document position. DOM positions that are not
  /// in the parsed content will not be written to.
  /** 当指定时，解析器将会记录给定的DOM位置中的文档位置（意思是除了解析内容之外还会做的事）
   * 通过向DOM对象写入含有文档位置的`pos`属性实现。不包含在被解析的内容的DOM位置将不会被写入这个属性  
   * {node:给定的DOM节点  
   *  offset:对于非文本节点值为DOM节点在其父元素的索引，对于文本节点值为在文本内的位置  
   *  pos:对应在pm.doc的位置(after)}
   */
  findPositions?: {node: DOMNode, offset: number, pos?: number}[]

  /// The child node index to start parsing from.
  /** 开始解析的子节点索引 */
  from?: number

  /// The child node index to stop parsing at.
  /** 结束解析的子节点索引 */
  to?: number

  /// By default, the content is parsed into the schema's default
  /// [top node type](#model.Schema.topNodeType). You can pass this
  /// option to use the type and attributes from a different node
  /// as the top container.
  /** 内容默认被解析到架构的默认顶级节点类型(schema.topNodeType)，
   * 通过指定这个选项来将另一个节点作为顶级容器并使用这个节点类型和属性 
   */
  topNode?: Node

  /// Provide the starting content match that content parsed into the
  /// top node is matched against.
  /** 提供初始内容匹配自动机来匹配被解析到顶层节点的内容 */
  topMatch?: ContentMatch

  /// A set of additional nodes to count as
  /// [context](#model.ParseRule.context) when parsing, above the
  /// given [top node](#model.ParseOptions.topNode).
  /** 当解析时额外作为parserule.context节点的集合，在给定的顶部节点之上 */
  context?: ResolvedPos

  /// @internal
  /** 内部使用 从DOM节点获取规则，规则被提出tag属性 tagParseRule不要tag，有点怪 */
  ruleFromNode?: (node: DOMNode) => Omit<TagParseRule, "tag"> | null
  /// @internal
  /** 用于指定该选项控制 */
  topOpen?: boolean
}

/// Fields that may be present in both [tag](#model.TagParseRule) and
/// [style](#model.StyleParseRule) parse rules.
/** 可以同时在`tag parse rules`和`style parse rules`中使用的字段(这两接口都继承了当前接口) */
export interface GenericParseRule {
  /// Can be used to change the order in which the parse rules in a
  /// schema are tried. Those with higher priority come first. Rules
  /// without a priority are counted as having priority 50. This
  /// property is only meaningful in a schema—when directly
  /// constructing a parser, the order of the rule array is used.
  /** 可以用来改变架构中的解析规则被尝试应用的顺序。高优先级的会被优先尝试。如果规则没有指定优先级
   * 则会以50的优先级作为默认值。这个属性只有在直接构建一个解析器时规则数组的顺序被用到的时候有意义
   */
  priority?: number

  /// By default, when a rule matches an element or style, no further
  /// rules get a chance to match it. By setting this to `false`, you
  /// indicate that even when this rule matches, other rules that come
  /// after it should also run.
  /** 默认的如果一个规则匹配到了一个元素或者样式，其他规则就没不会再匹配了。通过设置这个字段`false`,
   * 能让被规则匹配之后的元素再次让其他规则匹配
   */
  consuming?: boolean

  /// When given, restricts this rule to only match when the current
  /// context—the parent nodes into which the content is being
  /// parsed—matches this expression. Should contain one or more node
  /// names or node group names followed by single or double slashes.
  /// For example `"paragraph/"` means the rule only matches when the
  /// parent node is a paragraph, `"blockquote/paragraph/"` restricts
  /// it to be in a paragraph that is inside a blockquote, and
  /// `"section//"` matches any position inside a section—a double
  /// slash matches any sequence of ancestor nodes. To allow multiple
  /// different contexts, they can be separated by a pipe (`|`)
  /// character, as in `"blockquote/|list_item/"`.
  /** 当指定时，规则只会匹配当前上下文与这个表达式相符的节点(父元素的内容已经被解析了)
   * 应该包含一个或多个以`/`或`//`结尾的节点名称或者节点组名。比如:  
   * `"paragraph/"`是指规则只匹配父节点是paragraph的节点。  
   * `"blockquote/paragraph/"`是指规则只匹配blockquote/paragraph层级的节点  
   * `"section//"`则匹配任何在section节点内的位置，双斜线匹配任何祖先节点序列(类似于section/*\/)  
   * 可以使用`"|"`(管道符)来分隔多种上下文就像`"blockquote/|list_item"`这样
   */
  context?: string

  /// The name of the mark type to wrap the matched content in.
  /** 用于包裹被匹配的内容的markType的名称，一般不会手动设置而是由prosemirror自动采用markType.spec.name */
  mark?: string

  /// When true, ignore content that matches this rule.
  /** 当设置为true时会忽略匹配当前规则的内容 */
  ignore?: boolean

  /// When true, finding an element that matches this rule will close
  /// the current node.
  /** 当设置为true时，找到匹配当前规则的元素时会闭合当前节点 */
  closeParent?: boolean

  /// When true, ignore the node that matches this rule, but do parse
  /// its content.
  /** 当设置为true时会忽略匹配这条规则的节点，但依然会匹配它的子节点 */
  skip?: boolean

  /// Attributes for the node or mark created by this rule. When
  /// `getAttrs` is provided, it takes precedence.
  /** 用于被当前规则创建的node或mark的属性。当`getAttrs`被指定时，则优先采用`getAttrs`的结果 */
  attrs?: Attrs
}

/// Parse rule targeting a DOM element.
/** 针对DOM元素的解析规则 */
export interface TagParseRule extends GenericParseRule {
  /// A CSS selector describing the kind of DOM elements to match.
  /** 描述用于匹配的DOM元素类型的CSS选择器 */
  tag: string

  /// The namespace to match. Nodes are only matched when the
  /// namespace matches or this property is null.
  /** 用于匹配的命名空间。只有当命名空间匹配或者为空时节点才会被匹配 */
  namespace?: string

  /// The name of the node type to create when this rule matches. Each
  /// rule should have either a `node`, `mark`, or `ignore` property
  /// (except when it appears in a [node](#model.NodeSpec.parseDOM) or
  /// [mark spec](#model.MarkSpec.parseDOM), in which case the `node`
  /// or `mark` property will be derived from its position).
  /** 当匹配成功时创建节点的名称。每个规则都应该有`node`,`mark`或者`ignore`属性  
   * (除非这出现在nodeSpec.parseDOM或者markSpec.parseDOM，这种情况这些属性会默认继承specName)
   */
  node?: string

  /// A function used to compute the attributes for the node or mark
  /// created by this rule. Can also be used to describe further
  /// conditions the DOM element or style must match. When it returns
  /// `false`, the rule won't match. When it returns null or undefined,
  /// that is interpreted as an empty/default set of attributes.
  /** 用于计算由当前规则创建的节点或mark的属性的函数。也能用于进一步描述DOM元素或样式必须匹配的条件 */
  getAttrs?: (node: HTMLElement) => Attrs | false | null

  /// For rules that produce non-leaf nodes, by default the content of
  /// the DOM element is parsed as content of the node. If the child
  /// nodes are in a descendent node, this may be a CSS selector
  /// string that the parser must use to find the actual content
  /// element, or a function that returns the actual content element
  /// to the parser.
  /** 用于创建非叶子节点规则，DOM元素的内容会被默认解析成节点的内容。如果子节点在后代节点里面，
   * 这可能是一个规则必须用到的用于查找真实内容元素的CSS选择器字符串或者一个返回真实内容元素给解析器的函数
   */
  contentElement?: string | HTMLElement | ((node: DOMNode) => HTMLElement)

  /// Can be used to override the content of a matched node. When
  /// present, instead of parsing the node's child nodes, the result of
  /// this function is used.
  /** 用于重载被匹配节点内容的属性。当指定时，这个函数的结果会被用于代替解析节点的子节点 */
  getContent?: (node: DOMNode, schema: Schema) => Fragment

  /// Controls whether whitespace should be preserved when parsing the
  /// content inside the matched element. `false` means whitespace may
  /// be collapsed, `true` means that whitespace should be preserved
  /// but newlines normalized to spaces, and `"full"` means that
  /// newlines should also be preserved.
  /** 控制当解析被匹配元素内容时whitespace是否应该被保留。`false`意味着whitespace可能会被折叠
   * `true`意味者whitespace应该被保留，但是换行符会被转换为空格，`full`意味着换行符也会被保留
   */
  preserveWhitespace?: boolean | "full"
}

/// A parse rule targeting a style property.
/** 针对样式属性的解析规则 */
export interface StyleParseRule extends GenericParseRule {
  /// A CSS property name to match. This rule will match inline styles
  /// that list that property. May also have the form
  /// `"property=value"`, in which case the rule only matches if the
  /// property's value exactly matches the given value. (For more
  /// complicated filters, use [`getAttrs`](#model.ParseRule.getAttrs)
  /// and return false to indicate that the match failed.) Rules
  /// matching styles may only produce [marks](#model.ParseRule.mark),
  /// not nodes.
  /** 用于匹配的CSS属性名称。规则会匹配列出来的内联样式属性。如果指定`"property=value"`的形式
   * 规则将只会匹配样式的值与指定的value完全匹配的内容。(对于更复杂的过滤器则采用`getAttrs`属性
   * 并返回false以表示匹配失败)匹配样式的规则可能只会创建marks而不是nodes
   */
  style: string

  /// Given to make TS see ParseRule as a tagged union @hide
  /** 用于让TS将解析规则作为一个标记联合对待(前面说了styleParseRule一般不会产生node) */
  tag?: undefined

  /// Style rules can remove marks from the set of active marks.
  /** 样式规则可以移除激活样式集合中的样式 */
  clearMark?: (mark: Mark) => boolean

  /// A function used to compute the attributes for the node or mark
  /// created by this rule. Called with the style's value.
  /** 用于计算被当前规则创建的node或mark属性的函数。被调用时会将样式的值传进去 */
  getAttrs?: (node: string) => Attrs | false | null
}

/// A value that describes how to parse a given DOM node or inline
/// style as a ProseMirror node or mark.
/** 描述怎么将指定DOM或内联样式解析成PM节点或mark的值 */
export type ParseRule = TagParseRule | StyleParseRule
/**
 * 只要parseDOM返回的rule中包含tag属性则都认为是tagRule所以markSpec中的parseDOM满足的也会返回true
 * @param rule 解析规则
 * @returns 如果是标签解析规则则返回true否则返回false（根据解析规则是否含有tag属性）
 */
function isTagRule(rule: ParseRule): rule is TagParseRule { return (rule as TagParseRule).tag != null }
/**
 * @param rule 解析规则
 * @returns 如果是样式解析规则则返回ture否则返回false（根据解析规则是否含有style属性）
 */
function isStyleRule(rule: ParseRule): rule is StyleParseRule { return (rule as StyleParseRule).style != null }

/// A DOM parser represents a strategy for parsing DOM content into a
/// ProseMirror document conforming to a given schema. Its behavior is
/// defined by an array of [rules](#model.ParseRule).
//MARK class DOMParser
/** DOM解析器表示用于解析DOM内容成适配指定架构的PM文档的策略。行为由解析规则定义 */
export class DOMParser {
  /// @internal
  /** 标签解析规则 */
  tags: TagParseRule[] = []
  /// @internal
  /** 样式解析规则 */
  styles: StyleParseRule[] = []
  /// @internal
  /** 匹配的样式，因为一个样式名可能对应多个样式值这也意味着该样式可能对应多个styleParseRule */
  matchedStyles: readonly string[]
  /// @internal
  /** 是否规格化列表，只有解析规则能解析列表元素且其内容能包含自身节点类型时才为true，因为列表通常是可以互相嵌套的 */
  normalizeLists: boolean

  /// Create a parser that targets the given schema, using the given
  /// parsing rules.
  /** 针对指定的架构使用指定的解析规则创建一个解析器 */
  constructor(
    /// The schema into which the parser parses.
    /** 解析器解析的架构 */
    readonly schema: Schema,
    /// The set of [parse rules](#model.ParseRule) that the parser
    /// uses, in order of precedence.
    /** 解析器使用的按优先级排序的解析规则集合 */
    readonly rules: readonly ParseRule[]
  ) {
    // 初始化 this.matchedStyles,this.tags,this.styles
    let matchedStyles: string[] = this.matchedStyles = []
    rules.forEach(rule => {
      if (isTagRule(rule)) {
        this.tags.push(rule)
      } else if (isStyleRule(rule)) {
        let prop = /[^=]*/.exec(rule.style)![0]
        if (matchedStyles.indexOf(prop) < 0) matchedStyles.push(prop)
        this.styles.push(rule)
      }
    })

    // Only normalize list elements when lists in the schema can't directly contain themselves
    // 初始化this.normalizeLists 该值仅在包含列表标签解析规则且生成的节点可以互相嵌套自身时为true(列表节点的特殊性)
    this.normalizeLists = !this.tags.some(r => {
      // 如果解析规则标签并不包含列表元素或解析规则不生成节点 返回false
      if (!/^(ul|ol)\b/.test(r.tag!) || !r.node) return false
      // 如果解析规则生成的节点内容不能匹配它自身则返回false否则true
      let node = schema.nodes[r.node]
      return node.contentMatch.matchType(node)
    })
  }

  /// Parse a document from the content of a DOM node.
  //MARK domParser.parse
  /**
   * 从DOM节点的内容中解析出PM文档(最外层DOM会被忽略，解析是从DOM节点的子元素开始的)
   * @param dom DOM对象
   * @param options 解析选项
   * @returns 返回一个PM节点
   */
  parse(dom: DOMNode, options: ParseOptions = {}): Node {
    let context = new ParseContext(this, options, false)
    context.addAll(dom, Mark.none, options.from, options.to)
    return context.finish() as Node
  }

  /// Parses the content of the given DOM node, like
  /// [`parse`](#model.DOMParser.parse), and takes the same set of
  /// options. But unlike that method, which produces a whole node,
  /// this one returns a slice that is open at the sides, meaning that
  /// the schema constraints aren't applied to the start of nodes to
  /// the left of the input and the end of nodes at the end.
  /**
   * 解析指定DOM节点的内容，与`domParser.parse`方法相似且接受同样的解析选项集合但不同的是
   * 前者会创建一个完整的节点而该方法则创建在边界打开的slice(这意味着文档架构的约束并不会应用到这个切片的开放区域)
   * @param dom DOM元素
   * @param options 解析选项
   * @returns 
   */
  parseSlice(dom: DOMNode, options: ParseOptions = {}) {
    let context = new ParseContext(this, options, true)
    context.addAll(dom, Mark.none, options.from, options.to)
    return Slice.maxOpen(context.finish() as Fragment)
  }

  /// @internal
  //MARK domParser.matchTag
  /**
   * 使用指定的解析上下文匹配指定标签如果匹配失败返回undefined否则返回true  
   * 如果解析规则定义了getAttrs函数则匹配成功的tagParseRule还会保存其获取到的属性
   * @param dom DOM元素
   * @param context 解析上下文
   * @param after 用指定tagParseRule之后的tagParseRule解析指定DOM
   * @returns 返回匹配成功的tagParseRule
   */
  matchTag(dom: DOMNode, context: ParseContext, after?: TagParseRule) {
    for (let i = after ? this.tags.indexOf(after) + 1 : 0; i < this.tags.length; i++) {
      let rule = this.tags[i]
      if (matches(dom, rule.tag!) &&
          (rule.namespace === undefined || (dom as HTMLElement).namespaceURI == rule.namespace) &&
          (!rule.context || context.matchesContext(rule.context))) {
        if (rule.getAttrs) {
          let result = rule.getAttrs(dom as HTMLElement)
          if (result === false) continue
          rule.attrs = result || undefined
        }
        return rule
      }
    }
  }

  /// @internal
  //MARK domParser.matchStyle
  /**
   * 根据指定的样式名称、值和解析上下文找到对应样式解析规则并返回
   * @param prop 样式名称
   * @param value 样式值
   * @param context 解析上下文
   * @param after 样式解析规则 一般用于rule.comsuming=true的情况方便继续匹配
   * @returns 如果匹配成功则返回对应的样式解析规则 否则undefined
   */
  matchStyle(prop: string, value: string, context: ParseContext, after?: StyleParseRule) {
    for (let i = after ? this.styles.indexOf(after) + 1 : 0; i < this.styles.length; i++) {
      let rule = this.styles[i], style = rule.style!
      if (style.indexOf(prop) != 0 ||
          rule.context && !context.matchesContext(rule.context) ||
          // Test that the style string either precisely matches the prop,
          // or has an '=' sign after the prop, followed by the given
          // value.
          style.length > prop.length &&
          (style.charCodeAt(prop.length) != 61 || style.slice(prop.length + 1) != value))
        continue
      if (rule.getAttrs) {
        let result = rule.getAttrs(value)
        if (result === false) continue
        rule.attrs = result || undefined
      }
      return rule
    }
  }

  /// @internal
  /**
   * 根据指定的架构生成parseRules数组
   * @param schema 文档架构
   * @returns parseRules[]
   */
  static schemaRules(schema: Schema) {
    let result: ParseRule[] = []
    /**
     * 按parseRule.priority值大小插入到result
     * @param rule parseRule
     */
    function insert(rule: ParseRule) {
      let priority = rule.priority == null ? 50 : rule.priority, i = 0
      for (; i < result.length; i++) {
        let next = result[i], nextPriority = next.priority == null ? 50 : next.priority
        if (nextPriority < priority) break
      }
      result.splice(i, 0, rule)
    }
    // 遍历架构中的marks
    for (let name in schema.marks) {
      let rules = schema.marks[name].spec.parseDOM
      if (rules) rules.forEach(rule => {
        insert(rule = copy(rule) as ParseRule)
        // 如果规则没有指定mark或者没有忽视该mark或者没有清除该mark则将mark的名字赋给rule.mark
        if (!(rule.mark || rule.ignore || (rule as StyleParseRule).clearMark))
          rule.mark = name
      })
    }
    // 遍历架构中的nodes
    for (let name in schema.nodes) {
      let rules = schema.nodes[name].spec.parseDOM
      if (rules) rules.forEach(rule => {
        insert(rule = copy(rule) as TagParseRule)
        if (!((rule as TagParseRule).node || rule.ignore || rule.mark))
          rule.node = name
      })
    }
    return result
  }

  /// Construct a DOM parser using the parsing rules listed in a
  /// schema's [node specs](#model.NodeSpec.parseDOM), reordered by
  /// [priority](#model.ParseRule.priority).
  //MARK DOMParser.fromSchema
  /**
   * 通过schema的节点规范(nodeSpec.parseDOM)的解析规则构造一个DOMParser，
   * 这些规则会被`parseRule.priority`重新排序  
   * (优先使用缓存在schema.cached.domParser，如果没缓存则构造新的并缓存返回)
   * @param schema 文档架构
   * @returns 返回缓存的domParser或者根据传入的schema生成的新schema
   */
  static fromSchema(schema: Schema) {
    return schema.cached.domParser as DOMParser ||
      (schema.cached.domParser = new DOMParser(schema, DOMParser.schemaRules(schema)))
  }
}
/** 块节点标签 */
const blockTags: {[tagName: string]: boolean} = {
  address: true, article: true, aside: true, blockquote: true, canvas: true,
  dd: true, div: true, dl: true, fieldset: true, figcaption: true, figure: true,
  footer: true, form: true, h1: true, h2: true, h3: true, h4: true, h5: true,
  h6: true, header: true, hgroup: true, hr: true, li: true, noscript: true, ol: true,
  output: true, p: true, pre: true, section: true, table: true, tfoot: true, ul: true
}
/** 被解析其忽略的标签 */
const ignoreTags: {[tagName: string]: boolean} = {
  head: true, noscript: true, object: true, script: true, style: true, title: true
}
/** 列表标签 */
const listTags: {[tagName: string]: boolean} = {ol: true, ul: true}

// Using a bitfield for node context options
/** 用于节点上下文选项的字节位，应该是用于指定whitespace的处理方式
 * OPT_PRESERVE_WS:       0b001 仅保留空格  
 * OPT_PRESERVE_WS_FULL:  0b010 保留空格与换行符  
 * OPT_OPEN_LEFT:         0b100 开放操作  
 */
const OPT_PRESERVE_WS = 1, OPT_PRESERVE_WS_FULL = 2, OPT_OPEN_LEFT = 4
//MARK wsOptionsFor
/**
 * 根据传入的节点类型及解析选项返回whitespace的处理方式
 * @param type 节点类型
 * @param preserveWhitespace whitespace的处理方式，一般根据parseOption的preserveWhitespace指定
 * @param base whitespace处理方式的基础值(一般根据继承自父节点)
 * @returns 代表处理whitespace方式的数字
 */
function wsOptionsFor(type: NodeType | null, preserveWhitespace: boolean | "full" | undefined, base: number) {
  if (preserveWhitespace != null)
    return (preserveWhitespace ? OPT_PRESERVE_WS : 0) | (preserveWhitespace === "full" ? OPT_PRESERVE_WS_FULL : 0)
  // 如果是pre则直接保留空格符和换行符 如果是normal则让基础值与~OPT_OPEN_LEFT进行按位与
  // base与~OPT_OPEN_LEFT进行按位与则必然为0b01(保留空格),0b10(保留换行),0b11(保留换行及空格)
  return type && type.whitespace == "pre" ? OPT_PRESERVE_WS | OPT_PRESERVE_WS_FULL : base & ~OPT_OPEN_LEFT
}
//MARK class NodeContext
/** 节点上下文 */
class NodeContext {
  match: ContentMatch | null
  content: Node[] = []

  // Marks applied to the node's children
  /** 应用于节点的子节点的marks */
  activeMarks: readonly Mark[] = Mark.none
  /**
   * 
   * @param type 节点类型
   * @param attrs 节点属性
   * @param marks 节点marks
   * @param solid 是否为实体 控制节点上下文是否需要根据解析上下文进行包裹
   * @param match 节点的内容匹配自动机
   * @param options 节点上下文处理whitespace的行为
   */
  constructor(
    readonly type: NodeType | null,
    readonly attrs: Attrs | null,
    readonly marks: readonly Mark[],
    readonly solid: boolean,
    match: ContentMatch | null,
    public options: number
  ) {
    this.match = match || (options & OPT_OPEN_LEFT ? null : type!.contentMatch)
  }
  /**
   * 尝试在指定节点前面填充节点或上层包裹节点以让指定节点满足作为当前节点上下文内容
   * @param node 指定的节点实例
   * @returns 返回包裹路径及contentMatch.findWrapping
   * (可能为[]如果指定节适配当前节点类型，为空则无法通过填充或包裹以让指定节点作为当前节点的内容)
   */
  findWrapping(node: Node) {
    // 如果当前节点上下文的内容匹配自动机不存在
    if (!this.match) {
      // 如果当前节点上下文的节点类型不存在 则返回一个空的包裹层
      if (!this.type) return []
      // 尝试根据当前节点上下文的节点类型填充指定节点前面的内容，如果能填充成功就相当于内容匹配上了
      let fill = this.type.contentMatch.fillBefore(Fragment.from(node))
      // 如果填充成功匹配
      if (fill) {
        // 将当前的节点上下文的contentMatch指定为当前节点上下文节点类型的contentMatch
        this.match = this.type.contentMatch.matchFragment(fill)!
      // 如果填充失败则尝试包裹指定节点以让其满足当前节点上下文的节点类型
      } else {
        let start = this.type.contentMatch, wrap
        // 包裹指定节点类型且成功
        if (wrap = start.findWrapping(node.type)) {
          // 将当前的节点上下文的contentMatch指定为当前节点上下文节点类型的contentMatch
          this.match = start
          return wrap
        // 包裹失败
        } else {
          return null
        }
      }
    }
    return this.match.findWrapping(node.type)
  }
  //MARK nodeContext.finish
  /**
   * 完成当前节点上下文
   * @param openEnd 开放终点
   * @returns 如果节点上下文的nodeType存在则返回该类型的节点不存在则返回一个fragment
   */
  finish(openEnd: boolean): Node | Fragment {
    // 如果不保留whitespace
    if (!(this.options & OPT_PRESERVE_WS)) { // Strip trailing whitespace
      let last = this.content[this.content.length - 1], m
      // 如果最后一个节点是文本节点且存在尾随whitespace
      if (last && last.isText && (m = /[ \t\r\n\u000c]+$/.exec(last.text!))) {
        let text = last as TextNode
        // 如果最后一个节点全是whitespace则直接抛弃这个节点
        if (last.text!.length == m[0].length) this.content.pop()
        // 否则去除尾随空格
        else this.content[this.content.length - 1] = text.withText(text.text.slice(0, text.text.length - m[0].length))
      }
    }
    let content = Fragment.from(this.content)
    // 如果需要闭合当前节点类型且节点上下文的内容匹配机存在 检查当前内容后方是否还有文档架构需要的节点
    if (!openEnd && this.match)
      content = content.append(this.match.fillBefore(Fragment.empty, true)!)
    // 节点类型不存在则返回fragment否则返回node
    return this.type ? this.type.create(this.attrs, content, this.marks) : content
  }
  /**
   * 判断当前节点上下文是否是内联类型
   * @param node DOM节点
   * @returns 返回当前节点上下文是否是内联类型
   */
  inlineContext(node: DOMNode) {
    if (this.type) return this.type.inlineContent
    if (this.content.length) return this.content[0].isInline
    return node.parentNode && !blockTags.hasOwnProperty(node.parentNode.nodeName.toLowerCase())
  }
}
//MARK class ParseContext
/** 解析上下文对象 */
class ParseContext {
  /** 打开的层级 */
  open: number = 0
  /** 用于指定DOM元素查找映射对应PMNode对应位置 */
  find: {node: DOMNode, offset: number, pos?: number}[] | undefined
  /** 解析上下文正在处理的节点上下文是否需要块 一般用于处理文本节点textnode时给其找到对应的文本块 */
  needsBlock: boolean
  /** DOM的nth-child对应的节点上下文 */
  nodes: NodeContext[]
  /** 解析上下文处理的DOM元素是否保留空格 */
  localPreserveWS = false
  /**
   * 构造一个解析上下文对象
   * @param parser 解析器
   * @param options 解析选项
   * @param isOpen 是否开放解析上下文的顶级节点上下文，如果为true且构造当前解析上下文的选项不包含topNode则其顶级节点上下文的节点类型为null true则返回fragment
   */
  constructor(
    // The parser we are using.
    /** 解析上下文使用的解析器 */
    readonly parser: DOMParser,
    // The options passed to this parse.
    /** 解析上下文的选项 */
    readonly options: ParseOptions,
    /** 当前解析上下文是否开放 用于控制最后parseContext.finish的返回结果 true for node and false for fragment */
    readonly isOpen: boolean
  ) {
    let topNode = options.topNode, topContext: NodeContext
    let topOptions = wsOptionsFor(null, options.preserveWhitespace, 0) | (isOpen ? OPT_OPEN_LEFT : 0)
    // 如果通过parseOptions指定了topNode
    if (topNode)
      topContext = new NodeContext(topNode.type, topNode.attrs, Mark.none, true,
                                   options.topMatch || topNode.type.contentMatch, topOptions)
    // 如果是开放的即不限制当前顶层节点上下文topContext
    else if (isOpen)
      topContext = new NodeContext(null, null, Mark.none, true, null, topOptions)
    // 没有指定顶层节点当前topContext也不开放
    else
      topContext = new NodeContext(parser.schema.topNodeType, null, Mark.none, true, null, topOptions)
    this.nodes = [topContext]
    this.find = options.findPositions
    this.needsBlock = false
  }
  /** 返回正在处理的节点上下文的顶层节点上下文(this.nodes[this.open]  <-->  nth-child) */
  get top() {
    return this.nodes[this.open]
  }

  // Add a DOM node to the content. Text is inserted as text node,
  // otherwise, the node is passed to `addElement` or, if it has a
  // `style` attribute, `addElementWithStyles`.
  //MARK parseContext.addDOM
  /**
   * 添加一个DOM节点到内容。文本会被作为文本节点插入，否则DOM节点会被传递给`addElement`(或
   * `addElementWithStyles`(如果DOM节点有`style`属性)(应该是代码更新了但是注释没有更新))
   * @param dom DOM节点 用于解析
   * @param marks 用于当前节点的marks
   */
  addDOM(dom: DOMNode, marks: readonly Mark[]) {
    if (dom.nodeType == 3) this.addTextNode(dom as Text, marks)
    else if (dom.nodeType == 1) this.addElement(dom as HTMLElement, marks)
  }
  //MARK parseContext.addTextNode
  /**
   * 解析文本节点
   * @param dom 文本节点
   * @param marks 用于当前节点的marks
   */
  addTextNode(dom: Text, marks: readonly Mark[]) {
    let value = dom.nodeValue!
    let top = this.top, 
        // 保留whitespace标识
        preserveWS = (top.options & OPT_PRESERVE_WS_FULL) ? 
                      "full" : 
                      this.localPreserveWS || (top.options & OPT_PRESERVE_WS) > 0
    // 如果保留空格或当前解析上下文的上级节点是内联上下文或存在非空白内容
    if (preserveWS === "full" ||
        top.inlineContext(dom) ||
        /[^ \t\r\n\u000c]/.test(value)) {
      // 不保留空格
      if (!preserveWS) {
        value = value.replace(/[ \t\r\n\u000c]+/g, " ")
        // If this starts with whitespace, and there is no node before it, or
        // a hard break, or a text node that ends with whitespace, strip the
        // leading space.
        // 如果文本是以whitespace开始的并且之前没有节点或者之前是一个硬换行符
        // 或者是一个以whitespace结束的文本节点则剥离这些空格
        if (/^[ \t\r\n\u000c]/.test(value) && this.open == this.nodes.length - 1) {
          let nodeBefore = top.content[top.content.length - 1]
          let domNodeBefore = dom.previousSibling
          if (!nodeBefore ||
              (domNodeBefore && domNodeBefore.nodeName == 'BR') ||
              (nodeBefore.isText && /[ \t\r\n\u000c]$/.test(nodeBefore.text!)))
            // 因为不保留whitespace所以前面已经做了替换，所以只需要去掉行首字符就行
            value = value.slice(1)
        }
      } else if (preserveWS !== "full") {
        // 保留空格但把换行转换为空格
        value = value.replace(/\r?\n|\r/g, " ")
      } else {
        // 保留空格及换行
        value = value.replace(/\r\n?/g, "\n")
      }
      if (value) this.insertNode(this.parser.schema.text(value), marks)
      this.findInText(dom)
    // 保留whitespace标识位不为"full"且上层节点上下文不包含内联节点且不存在非whitespace内容
    } else {
      // 这里应该没有意义 因为文本节点不包含子节点而自身节点类型为3
      // 但findInside要求contains节点且自身节点类型为1
      this.findInside(dom)
    }
  }

  // Try to find a handler for the given tag and use that to parse. If
  // none is found, the element's content nodes are added directly.
  //MARK parseContext.addElement
  /**
   * 尝试找到一个用于处理指定标签的函数并用它来解析。如果没找到，元素的内容会被直接添加  
   * 这个函数只是对当前DOM元素要应用的rules和marks进行了筛选过滤，真正更新节点上下文的是addElementByRule
   * @param dom DOM节点
   * @param marks 用于当前节点的marks
   * @param matchAfter 当前解析上下文应用的tagParseRule是在指定matchAfter规则之后
   */
  addElement(dom: HTMLElement, marks: readonly Mark[], matchAfter?: TagParseRule) {
    let outerWS = this.localPreserveWS, top = this.top
    // 如果当前处理DOM的标签名为pre或者whiteSpace存在pre描述 则this.localPreserveWS=true
    if (dom.tagName == "PRE" || /pre/.test(dom.style && dom.style.whiteSpace))
      this.localPreserveWS = true
    let name = dom.nodeName.toLowerCase(), ruleID: TagParseRule | undefined
    // 如果当前处理的DOM元素为列表元素且当前解析器能处理列表元素 则当作标签元素处理
    if (listTags.hasOwnProperty(name) && this.parser.normalizeLists) normalizeList(dom)
    let rule = (this.options.ruleFromNode && this.options.ruleFromNode(dom)) ||
        (ruleID = this.parser.matchTag(dom, this, matchAfter))
    out:
    // 如果匹配到的rule存在则看该rule是否忽略元素该元素 不存在则看忽视标签是否存在当前元素的标签
    if (rule ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
      this.findInside(dom)
      // 这里主要考虑到可能br标签作为当前层级的唯一子节点且当前层级节点内容不为内联内容
      // (即创建了一个br标签就为了换行)或者是一个开放节点上下文
      // 其余复杂情况也可以在这里处理
      this.ignoreFallback(dom, marks)
    // 如果匹配规则不存在或者匹配规则跳过当前节点或匹配规则关闭父节点
    } else if (!rule || rule.skip || rule.closeParent) {
      // 如果规则要求关闭父节点则将当前解析上下文层级提高一级
      if (rule && rule.closeParent)
        this.open = Math.max(0, this.open - 1)
      // 如果规则存在且规则跳过的节点类型存在（这里有点疑惑 文档中没有关于skip的赋值语句且skip的类型定义为boolean|undefined）
      else if (rule && (rule.skip as any).nodeType)
        // 将DOM赋值为该类型
        dom = rule.skip as any as HTMLElement
      let sync, oldNeedsBlock = this.needsBlock
      // 如果当前处理的DOM节点为块级元素
      if (blockTags.hasOwnProperty(name)) {
        // 上层节点的内容不为0且上层节点的内容是内联并且当前开放层级不在顶层
        if (top.content.length && top.content[0].isInline && this.open) {
          // 将上层节点指向更上一级
          this.open--
          top = this.top
        }
        // 同步选项设为true 让处理完当前DOM之后进行同步
        sync = true
        // 如果上层节点类型不存在 则将需要块标志置true
        if (!top.type) this.needsBlock = true
      // 如果当前DOM没有子元素则意味着已经到DOM树的最底层了，则调用叶子处理函数进行处理
      } else if (!dom.firstChild) {
        this.leafFallback(dom, marks)
        break out
      }
      // 下一层要应用的marks 通过当前节点的这里层应用的marks计算出来
      let innerMarks = rule && rule.skip ? marks : this.readStyles(dom, marks)
      // 如果节点不被忽视则将下一层作为当前层内容，因为skip要求跳过当前DOM节点但会继续匹配其子节点
      if (innerMarks) this.addAll(dom, innerMarks)
      if (sync) this.sync(top)
      // 恢复之前的needsBlock 因为上移了一层
      this.needsBlock = oldNeedsBlock
    // 如果解析规则不忽视、不跳过当前DOM节点则将DOM节点添加到当前节点上下文中
    // (虽然说一般而言marks作用于文本节点，但也有可能是跨节点marks能应用于当前DOM元素生成的节点)
    } else {
      // 获取能应用的marks
      let innerMarks = this.readStyles(dom, marks)
      // 应用获取到的marks，Mark.none也是对象，所以无论如何都会对节点进行更新除非当前节点被忽视
      if (innerMarks)
        this.addElementByRule(dom, rule as TagParseRule, innerMarks, rule!.consuming === false ? ruleID : undefined)
    }
    this.localPreserveWS = outerWS
  }

  // Called for leaf DOM nodes that would otherwise be ignored
  /**
   * 被叶子节点调用其余节点则会被忽略
   * @param dom DOM节点
   * @param marks 用于当前节点的marks
   */
  leafFallback(dom: DOMNode, marks: readonly Mark[]) {
    if (dom.nodeName == "BR" && this.top.type && this.top.type.inlineContent)
      this.addTextNode(dom.ownerDocument!.createTextNode("\n"), marks)
  }

  // Called for ignored nodes
  //MARK parseContext.ignoreFallback
  /**
   * 被忽略的节点调用
   * (如<br>因为某些原因导致被忽视了但它的上层节点不是内联内容节点
   * 或上层节点是开饭节点则用连字符代替并应用marks)
   * @param dom DOM节点
   * @param marks 用于当前节点的marks
   */
  ignoreFallback(dom: DOMNode, marks: readonly Mark[]) {
    // Ignored BR nodes should at least create an inline context
    // 被忽略的BR节点应该创建内联上下文
    if (dom.nodeName == "BR" && (!this.top.type || !this.top.type.inlineContent))
      this.findPlace(this.parser.schema.text("-"), marks)
  }

  // Run any style parser associated with the node's styles. Either
  // return an updated array of marks, or null to indicate some of the
  // styles had a rule with `ignore` set.
  //MARK parseContext.readStyles
  /**
   * 运行与当前节点样式关联的样式解析器。返回一个被更新的marks数组
   * 或者null表明DOM元素的一些样式与忽视当前DOM节点匹配匹配
   * @param dom DOM元素
   * @param marks marks
   * @returns 
   */
  readStyles(dom: HTMLElement, marks: readonly Mark[]) {
    let styles = dom.style
    // Because many properties will only show up in 'normalized' form
    // in `style.item` (i.e. text-decoration becomes
    // text-decoration-line, text-decoration-color, etc), we directly
    // query the styles mentioned in our rules instead of iterating
    // over the items.
    /**
     * 因为许多属性只会在`style.item`中展示位标准形式
     * (如text-decoration <-> text-decoration-line,text-decoration-color)，
     * 直接查询规则中提到的样式代替迭代其样式规则
     */
    if (styles && styles.length) for (let i = 0; i < this.parser.matchedStyles.length; i++) {
      let name = this.parser.matchedStyles[i], value = styles.getPropertyValue(name)
      if (value) for (let after: StyleParseRule | undefined = undefined;;) {
        let rule = this.parser.matchStyle(name, value, this, after)
        // 没有匹配的规则 则不对传入的marks做处理
        if (!rule) break
        // 如果规则要求忽视当前DOM节点的内容则将活动marks置空因为不需要这些mark了
        if (rule.ignore) return null
        // 如果规则要求清理其对应的mark则将活动marks中规则对应的mark剔除
        if (rule.clearMark)
          marks = marks.filter(m => !rule!.clearMark!(m))
        // 否则根据解析规则的属性再创建一个mark并添加到活动marks
        else
          marks = marks.concat(this.parser.schema.marks[rule.mark!].create(rule.attrs))
        // 如果规则允许同时匹配多个规则则继续处理剩下的属性否则直接跳出
        if (rule.consuming === false) after = rule
        else break
      }
    }
    return marks
  }

  // Look up a handler for the given node. If none are found, return
  // false. Otherwise, apply it, use its return value to drive the way
  // the node's content is wrapped, and return true.
  //MARK parseContext.addElementByRule
  /**
   * 为指定的DOM节点找到一个处理函数。如果没找到则返回false否则应用这个函数用它的返回值驱动节点内容被包裹的方式并返回true
   * @param dom DOM元素
   * @param rule 标签解析规则
   * @param marks marks
   * @param continueAfter 后面的
   */
  addElementByRule(dom: HTMLElement, rule: TagParseRule, marks: readonly Mark[], continueAfter?: TagParseRule) {
    let sync, nodeType
    // 如果生成对应节点
    if (rule.node) {
      nodeType = this.parser.schema.nodes[rule.node]
      // 非叶子节点
      if (!nodeType.isLeaf) {
        let inner = this.enter(nodeType, rule.attrs || null, marks, rule.preserveWhitespace)
        if (inner) {
          sync = true
          marks = inner
        }
      } else if (!this.insertNode(nodeType.create(rule.attrs), marks)) {
        this.leafFallback(dom, marks)
      }
    } else {
      let markType = this.parser.schema.marks[rule.mark!]
      marks = marks.concat(markType.create(rule.attrs))
    }
    let startIn = this.top

    if (nodeType && nodeType.isLeaf) {
      this.findInside(dom)
    } else if (continueAfter) {
      this.addElement(dom, marks, continueAfter)
    } else if (rule.getContent) {
      this.findInside(dom)
      rule.getContent(dom, this.parser.schema).forEach(node => this.insertNode(node, marks))
    } else {
      let contentDOM = dom
      if (typeof rule.contentElement == "string") contentDOM = dom.querySelector(rule.contentElement)!
      else if (typeof rule.contentElement == "function") contentDOM = rule.contentElement(dom)
      else if (rule.contentElement) contentDOM = rule.contentElement
      this.findAround(dom, contentDOM, true)
      this.addAll(contentDOM, marks)
      this.findAround(dom, contentDOM, false)
    }
    if (sync && this.sync(startIn)) this.open--
  }

  // Add all child nodes between `startIndex` and `endIndex` (or the
  // whole node, if not given). If `sync` is passed, use it to
  // synchronize after every block element.
  //MARK parseContext.addAll
  /**
   * 添加位于`startIndex`和`endIndex`范围内的所有子节点如果没有指定则是DOM元素的所有子节点  
   * ~~如果`sync`被指定则在每个块元素之后利用它同步(该函数并没有使用sync参数)~~
   * @param parent 父节点DOM元素
   * @param marks 用于当前解析上下文的marks
   * @param startIndex 被解析内容位于父元素的开始索引
   * @param endIndex 被解析内容位于父元素的结束索引
   */
  addAll(parent: DOMNode, marks: readonly Mark[], startIndex?: number, endIndex?: number) {
    let index = startIndex || 0
    for (let dom = startIndex ? parent.childNodes[startIndex] : parent.firstChild,
             end = endIndex == null ? null : parent.childNodes[endIndex];
         dom != end; dom = dom!.nextSibling, ++index) {
      this.findAtPoint(parent, index)
      this.addDOM(dom!, marks)
    }
    this.findAtPoint(parent, index)
  }

  // Try to find a way to fit the given node type into the current
  // context. May add intermediate wrappers and/or leave non-solid
  // nodes that we're in.
  //MARK parserContext.findPlace
  /**
   * 尝试找到一种将给定的节点类型适配到当前上下文的方法。可能会给所处的非实体节点添加中间包裹层  
   * (这个leave到底是抛弃还是留下)
   * @param node 节点
   * @param marks 
   * @returns 
   */
  findPlace(node: Node, marks: readonly Mark[]) {
    let route, sync: NodeContext | undefined
    // 遍历各个层级节点
    for (let depth = this.open; depth >= 0; depth--) {
      // 当前层级节点
      let cx = this.nodes[depth]
      let found = cx.findWrapping(node)
      if (found && (!route || route.length > found.length)) {
        route = found
        sync = cx
        if (!found.length) break
      }
      if (cx.solid) break
    }
    if (!route) return null
    this.sync(sync!)
    for (let i = 0; i < route.length; i++)
      marks = this.enterInner(route[i], null, marks, false)
    return marks
  }

  // Try to insert the given node, adjusting the context when needed.
  /**
   * 尝试将指定的节点插入当需要时会调整上下文
   * @param node 节点
   * @param marks marks
   * @returns 
   */
  insertNode(node: Node, marks: readonly Mark[]) {
    if (node.isInline && this.needsBlock && !this.top.type) {
      let block = this.textblockFromContext()
      if (block) marks = this.enterInner(block, null, marks)
    }
    let innerMarks = this.findPlace(node, marks)
    if (innerMarks) {
      this.closeExtra()
      let top = this.top
      if (top.match) top.match = top.match.matchType(node.type)
      let nodeMarks = Mark.none
      for (let m of innerMarks.concat(node.marks))
        if (top.type ? top.type.allowsMarkType(m.type) : markMayApply(m.type, node.type))
          nodeMarks = m.addToSet(nodeMarks)
      top.content.push(node.mark(nodeMarks))
      return true
    }
    return false
  }

  // Try to start a node of the given type, adjusting the context when
  // necessary.
  /**
   * 尝试开始指定节点当需要时调整上下文
   * @param type 节点类型
   * @param attrs 属性
   * @param marks mark
   * @param preserveWS 保留空格操作符
   * @returns 
   */
  enter(type: NodeType, attrs: Attrs | null, marks: readonly Mark[], preserveWS?: boolean | "full") {
    let innerMarks = this.findPlace(type.create(attrs), marks)
    if (innerMarks) innerMarks = this.enterInner(type, attrs, marks, true, preserveWS)
    return innerMarks
  }

  // Open a node of the given type
  /**
   * 打开一个指定类型的节点
   * @param type 节点类型
   * @param attrs 属性
   * @param marks marks
   * @param solid 
   * @param preserveWS 保留空格操作符
   * @returns 
   */
  enterInner(type: NodeType, attrs: Attrs | null, marks: readonly Mark[],
             solid: boolean = false, preserveWS?: boolean | "full") {
    this.closeExtra()
    let top = this.top
    top.match = top.match && top.match.matchType(type)
    let options = wsOptionsFor(type, preserveWS, top.options)
    if ((top.options & OPT_OPEN_LEFT) && top.content.length == 0) options |= OPT_OPEN_LEFT
    let applyMarks = Mark.none
    marks = marks.filter(m => {
      if (top.type ? top.type.allowsMarkType(m.type) : markMayApply(m.type, type)) {
        applyMarks = m.addToSet(applyMarks)
        return false
      }
      return true
    })
    this.nodes.push(new NodeContext(type, attrs, applyMarks, solid, null, options))
    this.open++
    return marks
  }

  // Make sure all nodes above this.open are finished and added to
  // their parents
  //MARK parseContext.closeExtra
  /**
   * 确保this.open之上的所有节点被解析完毕并被添加到它们的父节点
   * @param openEnd 
   */
  closeExtra(openEnd = false) {
    let i = this.nodes.length - 1
    if (i > this.open) {
      for (; i > this.open; i--) 
        this.nodes[i - 1].content.push(this.nodes[i].finish(openEnd) as Node)
      this.nodes.length = this.open + 1
    }
  }
  //MARK parseContext.finish
  /**
   * 完成本次解析上下文工作
   * @returns 一个节点或fragment
   */
  finish() {
    //将开放层级置0
    this.open = 0
    // 闭合
    this.closeExtra(this.isOpen)
    return this.nodes[0].finish(!!(this.isOpen || this.options.topOpen))
  }
  /**
   * 将当前解析上下文与指定节点上下文同步
   * @param to 节点上下文
   * @returns 如果解析上下文中有指定的节点上下文将解析上下文的层级移动到指定的节点上下文并返回true
   * 否则保留空白字符返回false
   */
  sync(to: NodeContext) {
    for (let i = this.open; i >= 0; i--) {
      if (this.nodes[i] == to) {
        this.open = i
        return true
      } else if (this.localPreserveWS) {
        this.nodes[i].options |= OPT_PRESERVE_WS
      }
    }
    return false
  }
  /** 获取解析上下文位置当前 */
  get currentPos() {
    this.closeExtra()
    let pos = 0
    for (let i = this.open; i >= 0; i--) {
      let content = this.nodes[i].content
      for (let j = content.length - 1; j >= 0; j--)
        pos += content[j].nodeSize
      if (i) pos++
    }
    return pos
  }
  //MARK parseContext.findAtPoint
  /**
   * 
   * @param parent 父节点DOM元素
   * @param offset 子节点索引值
   */
  findAtPoint(parent: DOMNode, offset: number) {
    if (this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].node == parent && this.find[i].offset == offset)
        this.find[i].pos = this.currentPos
    }
  }
  //MARK parseContext.findInside
  /**
   * 在给定元素内部查找DOMParser.find[n].DOMNode是否存在
   * @param parent DOM节点
   */
  findInside(parent: DOMNode) {
    if (this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node))
        this.find[i].pos = this.currentPos
    }
  }
  /**
   * 在
   * @param parent 父DOM节点
   * @param content 内容DOM
   * @param before 控制查找方向
   */
  findAround(parent: DOMNode, content: DOMNode, before: boolean) {
    if (parent != content && this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node)) {
        let pos = content.compareDocumentPosition(this.find[i].node)
        if (pos & (before ? 2 : 4))
          this.find[i].pos = this.currentPos
      }
    }
  }
  /**
   * 在文本里面查找
   * @param textNode 文本节点
   */
  findInText(textNode: Text) {
    if (this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].node == textNode)
        this.find[i].pos = this.currentPos - (textNode.nodeValue!.length - this.find[i].offset)
    }
  }

  // Determines whether the given context string matches this context.
  //MARK parseContext.matchesContext
  /**
   * 确定指定的上下文(p/a/)是否匹配当前上下文(parseContext)  
   * parseRule.context=domParser.optopm.context+domParser.open
   * @param context 上下文 parseRule.context
   * @returns 如果匹配成功则返回true否则返回false
   */
  matchesContext(context: string) {
    // 如果指定了多组上下文 则循环处理
    if (context.indexOf("|") > -1)
      return context.split(/\s*\|\s*/).some(this.matchesContext, this)

    let parts = context.split("/")
    let option = this.options.context
    // 当前解析上下文不是解析为fragment且解析选项不存在或解析选项的指定的父元素为当前解析上下文的顶层节点上下文的类型
    let useRoot = !this.isOpen && (!option || option.parent.type == this.nodes[0].type)
    // 最小层级=当前顶级节点向上层数+根节点层(如果采用则算一层否则不算)
    // 前者考虑采用根节点为一层的情况而后者如果使用根节点层已被前者考虑所以为0不考虑则直接将内容挂在option.parent上减少根节点这一层
    // 层级是以当前解析上下文的层级作为基准所以在根节点之外的为负数
    let minDepth = -(option ? option.depth + 1 : 0) + (useRoot ? 0 : 1)
    /**
     * 
     * @param i 指定上下文索引
     * @param depth 当前解析上下文的层级
     * @returns 
     */
    let match = (i: number, depth: number) => {
      for (; i >= 0; i--) {
        let part = parts[i]
        // 如果第i个层级的节点类型为空(意味着这一层级任何节点都满足)
        if (part == "") {
          // 如果是最顶层或最底层 则跳过  
          // 这里应该是只既然任意节点都能满足这一层级那最底层作为匹配的开始就直接跳到上一层匹配
          // 最顶层已经不需要考虑它的上一层是否允许当前层作为它的子节点所以也不需要考虑
          if (i == parts.length - 1 || i == 0) continue
          // 如果不是最底层或者最顶层则递归调用match函数 i-1也表示不考虑当前层的匹配情况(任意节点都满足)
          for (; depth >= minDepth; depth--)
            if (match(i - 1, depth)) return true
          return false
        // 这里对应不为空 需要具体匹配的情况
        } else {
          // 层级没有到最顶层或者(在最顶层且使用根)?(采用根节点的类型):((指定路径且层级大于最小层级)?当前层上面最小层节点类型:null)
          let next = depth > 0 || (depth == 0 && useRoot) ?
                      this.nodes[depth].type :
                      option && depth >= minDepth ? option.node(depth - minDepth).type :
                                                    null
          // 当前层级节点类型不存在或者类型存在但对应上下文的节点名称且所在组也不包含对应上下文名称
          if (!next || (next.name != part && !next.isInGroup(part)))
            return false
          depth--
        }
      }
      return true
    }
    return match(parts.length - 1, this.open)
  }
  /** 来自当前解析上下文的文本块 */
  textblockFromContext() {
    let $context = this.options.context
    if ($context) for (let d = $context.depth; d >= 0; d--) {
      let deflt = $context.node(d).contentMatchAt($context.indexAfter(d)).defaultType
      if (deflt && deflt.isTextblock && deflt.defaultAttrs) return deflt
    }
    for (let name in this.parser.schema.nodes) {
      let type = this.parser.schema.nodes[name]
      if (type.isTextblock && type.defaultAttrs) return type
    }
  }
}

// Kludge to work around directly nested list nodes produced by some
// tools and allowed by browsers to mean that the nested list is
// actually part of the list item above it.
//MARK normalizeList
/**
 * 直接处理嵌套的的列表节点(由一些工具生产并被浏览器接受，这意味着嵌套的列表元素实际上是其上方列表项的一部分)  
 * 这个规范化应该是指 将相邻的标签元素移至li标签
 * @param dom DOM元素
 */
function normalizeList(dom: DOMNode) {
  for (let child = dom.firstChild, prevItem: ChildNode | null = null; child; child = child.nextSibling) {
    // 如果是元素节点则名称为其节点名否则为null
    let name = child.nodeType == 1 ? child.nodeName.toLowerCase() : null
    // 名称存在且列表标签包含这个名称且前一个子节点存在
    if (name && listTags.hasOwnProperty(name) && prevItem) {
      prevItem.appendChild(child)
      child = prevItem
    // 如果子元素是li标签
    } else if (name == "li") {
      prevItem = child
    } else if (name) {
      prevItem = null
    }
  }
}

// Apply a CSS selector.
/**
 * 应用一个CSS选择器，这个函数让parseRule.tag可以使用选择器而不局限于标签名(兼容写法)
 * @param dom 要应用css选择器的DOM元素
 * @param selector CSS选择器
 * @returns 返回CSS选择器结果
 */
function matches(dom: any, selector: string): boolean {
  return (dom.matches || dom.msMatchesSelector || dom.webkitMatchesSelector || dom.mozMatchesSelector).call(dom, selector)
}
/**
 * 将指定对象的顶层属性克隆到新对象并返回(newObj[name]=obj[name])
 * @param obj 指定的对象
 * @returns 指定对象的顶层克隆对象
 */
function copy(obj: {[prop: string]: any}) {
  let copy: {[prop: string]: any} = {}
  for (let prop in obj) copy[prop] = obj[prop]
  return copy
}

// Used when finding a mark at the top level of a fragment parse.
// Checks whether it would be reasonable to apply a given mark type to
// a given node, by looking at the way the mark occurs in the schema.
/**
 * 在文档片段解析的顶层查找标记时使用。通过查看架构中出现的mark检查应用指定markType到指定节点是否合理
 * @param markType 可能会被应用到当前节点类型的markType
 * @param nodeType 被匹配到的节点类型
 * @returns 指定的markType能应用到指定的节点类型则返回true否则返回undefined  
 * 感觉是在查看指定的markType能否用于节点及其内部
 */
function markMayApply(markType: MarkType, nodeType: NodeType) {
  let nodes = nodeType.schema.nodes
  for (let name in nodes) {
    let parent = nodes[name]
    // 如果父节点不允许传入的markType则跳过当前节点
    if (!parent.allowsMarkType(markType)) continue
    let seen: ContentMatch[] = [], 
        scan = (match: ContentMatch) => {
          seen.push(match)
          for (let i = 0; i < match.edgeCount; i++) {
            let {type, next} = match.edge(i)
            if (type == nodeType) return true
            if (seen.indexOf(next) < 0 && scan(next)) return true
          }
        }
    if (scan(parent.contentMatch)) return true
  }
}
