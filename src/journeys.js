import { CoastalWorld } from './world/environment.js';
import { coastalDrivingRoute } from './world/route.js';
import { DesertWorld } from './world/desert.js';
import { desertDrivingRoute } from './world/desert-route.js';
import { SnowWorld } from './world/snow.js';
import { snowDrivingRoute } from './world/snow-route.js';

export const JOURNEYS = {
  coast: {
    title: 'Pacific Coast', label: 'PACIFIC COAST', routeNumber: '1', World: CoastalWorld, route: coastalDrivingRoute,
    weather: 'Coastal breeze', temperature: '64°F',
    introduction: 'Drive the Pacific Coast through green hills and ocean views.',
    sound: 'Ocean and engine sounds on',
    canvas: 'A low-poly coastal landscape. Drive with WASD or the arrow keys.',
  },
  desert: {
    title: 'Red Rock Desert', label: 'RED ROCK DESERT', routeNumber: '2', World: DesertWorld, route: desertDrivingRoute,
    weather: 'Clear skies', temperature: '79°F',
    introduction: 'Drive through sandstone canyons in the evening sun.',
    sound: 'Desert wind and engine sounds on',
    canvas: 'A continuous rocky canyon with sandstone cliffs and Joshua trees in warm evening light. Drive with WASD or the arrow keys.',
  },
  snow: {
    title: 'Midnight Alpine', label: 'MIDNIGHT ALPINE', routeNumber: '3', World: SnowWorld, route: snowDrivingRoute,
    weather: 'Light snow', temperature: '21°F',
    introduction: 'Follow a snowy mountain road under the night sky.',
    sound: 'Mountain wind and engine sounds on',
    canvas: 'A snowy mountain road at night, with moonlit cliffs, alpine pines, guardrails and warm lamps. Drive with WASD or the arrow keys.',
  },
};
