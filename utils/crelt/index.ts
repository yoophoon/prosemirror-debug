type Child = string | Node | null | undefined | readonly Child[]
export default function crelt(element: string | HTMLElement, ...children: Child[]): HTMLElement
export default function crelt(element: string | HTMLElement, attrs:{[attr: string]: any}, ...children:Child[]):HTMLElement 
export default function crelt(){
  var elt = arguments[0]
  if (typeof elt == "string") elt = document.createElement(elt)
  var i = 1, next = arguments[1]
  if (next && typeof next == "object" && next.nodeType == null && !Array.isArray(next)) {
    for (var name in next) if (Object.prototype.hasOwnProperty.call(next, name)) {
      var value = next[name]
      if (typeof value == "string") elt.setAttribute(name, value)
      else if (value != null) elt[name] = value
    }
    i++
  }
  for (; i < arguments.length; i++) add(elt, arguments[i])
  return elt
}

function add(elt: HTMLElement, child: Child) {
  if (typeof child == "string") {
    elt.appendChild(document.createTextNode(child))
  } else if (child == null) {
  } else if (Array.isArray(child)) {
    for (var i = 0; i < child.length; i++) add(elt, child[i])
  // child.nodeType != null may not be necessary but inherited from source code
  } else if (child instanceof Node && child.nodeType != null) {
    elt.appendChild(child)
  } else {
    throw new RangeError("Unsupported child node: " + child)
  }
}