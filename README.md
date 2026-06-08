# Ballista - Tactical Command

**Ballista - Tactical Command** is a tactical artillery command game about reading orders, plotting bearings, calculating fire data, and operating a heavy gun under time pressure.

The game is built as a browser-based interface with a minimalist tactical map, radio traffic, paper-style orders, operator notes, setup phases, and manual fire-control workflow.

## Play

For non-technical users:

1. Double-click `setup.bat` once.
2. Double-click `start.bat`.
3. The game opens at `http://127.0.0.1:5173/`.
4. Double-click `stop.bat` when finished.

See [START_HERE.md](START_HERE.md) for the shortest setup instructions.

## Developer Commands

```bash
npm install
npm run start
npm run build
```

## Current Features

- Version 0.8 fire-control workflow with briefing, setup, plotting, fire data, loading, ready check, and impact evaluation
- Randomized missions with infantry, armored vehicle, bunker, observation post, and artillery battery targets
- Multi-target assignments and emergency radio retasks during active operations
- 10-minute setup phase with optional early start for placing Gun and Spotter pins
- Tactical map with zoom, pan, major grid, 10x10 subgrids, player-placed pins, and deleteable plotting lines
- Manual triangulation using white guide lines, yellow bearing lines, and gun-anchored red range markers
- Ballistic calculator with ammunition type, charge selection, elevation solution, and kilometer-based range handling
- Distinct HE, AP, Smoke, and Star ammunition behavior, including reveal shots and impact-radius visualization
- Animated gun traverse, elevation instruments, projectile flight, impact markers, and target result feedback
- Orders archive with previous mission results, radio ticker, radio console, operator guidebook, and draggable Quick Notes
- Dynamic background music playlist from `public/music` with crossfade and separate music control

## Screenshots

### Tactical Overview

![Tactical overview](docs/screenshots/overview.png)

### Operator Guidebook

![Operator guidebook](docs/screenshots/operator-guidebook.png)

### Orders

![Orders dispatch](docs/screenshots/orders.png)

### Radio Console

![Radio console](docs/screenshots/radio-console.png)

## Credits and Disclaimer

Ballista - Tactical Command is an independent game inspired in part by the atmosphere and artillery-command fantasy of [Iron Nest](https://store.steampowered.com/app/2950790/IRON_NEST_Heavy_Turret_Simulator/). It is not affiliated with, endorsed by, or connected to Iron Nest or its creators.

This project exists because waiting for release is hard, and sometimes a fire-control crew just wants to do target practice.

Background music is created by AIMusics aka AsaTyr and is included for use within this project.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
