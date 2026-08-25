(function () {
  try {
    var raw = localStorage.getItem('relay-cache-calculator:v1') || '{}'
    var s = JSON.parse(raw)
    var t = s.theme === 'light' || s.theme === 'dark' ? s.theme : (s.theme === 'system' ? 'system' : 'system')
    var eff = t === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t
    document.documentElement.dataset.theme = eff
    document.documentElement.style.colorScheme = eff
  } catch (e) {
    document.documentElement.dataset.theme = 'light'
  }
})()
