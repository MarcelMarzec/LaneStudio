// Every page: the navigation's dropdowns close on a click elsewhere or on Escape. A file, not an inline script, so
// the site's Content-Security-Policy (in .htaccess) can refuse inline scripts.
;(function () {
  'use strict'

  var open = function () { return document.querySelectorAll('.nav-dropdown[open]') }

  document.addEventListener('click', function (event) {
    open().forEach(function (d) {
      if (!d.contains(event.target)) d.open = false
    })
  })

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return
    open().forEach(function (d) {
      d.open = false
      d.querySelector('summary').focus()
    })
  })
})()
