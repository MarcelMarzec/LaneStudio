import { select as d3_select } from 'd3-selection';

import { laneStudioMark, uiLaneStudioLogo } from '../../../../modules/lanes/ui/logo';

describe('Lane Studio logo', () => {
    it('puts the name and mark first in the sidebar', () => {
        const sidebar = d3_select(document.createElement('div'));
        sidebar.append('div').attr('class', 'feature-list-pane');
        uiLaneStudioLogo(sidebar as any);
        const first = sidebar.node()!.firstElementChild!;
        expect(first.classList.contains('lanes-brand')).toBe(true);
        expect(first.textContent).toBe('LaneStudio');
        expect(first.querySelector('svg')).not.toBeNull();
    });

    it('is an SVG that stands alone, as the page icon in lanes.html is', () => {
        expect(laneStudioMark.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    });
});
