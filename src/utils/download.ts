// separate from csv.ts so the builder can be tested without a DOM
export function downloadText(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Firefox needs the click dispatched before the url is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
