import { CoastalWorld } from './world/environment.js';
import { coastalDrivingRoute } from './world/route.js';
import { DesertWorld } from './world/desert.js';
import { desertDrivingRoute } from './world/desert-route.js';
import { SnowWorld } from './world/snow.js';
import { snowDrivingRoute } from './world/snow-route.js';

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
  snow: {
    title: 'Midnight Alpine', label: 'MIDNIGHT ALPINE', routeNumber: '3', World: SnowWorld, route: snowDrivingRoute,
    weather: 'A little mountain moonlight', temperature: '−6°',
    introduction: 'Snow on the peaks. A warm light around the bend.',
    breather: 'The mountains will be here.', sound: 'A little mountain wind, a little engine',
    canvas: 'A snowy mountain road at night, with moonlit cliffs, alpine pines, guardrails and warm lamps. Drive with WASD or the arrow keys.',
  },
};
