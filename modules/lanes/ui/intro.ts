import { dispatch as d3_dispatch } from 'd3-dispatch';

import { localizer, t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import { modeSelect } from '../../modes/select';
import { helpHtml } from '../../ui/intro/helper';
import { uiModal } from '../../ui/modal';
import { utilRebind } from '../../util/rebind';

/*
 * Lane Studio's walkthrough, in place of iD's (Help → Start the walkthrough): what is different from iD, on the
 * walkthrough's practice data (Three Rivers, Michigan). Chapters: Welcome, Lanes, Roadside, Tools, Start editing.
 * Each step points at a part of the screen with a short text; the first asks you to select the road, the rest go on
 * with OK. Nothing done in the walkthrough is saved.
 */

type Box = { top: number; left: number; width: number; height: number; right: number; bottom: number };
type Reveal = (box: string | Element | null, html: string, options?: { buttonText?: string; buttonCallback?: () => void; padding?: number;
    tooltipClass?: string; tooltipBox?: Box }) => void;

/**
 * Where to put the tooltip for a button in the top bar's right-hand end: iD's curtain puts a tooltip for something
 * near the edge beside it, which for a top bar button is off the top of the screen, so this box (the button moved
 * in from the edge) puts it below
 */
function belowTopBar(selector: string): Box | undefined {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (!rect) return undefined;
    const left = Math.min(rect.left, window.innerWidth - 220);
    return { top: rect.top, left, width: rect.width, height: rect.height, right: left + rect.width, bottom: rect.bottom };
}

interface Chapter {
    title: string;
    enter(): void;
    exit(): void;
    on(type: string, listener: (() => void) | null): Chapter;
}

// Main Street in the practice data: a primary road through the town centre
const mainStreet = 'w228';
const mainStreetAt: [number, number] = [-85.634622, 41.946179];

const ok = () => localizer.t_html('intro.ok');
const text = (key: string, replacements?: Record<string, string>) => helpHtml(`_lanes.intro.${key}`, replacements);

/**
 * Keeps Lane Studio's layer drawn: iD's walkthrough turns off every data layer but its own while it runs, and
 * doesn't turn them back on
 */
function keepLanesLayer(context: iD.Context) {
    const lanes = (context.layers() as any).layer('lanes');
    if (lanes && typeof lanes.enabled === 'function' && !lanes.enabled()) lanes.enabled(true);
}

/** Whether an element is shown, inside the window */
function onScreen(selector: string): boolean {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return !!rect && rect.width > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

/** The first of these on screen, or the map when none is (a step never points at nothing, or off the screen) */
function target(...selectors: string[]): string {
    // a field or section scrolled out of the sidebar is scrolled back into it first
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && !onScreen(selector) && element.closest('.sidebar')) element.scrollIntoView({ block: 'center' });
    }
    return selectors.find(onScreen) ?? '.main-map';
}

/** Pans the map so the first element matching `selector` is in the middle of it, if it is drawn off the screen */
function bringIntoView(context: iD.Context, selector: string) {
    const element = document.querySelector(selector);
    const map = document.querySelector('.main-map');
    if (!element || !map || onScreen(selector)) return;
    const rect = element.getBoundingClientRect();
    const view = map.getBoundingClientRect();
    (context.map() as any).pan([
        view.left + view.width / 2 - (rect.left + rect.width / 2),
        view.top + view.height / 2 - (rect.top + rect.height / 2)
    ]);
}

/** A chapter made of steps, each pointing at a part of the screen with an OK button to the next; the last says done */
function chapterOf(context: iD.Context, reveal: Reveal, id: string,
    steps: { at: () => string; key: string; before?: () => void; prepare?: () => void; vars?: () => Record<string, string> }[],
    first?: (next: () => void) => void): Chapter {
    const dispatch = d3_dispatch('done');
    let timer = 0;
    const chapter = {
        title: `_lanes.intro.${id}.title`,
        enter() {
            keepLanesLayer(context);
            const show = (i: number) => {
                if (i >= steps.length) {
                    dispatch.call('done');
                    return;
                }
                const step = steps[i];
                step.before?.();
                // (let the sidebar and the map draw what the step points at, and bring it into view)
                window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    step.prepare?.();
                    timer = window.setTimeout(() => reveal(step.at(), text(step.key, step.vars?.()),
                        { buttonText: ok(), buttonCallback: () => show(i + 1) }), step.prepare ? 300 : 0);
                }, 250);
            };
            if (first) first(() => show(0));
            else show(0);
        },
        exit() {
            window.clearTimeout(timer);
            context.on('enter.lanes-intro', null);
        }
    };
    return utilRebind(chapter, dispatch, 'on') as unknown as Chapter;
}

/** Select Main Street, zoomed in, so the Lanes section and the roadside + show */
function selectMainStreet(context: iD.Context) {
    context.map().centerZoom(mainStreetAt, 19.5);
    context.enter(modeSelect(context, [mainStreet]) as any);
}

export function lanesIntroWelcome(context: iD.Context, reveal: Reveal): Chapter {
    return chapterOf(context, reveal, 'welcome', [
        { at: () => '.intro-nav-wrap .chapter-lanes-welcome', key: 'welcome.welcome', before: () => context.map().centerZoom(mainStreetAt, 18.5) },
        { at: () => '.main-map', key: 'welcome.drawn' },
        { at: () => '.main-map', key: 'welcome.practice' },
        { at: () => '.intro-nav-wrap .chapter-lanes-lanes', key: 'welcome.chapters', vars: () => ({ next: t('_lanes.intro.lanes.title') }) }
    ]);
}

export function lanesIntroLanes(context: iD.Context, reveal: Reveal): Chapter {
    // first, click the road: the chapter goes on when Main Street is selected
    const first = (next: () => void) => {
        context.map().centerZoom(mainStreetAt, 19.5);
        window.setTimeout(() => reveal('.main-map', text('lanes.select')), 250);
        context.on('enter.lanes-intro', () => {
            const mode = context.mode() as { id: string; selectedIDs?: () => string[] } | undefined;
            if (mode?.id === 'select' && mode.selectedIDs?.().includes(mainStreet)) {
                context.on('enter.lanes-intro', null);
                next();
            }
        });
    };
    return chapterOf(context, reveal, 'lanes', [
        { at: () => target('.entity-editor-pane .section-lanes'), key: 'lanes.section' },
        { at: () => target('.lanes-strip', '.entity-editor-pane .section-lanes'), key: 'lanes.strip' },
        { at: () => target('.entity-editor-pane .section-lanes .lanes-tools', '.entity-editor-pane .section-lanes'), key: 'lanes.tools' },
        { at: () => target('.form-field-lanes_counts', '.entity-editor-pane .section-preset-fields'), key: 'lanes.fields' },
        { at: () => target('.form-field-lanes_maxspeed', '.entity-editor-pane .section-preset-fields'), key: 'lanes.speed' }
    ], first);
}

export function lanesIntroRoadside(context: iD.Context, reveal: Reveal): Chapter {
    return chapterOf(context, reveal, 'roadside', [
        { at: () => target('.roadside-add-button', '.main-map'), key: 'roadside.plus', before: () => selectMainStreet(context),
            prepare: () => bringIntoView(context, '.roadside-add-button') },
        { at: () => target('.form-field-lanes_sidewalk', '.entity-editor-pane .section-preset-fields'), key: 'roadside.fields' },
        { at: () => '.main-map', key: 'roadside.drawn' }
    ]);
}

export function lanesIntroTools(context: iD.Context, reveal: Reveal): Chapter {
    return chapterOf(context, reveal, 'tools', [
        { at: () => target('.lanes-mode-routing'), key: 'tools.routing', before: () => context.enter(modeBrowse(context) as any) },
        { at: () => target('.lanes-mode-speed'), key: 'tools.speed' },
        { at: () => target('.lanes-mode-measure'), key: 'tools.measure' },
        { at: () => target('.map-pane-control.lanes-key-control'), key: 'tools.key' },
        { at: () => target('.map-pane-control.lane-studio-control'), key: 'tools.settings' },
        { at: () => target('.map-control.issues-control'), key: 'tools.checks' }
    ]);
}

export function lanesIntroStartEditing(context: iD.Context, reveal: Reveal): Chapter {
    const dispatch = d3_dispatch('done', 'startEditing');
    let modal: any = null;
    const chapter = {
        title: '_lanes.intro.start.title',
        enter() {
            keepLanesLayer(context);
            reveal(target('.map-control.help-control'), text('start.help'), {
                buttonText: ok(),
                buttonCallback: () => reveal(target('.top-toolbar button.save'), text('start.save'), {
                    buttonText: ok(), tooltipBox: belowTopBar('.top-toolbar button.save'),
                    buttonCallback: () => reveal('.main-map', text('start.rules'), { buttonText: ok(), buttonCallback: start })
                })
            });
        },
        exit() {
            modal?.remove();
        }
    };
    function start() {
        modal = uiModal(context.container());
        modal.select('.modal').attr('class', 'modal-splash modal');
        modal.selectAll('.close').remove();
        const button = modal.select('.content').attr('class', 'fillL')
            .append('button').attr('class', 'modal-section huge-modal-button')
            .on('click', () => modal.remove());
        button.append('svg').attr('class', 'illustration').append('use').attr('xlink:href', '#iD-logo-walkthrough');
        button.append('h2').text(t('_lanes.intro.start.start'));
        dispatch.call('startEditing');
        keepLanesLayer(context);
    }
    return utilRebind(chapter, dispatch, 'on') as unknown as Chapter;
}

/** Lane Studio's chapters, for iD's walkthrough hook */
export const lanesIntroChapters = [
    { id: 'lanes-welcome', create: lanesIntroWelcome },
    { id: 'lanes-lanes', create: lanesIntroLanes },
    { id: 'lanes-roadside', create: lanesIntroRoadside },
    { id: 'lanes-tools', create: lanesIntroTools },
    { id: 'lanes-start', create: lanesIntroStartEditing }
];
