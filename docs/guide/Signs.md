# Signs

## Traffic signs and cameras

Select a sign or camera to edit it in Lane Studio's section (in place of iD's sign, direction and speed fields):

- **Which sign**, picked from pictures of UK signs, and its code as tagged (`traffic_sign=GB:670[40]`; several on one
  post);
- the value on it, and the way it faces (`direction=*`, typed or with **Turn round**);
- for cameras, the enforced speed.

The **Signs** tool places a sign beside the road facing the clicked lane's traffic.

Drawn: UK signs as their pictures beside the road, other codes as a plate with the code; variable message signs on
their gantry (`man_made=gantry`); an average-speed camera system (`type=enforcement`) along the stretch it covers.

## Priority on a narrow stretch, toll gantries

- `priority=forward|backward` on a road: "priority over oncoming vehicles" (GB 811) where the traffic with priority
  enters, "give way to oncoming vehicles" (GB 615) at the other end.
- `highway=toll_gantry` on a road: a gantry across it.

## Street furniture

Drawn upright where they stand: street lamps (`highway=street_lamp`) with their pool of light, bus stop flags
(`highway=bus_stop`) and their shelter (`shelter=yes`), traffic mirrors (`highway=traffic_mirror`) and milestones
(`highway=milestone`, with `distance` or `inscription`).

## Road numbers

Road numbers in shields (UK colours: motorways blue, primary routes green, other A and B roads white) and motorway
junction numbers.

## Speed roundels painted on the road

- A red roundel where the limit changes between two roads that both have one (a road with only `maxspeed:type` is
  painted with its limit), or where a lane has its own limit.
- The national limit sign (white disc, black band) where the limit becomes the national limit; the blue motorway sign
  where a motorway starts.
- Blue roundels where a minimum speed starts or changes.
