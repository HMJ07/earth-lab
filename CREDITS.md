# Credits & licences

Earth Lab stands on open data and open source. Thank you to everyone below.

## Data

| Source                                                                           | Used for                                      | Licence / terms                                                                                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/) | Earthquake feed                               | U.S. Government work, public domain                                                                                                                        |
| [CelesTrak](https://celestrak.org/) (T.S. Kelso)                                 | Satellite orbital elements (TLE)              | Free to use. CelesTrak asks clients not to download the same data more than about every 2 hours; Earth Lab caches for 2 h                                  |
| [NASA EONET](https://eonet.gsfc.nasa.gov/)                                       | Wildfires, storms, volcanoes, floods, sea ice | NASA data, free to use with attribution                                                                                                                    |
| [Open-Meteo](https://open-meteo.com/)                                            | Surface wind                                  | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Free tier is for non-commercial use; weather data from national weather services via Open-Meteo |

If you deploy Earth Lab commercially, review each provider's terms (notably Open-Meteo's).

## Imagery

| Texture              | Source                                                                                                                        | Notes                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `earth_day_4k.jpg`   | [NASA Visible Earth — Blue Marble Next Generation with topography and bathymetry](https://visibleearth.nasa.gov/images/73909) | NASA Earth Observatory (Reto Stöckli). Public domain. Resized to 4096×2048                                         |
| `earth_night_4k.jpg` | [NASA Earth Observatory — Black Marble 2016](https://visibleearth.nasa.gov/images/144898)                                     | Based on Suomi NPP VIIRS data processed at NASA's Goddard Space Flight Center. Public domain. Resized to 4096×2048 |
| `earth_clouds.png`   | [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets)                                    | Cloud layer texture shipped with the three.js examples (MIT project). Used decoratively                            |

NASA media usage guidelines: <https://www.nasa.gov/nasa-brand-center/images-and-media/>. NASA does not endorse this project.

## Software

| Package                                                                                                               | Licence    |
| --------------------------------------------------------------------------------------------------------------------- | ---------- |
| [three.js](https://threejs.org/)                                                                                      | MIT        |
| [satellite.js](https://github.com/shashwatak/satellite-js)                                                            | MIT        |
| [Vite](https://vite.dev/) · [Vitest](https://vitest.dev/)                                                             | MIT        |
| [TypeScript](https://www.typescriptlang.org/)                                                                         | Apache-2.0 |
| [ESLint](https://eslint.org/) · [typescript-eslint](https://typescript-eslint.io/) · [Prettier](https://prettier.io/) | MIT        |
