// 微信小游戏 API 的 H5 适配层，使同一套 main.js 可在浏览器中运行
(function () {
  var gameCanvas = document.createElement('canvas')
  gameCanvas.id = 'gamecanvas'
  document.body.appendChild(gameCanvas)

  function resize() {
    var w = window.innerWidth || 320
    var h = window.innerHeight || 480
    if (w <= 0) w = 320
    if (h <= 0) h = 480
    gameCanvas.width = w
    gameCanvas.height = h
    gameCanvas.style.width = w + 'px'
    gameCanvas.style.height = h + 'px'
  }
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('load', resize)
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 100)
  })

  function toCanvasCoords(clientX, clientY) {
    if (clientX == null) return null
    var rect = gameCanvas.getBoundingClientRect()
    var scaleX = gameCanvas.width / (rect.width || 1)
    var scaleY = gameCanvas.height / (rect.height || 1)
    var x = (clientX - rect.left) * scaleX
    var y = (clientY - rect.top) * scaleY
    return { x: x, y: y, clientX: x, clientY: y }
  }
  function getTouchCoords(e) {
    var touch = e.changedTouches && e.changedTouches[0]
    var clientX = touch ? touch.clientX : e.clientX
    var clientY = touch ? touch.clientY : e.clientY
    return toCanvasCoords(clientX, clientY)
  }
  function getTouchFromTouches(touches) {
    var t = touches && touches[0]
    return t ? toCanvasCoords(t.clientX, t.clientY) : null
  }

  function bindTouch(cb) {
    gameCanvas.addEventListener('touchend', function (e) {
      e.preventDefault()
      var t = getTouchCoords(e)
      if (t) cb({ changedTouches: [t] })
    }, { passive: false })
    gameCanvas.addEventListener('mouseup', function (e) {
      var t = getTouchCoords(e)
      if (t) cb({ changedTouches: [t] })
    })
  }

  window.wx = {
    createCanvas: function () {
      return gameCanvas
    },
    onTouchStart: function (cb) {
      gameCanvas.addEventListener('touchstart', function (e) {
        var t = getTouchFromTouches(e.touches)
        if (t) cb({ touches: [t] })
      })
      gameCanvas.addEventListener('mousedown', function (e) {
        var t = toCanvasCoords(e.clientX, e.clientY)
        if (t) cb({ touches: [t] })
      })
    },
    onTouchMove: function (cb) {
      gameCanvas.addEventListener('touchmove', function (e) {
        e.preventDefault()
        var t = getTouchFromTouches(e.touches)
        if (t) cb({ touches: [t] })
      }, { passive: false })
      gameCanvas.addEventListener('mousemove', function (e) {
        if (e.buttons !== 1) return
        var t = toCanvasCoords(e.clientX, e.clientY)
        if (t) cb({ touches: [t] })
      })
    },
    onTouchEnd: function (cb) {
      bindTouch(cb)
    },
    setStorageSync: function (key, value) {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
      } catch (e) {}
    },
    getStorageSync: function (key) {
      try {
        return localStorage.getItem(key)
      } catch (e) {
        return ''
      }
    },
    removeStorageSync: function (key) {
      try {
        localStorage.removeItem(key)
      } catch (e) {}
    },
    createInnerAudioContext: function () {
      return {
        obeyMuteSwitch: false,
        src: '',
        play: function () {
          try {
            if (this.src) {
              var a = new window.Audio(this.src)
              a.volume = 0.5
              a.play().catch(function () {})
            }
          } catch (e) {}
        }
      }
    }
  }
})()
