# Street parking

Follows the wiki's Street parking scheme, in the **Parking** field (one dropdown per side) or the roadside + menu.

## Where cars park (`parking:<side>`)

| Value | Drawn |
| --- | --- |
| `lane` | On the road, inside the kerb |
| `street_side` | In bays beside the road (a layby) |
| `half_on_kerb` | Half on the road (half its width counts in the road's `width`) |
| `on_kerb` | On the pavement, beyond the kerb |
| `shoulder` | On the shoulder |
| `yes` | On the road, details unknown |
| `separate` | Mapped as its own area |
| `no` | Nobody parks (see no-waiting lines) |

## Each side's details

Folded under a title that sums them up ("Backward side parking: lane on the road, diagonal, pay, 2h, zone A").
Written as `parking:<side>:<key>`, or `parking:both:<key>` when both sides match.

| Shown from the start | In Add field |
| --- | --- |
| How cars park (`orientation`: parallel, diagonal, perpendicular) | Parked facing (`direction`: back_in, head_in) |
| Restriction (`restriction`: no parking, no stopping, no standing, loading only, charging only, none) | Bays marked (`markings`), charge (`charge`) |
| Restriction at times (`restriction:conditional`, as `no_parking @ (Mo-Sa 08:00-18:30)`) | `fee:conditional`, `maxstay:conditional`, `access:conditional` |
| Pay to park (`fee`), time limit (`maxstay`) | Kept for (`private`), disabled drivers (`disabled`), disc (`authentication:disc`) |
| Who may park (`access`), zone (`zone`) | Spaces (`capacity`), width, surface, `staggered`, `reason`, `restriction:reason` |

Where nobody parks, only the restriction and its reason show. A road with the old scheme (`parking:lane=*`,
`parking:condition=*`) has an **Upgrade** button that rewrites what can be read for sure and keeps the rest.

## Drawn

- Bays by orientation (leaning the other way for back-in), as many as `capacity`, none where `markings=no`, in the
  parking's own width and surface; bays kept for loading, charging, disabled drivers or permit holders in their own
  colour.
- From zoom 19, a badge: P with the fee, time limit, zone and who it is kept for.

## No-waiting lines (UK)

Painted just inside the kerb where nobody parks on the road:

| Line | When |
| --- | --- |
| Double yellow | `parking:<side>:restriction=no_parking` or `no_standing` (at any time) |
| Single yellow | Banned at times only (`restriction:conditional=no_parking @ …`, or `no_parking` lifted with `none @ …`) |
| Double or single red | `no_stopping` (a red route) |

## Parking mapped on its own

- Street parking areas (`amenity=parking` + `parking=street_side|lane|layby|on_kerb|half_on_kerb|shoulder`): the same
  fields without the `parking:<side>:` prefix, the road it joins, and a layby joining it to the road. Each has a
  preset (Parking lane, Parking layby, Pavement parking, Half-on-pavement parking, Shoulder parking).
- Parking spaces (`amenity=parking_space`): white bay lines on every side but the one driven in from, coloured by
  `parking_space=*` (disabled blue, charging green, parent and child purple, motorcycles orange; `bus`, `pregnant`,
  `veteran` and the rest plain). Presets for disabled, charging, parent and child, expectant mother, veteran and bus
  spaces.
- Car parks (`amenity=parking`, no `parking=*` or `parking=surface`, multipolygons too): asphalt. Car parks, spaces
  and highway areas can be clicked anywhere on their surface.
