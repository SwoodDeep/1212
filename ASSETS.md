# Использованные ресурсы и лицензии

Все ассеты скачаны и лежат локально в `public/assets/` — игра не обращается к внешним сайтам во время работы.

## 3D-модели — Kenney (CC0 1.0 Universal, https://kenney.nl)

Лицензия каждого набора: `License.txt` (CC0, «public domain», коммерческое использование разрешено без указания авторства).

| Набор | Что взято | Куда |
| --- | --- | --- |
| Car Kit (kenney.nl/assets/car-kit) | 5 машин: `race`, `race-future`, `sedan-sports`, `hatchback-sports`, `kart-oozi`; конусы | `public/assets/models/cars/` |
| Racing Kit (kenney.nl/assets/racing-kit) | барьеры, заборы, фонари, стартовый мост (`overhead`), флаги, трибуна, палатка, билборды, пylon'ы | `public/assets/models/props/` |
| Nature Kit (kenney.nl/assets/nature-kit) | 8 видов деревьев, 6 видов камней | `public/assets/models/trees/`, `rocks/` |
| City Kit Suburban (kenney.nl/assets/city-kit-suburban) | 8 типов домов, деревья, заборы для деревни | `public/assets/models/buildings/` |
| Particle Pack (kenney.nl/assets/particle-pack) | текстуры частиц (smoke, spark, flame) | `public/assets/particles/` |

## Текстуры и HDRI — Poly Haven (CC0, https://polyhaven.com)

- `asphalt_track` (diff/nor/arm, 1k) — асфальт трассы
- `aerial_asphalt_01` — запасной асфальт
- `aerial_grass_rock` (diff/nor/arm, 1k) — трава/террейн
- `bicolour_gravel` — обочины
- `blue_metal_plate` — металл
- HDRI `kloofendal_43d_clear_puresky` (1k + 2k) — небо и освещение/отражения (PMREM)

## Звуки

- Kenney Interface Sounds / Digital Audio / Impact Sounds (CC0): клики UI, сигналы отсчёта, power-up, удары металла → `public/assets/audio/ui|beep|impact/`
- OpenGameArt «racing car engine sound loops» by domasx2 (CC0, opengameart.org/content/racing-car-engine-sound-loops): лупы мотора `engine_loop_0/3.wav` → `public/assets/audio/engine/`
- Двигатель игрока, визг шин, ветер, нитро — синтез в реальном времени через Web Audio API (собственная генерация, без внешних файлов).

## Свой код

Весь движок, физика, AI, UI, генерация трассы/террейна/расстановка объектов — написаны с нуля (MIT, этот проект).
