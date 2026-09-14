import { CoastalWorld } from './world/environment.js';
import { coastalDrivingRoute } from './world/route.js';
import { DesertWorld } from './world/desert.js';
import { desertDrivingRoute } from './world/desert-route.js';

export const JOURNEYS = {
  coast: {
    title: 'Pacific Coast', label: 'PACIFIC COAST', routeNumber: '1', World: CoastalWorld, route: coastalDrivingRoute,
    weather: 'A little Pacific air', temperature: '18°',
    introduction: 'A little car. An open road. A coast without end.',
    breather: 'The coast will be here.', sound: 'A little ocean, a little engine',
    canvas: 'A low-poly coastal landscape. Drive with WASD or the arrow keys.',
  },
  desert: {
    title: 'Red Rock Desert', label: 'RED ROCK DESERT', routeNumber: '2', World: DesertWorld, route: desertDrivingRoute,
    weather: 'The last warm light', temperature: '26°',
    introduction: 'Canyon walls. Quiet roads. The last warm light.',
    breather: 'The desert will be here.', sound: 'A little desert wind, a little engine',
    canvas: 'A continuous rocky canyon with sandstone cliffs and Joshua trees in warm evening light. Drive with WASD or the arrow keys.',
  },
};
