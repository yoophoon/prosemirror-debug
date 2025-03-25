import {Plugin, Transaction, EditorState, TextSelection, Command} from "prosemirror-state"
import {EditorView} from "prosemirror-view"

/// Input rules are regular expressions describing a piece of text
/// that, when typed, causes something to happen. This might be
/// changing two dashes into an emdash, wrapping a paragraph starting
/// with `"> "` into a blockquote, or something entirely different.
/// 输入规则是描述一段文本（当被输入时触发某些事件）的正则表达式，这可能是将两个短破折
/// 号转换成一个长破折号、将一个以"> "开头的段落包裹成一个"blockquote"或者某些完全
/// 不同的其它东西
export class InputRule {
  /// @internal
  handler: (state: EditorState, match: RegExpMatchArray, start: number, end: number) => Transaction | null

  /// @internal
  undoable: boolean
  inCode: boolean | "only"

  /// Create an input rule. The rule applies when the user typed
  /// something and the text directly in front of the cursor matches
  /// `match`, which should end with `$`.
  ///
  /// The `handler` can be a string, in which case the matched text, or
  /// the first matched group in the regexp, is replaced by that
  /// string.
  ///
  /// Or a it can be a function, which will be called with the match
  /// array produced by
  /// [`RegExp.exec`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/exec),
  /// as well as the start and end of the matched range, and which can
  /// return a [transaction](#state.Transaction) that describes the
  /// rule's effect, or null to indicate the input was not handled.
  constructor(
    /// @internal
    readonly match: RegExp,
    handler: string | ((state: EditorState, match: RegExpMatchArray, start: number, end: number) => Transaction | null),
    options: {
      /// When set to false,
      /// [`undoInputRule`](#inputrules.undoInputRule) doesn't work on
      /// this rule.
      undoable?: boolean,
      /// By default, input rules will not apply inside nodes marked
      /// as [code](#model.NodeSpec.code). Set this to true to change
      /// that, or to `"only"` to _only_ match in such nodes.
      inCode?: boolean | "only"
    } = {}
  ) {
    this.match = match
    this.handler = typeof handler == "string" ? stringHandler(handler) : handler
    this.undoable = options.undoable !== false
    this.inCode = options.inCode || false
  }
}

/**
 * 传给inputrule的handler为字符串时调用该函数，该函数会返回一个新函数，
 * 新函数会将匹配到的文本替换为字符穿handler
 * @param string InputRule的handler为字符串时，handler即为该参数
 * @returns 返回一个新的函数InputRule.handler，该函数代替原字符串handler，
 * 该函数会将匹配到的文本用参数string代替
 */
function stringHandler(string: string) {
  return function(state: EditorState, match: RegExpMatchArray, start: number, end: number) {
    let insert = string
    if (match[1]) {
      let offset = match[0].lastIndexOf(match[1])
      insert += match[0].slice(offset + match[1].length)
      start += offset
      let cutOff = start - end
      if (cutOff > 0) {
        insert = match[0].slice(offset - cutOff, offset) + insert
        start = end
      }
    }
    return state.tr.insertText(insert, start, end)
  }
}

const MAX_MATCH = 500

type PluginState = {transform: Transaction, from: number, to: number, text: string} | null

/// Create an input rules plugin. When enabled, it will cause text
/// input that matches any of the given rules to trigger the rule's
/// action.
/// 创建一个输入规则插件。当生效时，这会导致匹配传入规则的文本触发规则的行为
export function inputRules({rules}: {rules: readonly InputRule[]}) {
  let plugin: Plugin<PluginState> = new Plugin<PluginState>({
    state: {
      init() { return null },
      apply(this: typeof plugin, tr, prev) {
        let stored = tr.getMeta(this)
        if (stored) return stored
        return tr.selectionSet || tr.docChanged ? null : prev
      }
    },

    props: {
      handleTextInput(view, from, to, text) {
        return run(view, from, to, text, rules, plugin)
      },
      handleDOMEvents: {
        compositionend: (view) => {
          setTimeout(() => {
            let {$cursor} = view.state.selection as TextSelection
            if ($cursor) run(view, $cursor.pos, $cursor.pos, "", rules, plugin)
          })
        }
      }
    },

    isInputRules: true
  })
  return plugin
}
/**
 * 
 * @param view EditorView 当前编辑器视图
 * @param from 光标的位置（start）
 * @param to 光标为位置（end)
 * @param text textinput 输入的文本 ，如果由复合事件触发则文本内容为空（""）
 * @param rules 传入的InputRules，这些rules会被应用于当前输入的文本
 * @param plugin 所有rule的载体
 * @returns 
 */
function run(view: EditorView, from: number, to: number, text: string, rules: readonly InputRule[], plugin: Plugin) {
  // 如果事件是组合事件该插件则不予处置，返回false，交由其他插件或prosemirror内部处置
  if (view.composing) return false
  let state = view.state, $from = state.doc.resolve(from)
  // 获取父节点在当前光标之前的文本(包括本次输入的文本)
  let textBefore = $from.parent.textBetween(Math.max(0, $from.parentOffset - MAX_MATCH), $from.parentOffset,
                                            null, "\ufffc") + text
  // 便利所有的inputrules
  for (let i = 0; i < rules.length; i++) {
    let rule = rules[i];
    // 对父节点类型及当前rule进行判断
    // 如果父节点类型为code且rule.incode=false 则对输入内容进行正则判断
    // 如果rule.incode=only 则只在code类型的节点中匹配
    if ($from.parent.type.spec.code) {
      if (!rule.inCode) continue
    } else if (rule.inCode === "only") {
      continue
    }
    // 对输入文本进行rule判断
    let match = rule.match.exec(textBefore)
    let tr = match && match[0].length >= text.length &&
      rule.handler(state, match, from - (match[0].length - text.length), to)
    // 当前rule未能生成transaction及对输入文本不生效，跳过
    if (!tr) continue
    // 将当前事务（transaction）、位置信息及本次输入的文本信息存储到插件上
    if (rule.undoable) tr.setMeta(plugin, {transform: tr, from, to, text})
    // 应用当前rule对当前文本的修改并分发修改事件
    view.dispatch(tr)
    // 完成对当前输入文本的操作
    return true
  }
  // 未完成对当前输入文本的操作，交由后续插件或prosemirror内部处理
  return false
}

/// This is a command that will undo an input rule, if applying such a
/// rule was the last thing that the user did.
/// 如果应用该规则是用户所做的最后一件事，那么这个命令将会撤销这次规则的操作
export const undoInputRule: Command = (state, dispatch) => {
  let plugins = state.plugins
  // 遍历插件
  for (let i = 0; i < plugins.length; i++) {
    let plugin = plugins[i], undoable
    if ((plugin.spec as any).isInputRules && (undoable = plugin.getState(state))) {
      if (dispatch) {
        // 获取存储在插件上的transaction
        let tr = state.tr, toUndo:Transaction = undoable.transform
        // 反转undo的step并将其应用于当前transaction
        for (let j = toUndo.steps.length - 1; j >= 0; j--)
          tr.step(toUndo.steps[j].invert(toUndo.docs[j]))
        // 如果之前输入了文字，则将文字应用于视图（inputrule则是对输入的文字及前面的文字进行某种改变，如替换成一个node）
        if (undoable.text) {
          let marks = tr.doc.resolve(undoable.from).marks()
          tr.replaceWith(undoable.from, undoable.to, state.schema.text(undoable.text, marks))
        } else {
          // 删除存储在插件上相关内容（从 from 到 to）
          tr.delete(undoable.from, undoable.to)
        }
        //应用此次事务更新
        dispatch(tr)
      }
      return true
    }
  }
  return false
}
