# Connectivity

**Connectivity**, in the top bar, shows how lanes connect through junctions and edits the connections, as
[`type=connectivity`](https://wiki.openstreetmap.org/wiki/Relation:connectivity) relations. Esc lets go of a lane,
then leaves.

## On the map

| Line | Means |
| --- | --- |
| Blue | Worked out by Lane Studio, from the turn arrows and lane counts (as [Routing](Routing.md) does). None where a turn restriction bans the turn |
| Orange | Declared by a `type=connectivity` relation |
| Dashed | Needs a lane change (`(n)` in the tag) |

- Every connection is a line from the end of one lane to the start of the next, with an arrowhead. Where two roads
  simply join with as many lanes each way, lanes carry on and no line is drawn.
- Point at a lane to see its connections; the rest fade. Its number, as the tag counts it, is shown where it arrives.
- The panel's key hides either colour.

## Connecting lanes

1. Click a lane to pick it. The lanes it can lead into are outlined, numbered (not roads a turn restriction bans from
   it); those it leads into now are filled in the connection's colour.
2. Click an outlined lane to connect into it; click a filled one to disconnect it. **Shift-click** connects (or
   disconnects) it as needing a lane change. Each writes a relation: the panel says when it is one you added and
   haven't saved, which Undo takes away.
3. Click another lane on a road it can't reach to pick that lane instead; click the picked lane, or press Esc, to let go.

Each click is one undo step. The panel lists the picked lane's connections road by road, each with **Lane change**
and a bin, and per road:

| Button | Does |
| --- | --- |
| Declare as a relation | Writes the connections worked out as a relation, to change from there |
| Select the relation | Opens it in iD's editor |
| Back to the default | Deletes the relation; the connections worked out apply again |

## What is written

- One relation per from road, junction and to road: `from` way, `via` node, `to` way, with `type=connectivity` and
  `connectivity=*`, as the wiki says.
- `connectivity=1:1|2:2,(3)`: one statement per from lane, `|` between them; lanes count from 1 at the driver's left
  among the lanes going that way; `bw` is the both_ways (centre turn) lane; `(n)` needs a lane change. A road without
  lane tags has lane 1.
- A relation lists every lane leading from its from road into its to road. A new one starts from the connections
  worked out, so the other lanes keep theirs; one with nothing left is deleted.
- A road running through the junction is split there first, as the relation's roads must end at the via node.
- The last lane from one road into another can't be disconnected: that is a turn restriction (the Turn Restrictions
  field on the junction node).
- Relations with via ways (over an unmarked stretch) are drawn and can be edited, not created.
- `connectivity:conditional` is shown in the panel, and kept.

## Checks

The panel lists the connectivity relations in view with problems; click one to select it. The
[Issues pane](Checks.md) finds them anywhere:

- not one `from` way, one `to` way and a `via` node or via ways, or roads not joined at the via;
- a `connectivity` value against the wiki's syntax: two from lanes in one statement (`1,2:1`, fixed to `1:1|2:1`
  with one click), a from lane listed twice, a lane that is not a number or `bw`;
- a lane the from or to road does not have.

A relation saying no more than Lane Studio works out gets a note in the panel: the wiki keeps relations for junctions
where the connections are not the default.

On the OpenStreetMap wiki: [Relation:connectivity](https://wiki.openstreetmap.org/wiki/Relation:connectivity), [Key:connectivity](https://wiki.openstreetmap.org/wiki/Key:connectivity), [Key:placement](https://wiki.openstreetmap.org/wiki/Key:placement), [Key:turn](https://wiki.openstreetmap.org/wiki/Key:turn).
