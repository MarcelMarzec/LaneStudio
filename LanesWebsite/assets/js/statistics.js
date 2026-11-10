// The statistics' map and chart. The map is MapLibre GL on OpenFreeMap's dark style (OpenStreetMap data), recoloured
// to the site's surfaces, with a dot for each changeset in /data/changesets.geojson, grouped when zoomed out.
;(function () {
  'use strict'

  var STYLE = 'https://tiles.openfreemap.org/styles/dark'
  var ACCENT = 'rgb(255, 146, 43)'
  var SURFACE = 'rgb(9, 9, 9)'
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // The site's colours in place of the style's own, by layer
  var RECOLOUR = {
    background: { 'background-color': SURFACE },
    water: { 'fill-color': 'rgb(22, 22, 25)' },
    waterway: { 'line-color': 'rgb(22, 22, 25)' },
    landcover_wood: { 'fill-color': 'rgb(17, 17, 17)' },
    landuse_park: { 'fill-color': 'rgb(17, 17, 17)' },
    building: { 'fill-color': 'rgb(15, 15, 15)', 'fill-outline-color': 'rgb(28, 28, 28)' }
  }

  function escapeHtml (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function formatDate (iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function popupHtml (p) {
    var user = p.user
      ? '<a href="https://www.openstreetmap.org/user/' + encodeURIComponent(p.user) + '" target="_blank" rel="noopener">' +
        escapeHtml(p.user) + '</a>'
      : 'A mapper'
    var link = 'https://www.openstreetmap.org/changeset/' + p.id
    return '<div class="stats-popup">' +
      '<strong>' + escapeHtml(p.comment || 'No comment') + '</strong>' +
      '<p>' + user + '<span class="sep">·</span>' + escapeHtml(formatDate(p.time)) + '</p>' +
      '<p>' + Number(p.changes).toLocaleString('en-GB') + (p.changes === 1 ? ' change' : ' changes') +
      '<span class="sep">·</span>v' + escapeHtml(p.version) + '</p>' +
      '<p><a href="' + link + '" target="_blank" rel="noopener">OpenStreetMap</a>' +
      '<span class="sep">·</span><a href="https://osmcha.org/changesets/' + p.id + '" target="_blank" rel="noopener">OSMCha</a></p>' +
      '</div>'
  }

  function bboxOutline (b) {
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] },
      properties: {}
    }
  }

  function setUpMap (el) {
    var layout = el.closest('.stats-map-layout')

    fetch(STYLE)
      .then(function (response) { return response.json() })
      .then(function (style) {
        style.layers.forEach(function (layer) {
          var paint = RECOLOUR[layer.id]
          if (paint) layer.paint = Object.assign({}, layer.paint, paint)
        })
        var map = new maplibregl.Map({
          container: el,
          style: style,
          center: [0, 30],
          zoom: 1,
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          attributionControl: { compact: true }
        })
        map.touchZoomRotate.disableRotation()
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('load', function () { addChangesets(map, el, layout) })
      })
      .catch(function () {
        el.innerHTML = '<p class="stats-map-fallback">The map could not be loaded.</p>'
      })
  }

  function addChangesets (map, el, layout) {
    fetch(el.dataset.points)
      .then(function (response) { return response.json() })
      .then(function (data) {
        map.addSource('changesets', {
          type: 'geojson', data: data, cluster: true, clusterRadius: 40, clusterMaxZoom: 13
        })
        map.addSource('highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        map.addLayer({
          id: 'highlight', type: 'line', source: 'highlight',
          paint: { 'line-color': ACCENT, 'line-width': 2 }
        })
        map.addLayer({
          id: 'clusters', type: 'circle', source: 'changesets', filter: ['has', 'point_count'],
          paint: {
            'circle-color': ACCENT,
            'circle-opacity': 0.9,
            'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 50, 22, 200, 28],
            'circle-stroke-width': 4,
            'circle-stroke-color': 'rgba(255, 146, 43, 0.25)'
          }
        })
        map.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'changesets', filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
          paint: { 'text-color': 'rgb(28, 14, 2)' }
        })
        map.addLayer({
          id: 'changesets', type: 'circle', source: 'changesets', filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ACCENT,
            'circle-radius': 6,
            'circle-stroke-width': 2,
            'circle-stroke-color': SURFACE
          }
        })

        // Start with every changeset in view
        if (data.features.length) {
          var bounds = new maplibregl.LngLatBounds()
          data.features.forEach(function (f) { bounds.extend(f.geometry.coordinates) })
          map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 })
        }

        map.on('click', 'clusters', function (event) {
          var feature = event.features[0]
          map.getSource('changesets').getClusterExpansionZoom(feature.properties.cluster_id).then(function (zoom) {
            map.easeTo({ center: feature.geometry.coordinates, zoom: zoom, duration: reducedMotion ? 0 : 500 })
          })
        })
        map.on('click', 'changesets', function (event) {
          var feature = event.features[0]
          new maplibregl.Popup({ maxWidth: '280px' })
            .setLngLat(feature.geometry.coordinates)
            .setHTML(popupHtml(feature.properties))
            .addTo(map)
        })
        ;['clusters', 'changesets'].forEach(function (id) {
          map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', id, function () { map.getCanvas().style.cursor = '' })
        })

        // The latest changesets: show each one's area on the map
        if (!layout) return
        layout.querySelectorAll('.stats-latest-show[data-bbox]').forEach(function (button) {
          button.addEventListener('click', function () {
            var b = JSON.parse(button.dataset.bbox)
            layout.querySelectorAll('.stats-latest-show').forEach(function (other) {
              other.setAttribute('aria-pressed', String(other === button))
            })
            map.getSource('highlight').setData(bboxOutline(b))
            map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 80, maxZoom: 17, duration: reducedMotion ? 0 : 800 })
            el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
          })
        })
      })
  }

  // The chart (drawn twice, for wide and narrow screens): each bar's figures above it while hovered
  function setUpChart (figure) {
    var tip = figure.querySelector('.stats-tip')
    var active = null
    figure.querySelectorAll('.stats-bar').forEach(function (bar) {
      bar.addEventListener('mouseenter', function () {
        if (active) active.classList.remove('is-active')
        active = bar
        bar.classList.add('is-active')
        var hit = bar.querySelector('.stats-bar-hit').getBoundingClientRect()
        var path = bar.querySelector('path')
        var top = path ? path.getBoundingClientRect().top : hit.bottom
        var box = figure.getBoundingClientRect()
        tip.textContent = bar.dataset.tip
        tip.hidden = false
        var x = hit.left + hit.width / 2 - box.left
        tip.style.left = Math.min(Math.max(x, tip.offsetWidth / 2), box.width - tip.offsetWidth / 2) + 'px'
        tip.style.top = (top - box.top) + 'px'
      })
    })
    figure.querySelectorAll('svg').forEach(function (svg) {
      svg.addEventListener('mouseleave', function () {
        if (active) active.classList.remove('is-active')
        active = null
        tip.hidden = true
      })
    })
  }

  document.querySelectorAll('[data-stats-chart]').forEach(setUpChart)
  if (window.maplibregl) {
    document.querySelectorAll('[data-stats-map]').forEach(setUpMap)
  }
})()
