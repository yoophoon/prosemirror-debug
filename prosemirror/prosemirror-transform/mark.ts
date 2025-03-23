import {Mark, MarkType, Slice, Fragment, NodeType} from "prosemirror-model"

import {Step} from "./step"
import {Transform} from "./transform"
import {AddMarkStep, RemoveMarkStep} from "./mark_step"
import {ReplaceStep} from "./replace_step"
/**
 * 给指定范围内的内联节点添加指定的mark
 * @param tr 应用本次操作的transaction
 * @param from 添加mark的开始位置
 * @param to 添加mark的结束位置
 * @param mark 要被添加的指定mark
 */
export function addMark(tr: Transform, from: number, to: number, mark: Mark) {
  let removed: Step[] = [], added: Step[] = []
  let removing: RemoveMarkStep | undefined, adding: AddMarkStep | undefined
  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    // 非内联节点 跳过
    if (!node.isInline) return
    let marks = node.marks
    // 如果当前节点不存在指定mark且当前节点的父节点接受指定mark
    if (!mark.isInSet(marks) && parent!.type.allowsMarkType(mark.type)) {
      let start = Math.max(pos, from), end = Math.min(pos + node.nodeSize, to)
      let newSet = mark.addToSet(marks)

      // 检查是否有不能共存的mark
      for (let i = 0; i < marks.length; i++) {
        if (!marks[i].isInSet(newSet)) {
          // 如果RemoveMarkStep的mark与要不兼容的mark一致则修改这个step的结束位置
          if (removing && removing.to == start && removing.mark.eq(marks[i]))
            (removing as any).to = end
          // 根据当前mark创建一个removeMarkStep实例并推入removed数组中
          else
            removed.push(removing = new RemoveMarkStep(start, end, marks[i]))
        }
      }
      // 如果当前addMarkStep结束位置正是当前节点的开始位置，则更新这个step的结束位置
      if (adding && adding.to == start)
        (adding as any).to = end
      // 根剧当前的位置创建一个新的addMarkStep并推入到added数组中
      else
        added.push(adding = new AddMarkStep(start, end, mark))
    }
  })
  // 根据removed和added两个数组分别添加其step子元素
  removed.forEach(s => tr.step(s))
  added.forEach(s => tr.step(s))
}
/**
 * 
 * @param tr 应用本次操作的transaction
 * @param from 移除mark的开始位置
 * @param to 移除mark的结束位置
 * @param mark 要被移除的mark，如果是markType则这一类mark都会被移除，如果是null则直接移除所有mark
 */
export function removeMark(tr: Transform, from: number, to: number, mark?: Mark | MarkType | null) {
  let matched: {style: Mark, from: number, to: number, step: number}[] = [], step = 0
  tr.doc.nodesBetween(from, to, (node, pos) => {
    // 操作仅应用于内联节点
    if (!node.isInline) return
    step++
    let toRemove = null
    // markType
    if (mark instanceof MarkType) {
      let set = node.marks, found
      // 获取node.marks中符合指定markType的实例
      while (found = mark.isInSet(set)) {
        // 更新toRemove
        ;(toRemove || (toRemove = [])).push(found)
        // 更新set
        set = found.removeFromSet(set)
      }
    // markInstance
    } else if (mark) {
      if (mark.isInSet(node.marks)) toRemove = [mark]
    // mark=null
    } else {
      toRemove = node.marks
    }
    // 当前节点存在要移除的mark
    if (toRemove && toRemove.length) {
      // end要么是当前节点的end要么是指定范围的end，mark作为节点的属性需要一个个节点进行处理
      let end = Math.min(pos + node.nodeSize, to)
      for (let i = 0; i < toRemove.length; i++) {
        let style = toRemove[i], found
        for (let j = 0; j < matched.length; j++) {
          let m = matched[j]
          if (m.step == step - 1 && style.eq(matched[j].style)) found = m
        }
        // 如果上一步匹配的mark与当前匹配的mark一致，则认为这个mark是跨节点的
        // 调整mark的结束位置之后合并该步骤
        if (found) {
          found.to = end
          found.step = step
        // 发现新的要移除的mark则新添加一个matched元素
        } else {
          matched.push({style, from: Math.max(pos, from), to: end, step})
        }
      }
    }
  })
  // 为每个匹配到的要移除的mark都创建一个removeMarkStep并添加到指定的transaction中
  matched.forEach(m => tr.step(new RemoveMarkStep(m.from, m.to, m.style)))
}
/**
 * 清除所处位置后方节点的子节点与指定节点类型及指定contentMatch不兼容的节点类型或marks，
 * 如果clearNewline为true则会将换行符替换为带marks的空格
 * @param tr transaction
 * @param pos 指定的开始检查的位置
 * @param parentType 父节点类型
 * @param match 指定的contentMatch
 * @param clearNewlines 是否清除新行(这里应该是指是否将换行符替换成空格)
 */
export function clearIncompatible(tr: Transform, pos: number, parentType: NodeType,
                                  match = parentType.contentMatch,
                                  clearNewlines = true) {
  // 获取指定位置后方节点
  let node = tr.doc.nodeAt(pos)!
  // cur为后方节点的start即内容开始位置
  let replSteps: Step[] = [], cur = pos + 1
  for (let i = 0; i < node.childCount; i++) {
    let child = node.child(i), end = cur + child.nodeSize
    let allowed = match.matchType(child.type)
    // 如果指定contentMatch不能匹配子节点的类型则移除该子节点
    if (!allowed) {
      replSteps.push(new ReplaceStep(cur, end, Slice.empty))
    } else {
      // 更新自动机的状态
      match = allowed
      // 如果指定父节点类型不允许当前子节点的marks则移除移除子节点的mark
      for (let j = 0; j < child.marks.length; j++){
        if (!parentType.allowsMarkType(child.marks[j].type)){
          tr.step(new RemoveMarkStep(cur, end, child.marks[j]))
        }
      }
      // 如果清除新行且子节点是文本节点且指定节点不保留whitespace
      if (clearNewlines && child.isText && parentType.whitespace != "pre") {
        let m, newline = /\r?\n|\r/g, slice
        // 将所有的\r\n用带mark的空格替换
        while (m = newline.exec(child.text!)) {
          if (!slice) slice = new Slice(Fragment.from(parentType.schema.text(" ", parentType.allowedMarks(child.marks))),
                                        0, 0)
          replSteps.push(new ReplaceStep(cur + m.index, cur + m.index + m[0].length, slice))
        }
      }
    }
    cur = end
  }
  // 如果指定的contentMatch没有到终止状态则创建其到终止状态的路径并插入到文档中
  if (!match.validEnd) {
    let fill = match.fillBefore(Fragment.empty, true)
    tr.replace(cur, cur, new Slice(fill!, 0, 0))
  }
  // 将所有的replaceStep都添加到指定tr中
  for (let i = replSteps.length - 1; i >= 0; i--) tr.step(replSteps[i])
}
