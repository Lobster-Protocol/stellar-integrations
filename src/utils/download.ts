// Hands a generated file to the browser. Kept apart from the CSV builder so the
// builder stays testable without a DOM.
export function downloadText(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Firefox needs the click to have been dispatched before the url dies.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
