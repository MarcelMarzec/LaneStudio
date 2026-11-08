# Railways

Edited like any feature in iD; Lane Studio draws them (wiki: Key:railway).

## Track

- At its gauge: `gauge` (mm), else 1435 mm (main lines, Underground, light rail, trams), 600 mm narrow gauge, 184 mm
  miniature.
- Ballast, concrete sleepers (timber on heritage and narrow gauge lines, `railway:preserved=yes`), steel rails;
  `tracks=n` side by side; conductor rails for `electrified=rail` and `4th_rail`.
- Trams run in the road over its lanes unless `embedded=no`.
- Tunnels faded; disused track rusty; track being built striped; abandoned, razed and proposed lines a dashed bed;
  monorails their beam.
- Railways pass under roads, except at crossings.

## Level crossings (`railway=level_crossing`)

Laid out as in the Office of Rail and Road's layouts and the Highway Code (rules 291–299):

| Tag | Drawn |
| --- | --- |
| `crossing:surface` | Panels across the road, coloured by surface; `crossing=informal`: rails alone |
| `crossing:barrier=half` | A boom across the incoming lanes, on the traffic's left |
| `full`, `double_half`, `yes` | Two booms meeting in the middle |
| `gates` | White gates with red targets; at a user worked crossing (`crossing:activation=user`), one braced gate a side |
| `crossing:light` (or barriers that lower themselves) | Road traffic light signals on the nearside verge; miniature red/green lights at a user worked crossing |
| `crossing:saltire` (or an open crossing) | A St Andrew's cross |
| Barriers, gates or lights | Stop line; an open crossing without lights: give way line |
| `crossing:whistle` | Whistle boards 40 m out each way |

Barriers and lights stand outside all the tracks a road crosses. Footpath crossings (`railway=crossing`) and tram
crossings (`railway=tram_level_crossing`) get panels and rails.

## Platforms, signals and equipment

- Platforms (`railway=platform`, area or a line 3 m wide or `width`): white edge, yellow safety line on the track
  side.
- Signals (`railway=signal`) beside the line (`railway:signal:position`, left by default), facing
  `railway:signal:direction`: colour-light heads with 2–4 aspects (`railway:signal:main:states`, else 3), distant
  signals yellow, shunt signals as position lights, each over its `ref` plate.
- Buffer stops, switches (with point motors), derailers and stop boards at the track; turntables and traversers as
  pits.
- Stations, stops, subway entrances and railway buildings are left to iD.
