# Customising

Lane Studio runs on iD's core, so iD's CSS classes and customisation hooks work in it too. Make changes to the `iD`
global after the bundle loads and before `LaneStudio.init` (see [API](../API.md)).

## CSS classes

Lane Studio's own drawing is in the `.lanes-layer` layer (styled in `css-lanes/`); its classes are not a stable API.
iD's map classes are:

| Class | On |
| --- | --- |
| `.node`, `.way` | The entity type |
| `.point`, `.vertex`, `.midpoint`, `.line`, `.area` | The geometry |
| `.tag-<key>`, `.tag-<key>-<value>` | Primary and secondary tags (`.tag-highway-residential`, `.tag-bridge-yes`) |
| `.tag-status-<value>` | Lifecycle (`construction`, `proposed`, `disused`…) |
| `.tag-unpaved` | Highways with an unpaved surface |
| `.shared`, `.endpoint` | Nodes in two or more ways; a way's end |
| `.hover`, `.active`, `.selected` | Under the pointer, being dragged, selected |

Don't rely on which SVG element draws something.

## Services

```js
iD.services.osm = serviceMyOSM;    // replace a service
delete iD.services.mapillary;      // remove one
```

## Imagery

`iD.fileFetcher.cache().imagery` is the imagery list: an array of `{ id, name, type: 'tms', template }`, with optional
`description`, `overlay`, `zoomExtent`, `polygon`, `overzoom`, `terms_url`, `terms_text` and `best`. Templates take
`{z}`, `{x}`, `{y}`, `{-y}`/`{ty}`, `{u}` and `{switch:a,b,c}`. "None" and "Custom" are always offered.

## Presets

`iD.fileFetcher.cache().presets` holds the presets
([schema-builder format](https://github.com/ideditor/schema-builder#presets)). Add one:

```js
iD.fileFetcher.cache().presets.presets['aerialway/zipline'] = {
    geometry: ['line'], fields: ['incline'], tags: { aerialway: 'zip_line' }, name: 'Zipline'
};
```

A full replacement (or `context.presets({ presets, fields, defaults, categories })`) must include the basic `area`,
`line`, `point`, `vertex` and `relation` presets and a `name` field.

## Minimum editable zoom

`iD.coreContext().minEditableZoom(zoom)`, 16 by default. Lower it with care: the API returns at most 50,000 nodes.
