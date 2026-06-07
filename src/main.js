import "./styles.css";

const app = document.querySelector("#app");

const ammoTypes = {
  HE: {
    label: "HE",
    description: "Open targets",
    color: "#d0aa5d",
    massKg: 96,
    muzzleVelocity: 520,
    dragCoefficient: 0.000042,
    blastRadius: 110,
    penetration: 8,
    scatterMeters: 24,
    count: 8,
  },
  AP: {
    label: "AP",
    description: "Hard targets",
    color: "#d8d4bf",
    massKg: 112,
    muzzleVelocity: 610,
    dragCoefficient: 0.000035,
    blastRadius: 28,
    penetration: 80,
    scatterMeters: 8,
    count: 5,
  },
  SMOKE: {
    label: "Smoke",
    description: "Mark and screen",
    color: "#a7b0a7",
    massKg: 88,
    muzzleVelocity: 470,
    dragCoefficient: 0.00005,
    blastRadius: 0,
    smokeRadius: 65,
    penetration: 0,
    scatterMeters: 24,
    count: 4,
  },
  ILLUMINATION: {
    label: "Star",
    description: "Recon and reveal",
    color: "#f1e2a2",
    massKg: 72,
    muzzleVelocity: 455,
    dragCoefficient: 0.000055,
    blastRadius: 0,
    lightRadius: 130,
    penetration: 0,
    scatterMeters: 30,
    count: 3,
  },
};

const chargeLevels = {
  1: { velocity: 0.72, stress: 0.05, label: "1 - Low" },
  2: { velocity: 0.86, stress: 0.08, label: "2 - Reduced" },
  3: { velocity: 1.0, stress: 0.12, label: "3 - Standard" },
  4: { velocity: 1.12, stress: 0.18, label: "4 - High" },
  5: { velocity: 1.22, stress: 0.28, label: "5 - Max" },
};

const environment = {
  gravity: 9.81,
  wind: { x: 3.0, y: -1.2, z: 0 },
};

const setupDurationSeconds = 600;
const quickNoteStorageKey = "ballista.quickNoteLayout";
const quickNoteDefaultLayout = { x: null, y: null, width: 260, height: 122 };

const mapConfig = {
  baseScale: 0.13,
  originX: 78,
  originBottom: 88,
  majorWidth: 1180 / 12,
  majorHeight: 760 / 9,
  columns: 12,
  rows: 9,
  minZoom: 0.8,
  maxZoom: 3.2,
};

const targetProfiles = [
  {
    key: "infantry",
    label: "Infantry",
    radio: "Infantry in open position.",
    requiredAmmo: "HE",
    targetRadius: 55,
    armor: 0,
    effect: "Suppress / Destroy",
    priority: "Medium",
  },
  {
    key: "armored",
    label: "Armored vehicles",
    radio: "Armored vehicles halted.",
    requiredAmmo: "AP",
    targetRadius: 45,
    armor: 55,
    effect: "Disable",
    priority: "High",
  },
  {
    key: "bunker",
    label: "Bunker",
    radio: "Bunker position, covered entrance.",
    requiredAmmo: "AP",
    targetRadius: 70,
    armor: 85,
    effect: "Penetrate / Destroy",
    priority: "High",
  },
  {
    key: "battery",
    label: "Artillery battery",
    radio: "Enemy battery active.",
    requiredAmmo: "HE",
    targetRadius: 80,
    armor: 14,
    effect: "Disable / Destroy",
    priority: "High",
  },
  {
    key: "observation",
    label: "Observation post",
    radio: "Observation post directing fire.",
    requiredAmmo: "HE",
    targetRadius: 90,
    armor: 0,
    effect: "Reveal / Suppress",
    priority: "Low",
  },
];

let missionNumber = 0;
let mission = createMission();
let gunPosition = mission.gunPosition;
let spotters = mission.spotters;

const state = {
  phase: "Briefing",
  tool: "yellow",
  activePin: null,
  mapZoom: 1,
  mapOffset: { x: 0, y: 0 },
  pins: createEmptyPins(),
  lineStart: null,
  helperLines: [],
  bearingLines: [],
  distanceLine: null,
  calcBearingInput: "",
  calcDistanceInput: "",
  calcElevation: "",
  recommendedCharge: 3,
  selectedCharge: 3,
  selectedAmmo: "HE",
  firingBearing: "",
  firingElevation: "",
  currentBearing: 70,
  currentElevation: 4,
  fuseMode: "impact",
  fuseTime: 8,
  checklist: {
    breech: false,
    quadrant: false,
    recoil: false,
    command: false,
  },
  barrelHeat: 0.12,
  setupRemaining: setupDurationSeconds,
  timeRemaining: mission.timeLimitSeconds,
  missionStarted: false,
  orderLog: [mission],
  helpOpen: false,
  guidePage: "process",
  orderOpen: false,
  showPreviousOrders: false,
  logOpen: false,
  resultOpen: false,
  result: null,
  quickNote: "",
  quickNoteLayout: loadQuickNoteLayout(),
  revealedTarget: false,
  busy: null,
  trajectory: [],
  projectileIndex: -1,
  lastImpact: null,
  effects: [],
  ammoCounts: Object.fromEntries(
    Object.entries(ammoTypes).map(([key, value]) => [key, value.count]),
  ),
  log: [
    {
      type: "warn",
      text: `${mission.id} received. Review orders, then start mission setup.`,
    },
  ],
};

let canvas;
let ctx;
let busyTimer = null;
let missionTimer = null;
let projectileTimer = null;
let mapDrag = null;

function render() {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>Ballista - Tactical Command</h1>
          <p>Prototype 0.4 - Fire control map</p>
        </div>
        <div class="radio-ticker" aria-label="Latest radio message">
          <span>RX</span>
          <div><strong>${escapeHtml(latestRadioText())}</strong></div>
        </div>
        <div class="phase-lights" aria-label="Mission phases">
          ${phaseLight("Briefing", "BRF")}
          ${phaseLight("Setup", "SET")}
          ${phaseLight("Plotting", "PLT")}
          ${phaseLight("FireDataSet", "DAT")}
          ${phaseLight("ReadyToFire", "RDY")}
          ${phaseLight("MissionComplete", "CMP")}
        </div>
        <div class="status-strip">
          <button id="helpBtn" type="button">Help</button>
          <button id="orderBtn" type="button">Orders</button>
          <button id="logBtn" type="button">Radio</button>
          <span id="phasePill" class="pill">Phase: ${phaseLabel(state.phase)}</span>
          <button id="startMissionBtn" class="setup-button" type="button" ${canUseMissionButton() ? "" : "disabled"}>${missionButtonLabel()}</button>
          <span id="timePill" class="pill">Time: ${state.missionStarted ? formatTime(state.timeRemaining) : "standby"}</span>
          <span id="heatPill" class="pill">Heat: ${Math.round(state.barrelHeat * 100)}%</span>
          <span class="pill">Wind: ${environment.wind.x.toFixed(1)} / ${environment.wind.y.toFixed(1)} m/s</span>
        </div>
      </header>

      <section class="grid map-first">
        <aside class="panel pin-tablet">
          <div class="panel-header">
            <h2>Pins</h2>
            <span class="pill">${placedPinCount()}/7</span>
          </div>
          <div class="pin-list">
            ${pinButton("gun", "Gun", "cannon", "Gun position")}
            ${pinButton("S1", "S1", "spotter", "Spotter 1")}
            ${pinButton("S2", "S2", "spotter", "Spotter 2")}
            ${pinButton("S3", "S3", "spotter", "Spotter 3")}
            ${pinButton("T1", "T1", "target", "Target pin 1")}
            ${pinButton("T2", "T2", "target", "Target pin 2")}
            ${pinButton("T3", "T3", "target", "Target pin 3")}
          </div>
        </aside>

        <article class="panel map-panel">
          <div class="panel-header">
            <h2>Tactical Map</h2>
            <span class="pill">Grid A-1</span>
          </div>
          <div class="toolbelt">
            ${toolButton("white", "W", "White guide line")}
            ${toolButton("yellow", "Y", "Yellow bearing line")}
            ${toolButton("red", "R", "Red range line")}
            ${toolButton("pan", "P", "Pan map")}
            ${toolButton("delete", "D", "Delete line")}
            <button id="undoLineBtn" type="button" ${canEditMap() ? "" : "disabled"}>Undo</button>
            <button id="clearLinesBtn" type="button" ${canEditMap() ? "" : "disabled"}>Clear</button>
            <div class="zoom-tools" aria-label="Map zoom controls">
              <button id="zoomOutBtn" type="button" title="Zoom out" ${canUseMapControls() ? "" : "disabled"}>-</button>
              <span>${Math.round(state.mapZoom * 100)}%</span>
              <button id="zoomInBtn" type="button" title="Zoom in" ${canUseMapControls() ? "" : "disabled"}>+</button>
              <button id="zoomResetBtn" type="button" title="Reset zoom" ${canUseMapControls() ? "" : "disabled"}>Reset</button>
            </div>
          </div>
          <div class="map-wrap main-map">
            <canvas id="map" width="1180" height="760" aria-label="Tactical Map"></canvas>
            <div class="map-hint">${mapHint()}</div>
          </div>
        </article>

        <div class="right-column">
          ${showCalculatorPanel() ? `<article class="panel compact-panel">
            <div class="panel-header">
              <h2>Calculator</h2>
              <span class="pill">manual</span>
            </div>
            <div class="panel-body">
              <div class="form-grid">
                <label>Ammo
                  <select id="ammo" ${isLocked() ? "disabled" : ""}>
                    ${Object.entries(ammoTypes).map(([key, ammo]) => `<option value="${key}" ${key === state.selectedAmmo ? "selected" : ""}>${ammo.label} - ${ammo.description}</option>`).join("")}
                  </select>
                </label>
                <label>Powder Charge
                  <select id="selectedCharge" ${isLocked() ? "disabled" : ""}>
                    ${Object.entries(chargeLevels).map(([level, data]) => `<option value="${level}" ${Number(level) === state.selectedCharge ? "selected" : ""}>${data.label}</option>`).join("")}
                  </select>
                </label>
                <label>Bearing
                  <input id="calcBearing" type="number" min="0" max="360" step="0.1" value="${state.calcBearingInput}" placeholder="e.g. 75.8" ${isLocked() ? "disabled" : ""}>
                </label>
                <label>Range km
                  <input id="calcDistance" type="number" min="0.05" max="9" step="0.01" value="${state.calcDistanceInput}" placeholder="e.g. 3.94" ${isLocked() ? "disabled" : ""}>
                </label>
                <label>Elevation
                  <input id="calcElevation" type="text" value="${state.calcElevation}" readonly>
                </label>
                <label>Charge Rec.
                  <input id="recommendedCharge" type="text" value="Charge ${state.recommendedCharge}" readonly>
                </label>
                <label>Fuse
                  <select id="fuseMode" ${isLocked() ? "disabled" : ""}>
                    <option value="impact" ${state.fuseMode === "impact" ? "selected" : ""}>Impact</option>
                    <option value="delay" ${state.fuseMode === "delay" ? "selected" : ""}>Delay</option>
                    <option value="timed" ${state.fuseMode === "timed" ? "selected" : ""}>Timed / Airburst</option>
                  </select>
                </label>
                <label>Fuse Time
                  <input id="fuseTime" type="number" min="0" max="80" step="0.1" value="${state.fuseTime}" ${isLocked() ? "disabled" : ""}>
                </label>
              </div>

              <div class="button-row">
                <button id="calcBtn" type="button" ${canCalculate() ? "" : "disabled"}>Calculate</button>
                <button id="applySolutionBtn" type="button" ${canApplySolution() ? "" : "disabled"}>Set Data</button>
              </div>

              <div class="progress-wrap">
                <div class="progress"><div style="width: ${state.busy ? state.busy.progress * 100 : 0}%"></div></div>
              </div>
            </div>
          </article>` : `<article class="panel compact-panel collapsed-panel">
            <div class="panel-header">
              <h2>Calculator</h2>
              <span class="pill">${state.firingElevation ? `${state.firingElevation} deg / C${state.selectedCharge}` : "stowed"}</span>
            </div>
          </article>`}

          ${showMachinePanel() ? `<article class="panel compact-panel">
            <div class="panel-header">
              <h2>Gun</h2>
              <span class="pill">${state.busy ? state.busy.label : machineStatusLabel()}</span>
            </div>
            <div class="panel-body">
              <div class="button-row">
                <button id="alignBtn" class="primary" type="button" ${canAlign() ? "" : "disabled"}>Traverse</button>
                <button id="loadBtn" type="button" ${canLoad() ? "" : "disabled"}>Load</button>
              </div>
              <div class="progress-wrap">
                <div class="progress"><div style="width: ${state.busy ? state.busy.progress * 100 : 0}%"></div></div>
              </div>
            </div>
          </article>` : ""}

          ${showChecklistPanel() ? `<article class="panel">
            <div class="panel-header">
              <h2>Ready Check</h2>
              <span class="pill">${checklistCount()}/4 Checks</span>
            </div>
            <div class="panel-body">
              <div class="checklist">
                ${checkRow("breech", "Breech locked")}
                ${checkRow("quadrant", "Quadrant confirmed")}
                ${checkRow("recoil", "Recoil path clear")}
                ${checkRow("command", "Fire order confirmed")}
              </div>
              <button id="fireBtn" class="danger fire-wide" type="button" ${canFire() ? "" : "disabled"}>Fire</button>
            </div>
          </article>` : ""}

        </div>
      </section>

      ${state.helpOpen ? `
        <div class="modal-backdrop">
          <article class="modal guidebook">
            <div class="guidebook-cover">
              <div>
                <span>Field Manual TC-07</span>
                <h2>Ballista Operator Guide</h2>
              </div>
              <strong>Restricted</strong>
              <button id="closeHelpBtn" type="button">Close</button>
            </div>
            <div class="guidebook-body">
              <div class="manual-book">
                ${guidebookSpread()}
              </div>
              <nav class="manual-bookmarks" aria-label="Guidebook chapters">
                ${guideBookmark("process", "Process")}
                ${guideBookmark("map", "Map")}
                ${guideBookmark("plotting", "Plotting")}
                ${guideBookmark("ammo", "Ammo")}
              </nav>
            </div>
          </article>
        </div>
      ` : ""}

      ${state.orderOpen ? `
        <div class="modal-backdrop">
          <article class="modal">
            <div class="panel-header">
              <h2>Orders</h2>
              <button id="closeOrderBtn" type="button">Close</button>
            </div>
            <div class="panel-body orders-body">
              <div class="order-controls">
                <span>Current dispatch</span>
                <button id="previousOrdersBtn" type="button" ${state.orderLog.length > 1 ? "" : "disabled"}>${state.showPreviousOrders ? "Hide Previous" : "View Previous"}</button>
              </div>
              ${orderSheet(state.orderLog[0])}
              ${state.showPreviousOrders ? `
                <div class="previous-orders">
                  ${state.orderLog.slice(1).map((order) => orderSheet(order, true)).join("")}
                </div>
              ` : ""}
            </div>
          </article>
        </div>
      ` : ""}

      ${state.logOpen ? `
        <div class="modal-backdrop">
          <article class="modal radio-console">
            <div class="radio-console-head">
              <div>
                <span>AN/PRC-77 FIELD SET</span>
                <h2>Radio Traffic</h2>
              </div>
              <div class="radio-frequency">
                <span>CH 03</span>
                <strong>47.350</strong>
              </div>
              <button id="closeLogBtn" type="button">Close</button>
            </div>
            <div class="radio-body">
              <div class="radio-meter">
                <span class="lamp lamp-on"></span>
                <span>RX</span>
                <div><i style="width: ${radioSignalLevel()}%"></i></div>
                <span>SIG</span>
              </div>
              <div class="radio-speaker" aria-hidden="true">
                ${Array.from({ length: 42 }, () => "<span></span>").join("")}
              </div>
              <div class="radio-log modal-log">
                ${state.log.map((entry, index) => `<div class="radio-entry ${entry.type} ${index === 0 ? "latest" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(entry.text)}</p></div>`).join("")}
              </div>
            </div>
          </article>
        </div>
      ` : ""}

      ${state.resultOpen && state.result ? `
        <div class="modal-backdrop">
          <article class="modal">
            <div class="panel-header">
              <h2>Result ${mission.id}</h2>
              <button id="nextMissionBtn" type="button">Next Mission</button>
            </div>
            <div class="panel-body">
              <div class="brief-grid">
                <div><span>Status</span><strong>${state.result.success ? "Complete" : "Failed"}</strong></div>
                <div><span>Accuracy</span><strong>${state.result.accuracyLabel}</strong></div>
                <div><span>Miss</span><strong>${formatDistance(state.result.missDistance)}</strong></div>
                <div><span>Ammo</span><strong>${state.result.ammoLabel}</strong></div>
                <div><span>Time</span><strong>${state.result.elapsedSeconds}s</strong></div>
                <div><span>Score</span><strong>${state.result.score}/100</strong></div>
              </div>
              <p class="order-text">${state.result.summary}</p>
            </div>
          </article>
        </div>
      ` : ""}

      <footer class="footer">
        <span>White guide lines. Yellow bearings. Red range.</span>
        <span></span>
      </footer>

      <div class="gauge-dock">
        <div class="mini-gauge drum-gauge"><span>Bearing</span><strong>${state.currentBearing.toFixed(1)} deg</strong></div>
        <div class="mini-gauge drum-gauge"><span>Elevation</span><strong>${state.currentElevation.toFixed(1)} deg</strong></div>
        <div class="mini-gauge"><span>Range</span><strong>${state.distanceLine ? formatDistance(lineDistance(state.distanceLine)) : "--"}</strong></div>
        <div class="mini-gauge"><span>Fire Data</span><strong>${state.firingElevation ? `${state.firingElevation} deg` : "--"}</strong></div>
      </div>

      <aside class="quick-note" style="${quickNoteStyle()}">
        <div class="quick-note-head" id="quickNoteDragHandle" title="Drag note">
          <strong>Quick Note</strong>
          <span>${state.quickNote.length}/240</span>
          <button id="quickNoteResetBtn" type="button" title="Reset note position">Reset</button>
        </div>
        <textarea id="quickNote" maxlength="240" spellcheck="false" placeholder="scratch bearings, range, charge...">${escapeHtml(state.quickNote)}</textarea>
        <div id="quickNoteResizeHandle" class="quick-note-resize" title="Resize note"></div>
      </aside>
    </main>
  `;

  canvas = document.querySelector("#map");
  ctx = canvas.getContext("2d");
  bindEvents();
  drawMap();
}

function bindEvents() {
  document.querySelector("#helpBtn").addEventListener("click", () => {
    state.helpOpen = true;
    render();
  });
  document.querySelector("#orderBtn").addEventListener("click", () => {
    state.orderOpen = true;
    render();
  });
  document.querySelector("#logBtn").addEventListener("click", () => {
    state.logOpen = true;
    render();
  });
  document.querySelector("#closeOrderBtn")?.addEventListener("click", () => {
    state.orderOpen = false;
    render();
  });
  document.querySelector("#closeHelpBtn")?.addEventListener("click", () => {
    state.helpOpen = false;
    render();
  });
  document.querySelectorAll("[data-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      state.guidePage = button.dataset.guide;
      render();
    });
  });
  document.querySelector("#previousOrdersBtn")?.addEventListener("click", () => {
    state.showPreviousOrders = !state.showPreviousOrders;
    render();
  });
  document.querySelector("#closeLogBtn")?.addEventListener("click", () => {
    state.logOpen = false;
    render();
  });
  document.querySelector("#nextMissionBtn")?.addEventListener("click", startNextMission);
  document.querySelector("#startMissionBtn")?.addEventListener("click", startMission);
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = button.dataset.tool;
      state.activePin = null;
      state.lineStart = null;
      render();
    });
  });
  document.querySelectorAll("[data-pin]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePin = state.activePin === button.dataset.pin ? null : button.dataset.pin;
      state.lineStart = null;
      render();
    });
  });
  document.querySelector("#quickNote")?.addEventListener("input", (event) => {
    state.quickNote = event.target.value;
    document.querySelector(".quick-note-head span").textContent = `${state.quickNote.length}/240`;
  });
  document.querySelector("#quickNoteDragHandle")?.addEventListener("pointerdown", startQuickNoteDrag);
  document.querySelector("#quickNoteResizeHandle")?.addEventListener("pointerdown", startQuickNoteResize);
  document.querySelector("#quickNoteResetBtn")?.addEventListener("click", resetQuickNoteLayout);
  document.querySelector("#undoLineBtn").addEventListener("click", undoLine);
  document.querySelector("#clearLinesBtn").addEventListener("click", clearLines);
  canvas.addEventListener("pointerdown", handleMapPointerDown);
  canvas.addEventListener("pointerup", handleMapPointerUp);
  canvas.addEventListener("pointerleave", handleMapPointerLeave);
  canvas.addEventListener("click", handleMapClick);
  canvas.addEventListener("mousemove", handleMapMove);
  canvas.addEventListener("wheel", handleMapWheel, { passive: false });
  document.querySelector("#zoomOutBtn")?.addEventListener("click", () => zoomMap(0.85));
  document.querySelector("#zoomInBtn")?.addEventListener("click", () => zoomMap(1.18));
  document.querySelector("#zoomResetBtn")?.addEventListener("click", resetMapZoom);
  document.querySelector("#ammo")?.addEventListener("change", (event) => {
    state.selectedAmmo = event.target.value;
    invalidateCalculation();
    log(`Ammo selected: ${ammoTypes[state.selectedAmmo].label}. Recalculate.`, "warn");
    render();
  });
  document.querySelector("#selectedCharge")?.addEventListener("change", (event) => {
    state.selectedCharge = Number(event.target.value);
    invalidateFiringData();
    render();
  });
  document.querySelector("#calcBearing")?.addEventListener("input", (event) => {
    state.calcBearingInput = event.target.value;
    invalidateCalculation();
  });
  document.querySelector("#calcDistance")?.addEventListener("input", (event) => {
    state.calcDistanceInput = event.target.value;
    invalidateCalculation();
  });
  document.querySelector("#fuseMode")?.addEventListener("change", (event) => {
    state.fuseMode = event.target.value;
  });
  document.querySelector("#fuseTime")?.addEventListener("input", (event) => {
    state.fuseTime = Number(event.target.value);
  });
  document.querySelector("#calcBtn")?.addEventListener("click", calculateSolution);
  document.querySelector("#applySolutionBtn")?.addEventListener("click", applySolution);
  document.querySelector("#alignBtn")?.addEventListener("click", startAlignment);
  document.querySelector("#loadBtn")?.addEventListener("click", startLoading);
  document.querySelectorAll("[data-check]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.checklist[checkbox.dataset.check] = checkbox.checked;
      render();
    });
  });
  document.querySelector("#fireBtn")?.addEventListener("click", fire);
  document.querySelectorAll("[data-note]").forEach((element) => {
    element.addEventListener("click", () => {
      appendQuickNote(element.dataset.note);
    });
  });
}

function toolButton(tool, label, title) {
  const disabled = canUseMapControls() && (tool === "pan" || canEditMap()) ? "" : "disabled";
  return `<button data-tool="${tool}" class="tool-button ${state.tool === tool ? "active-tool" : ""}" type="button" title="${title}" aria-label="${title}" ${disabled}>${label}</button>`;
}

function pinButton(id, label, type, title) {
  const pin = state.pins[id];
  const disabled = canUsePin(type) ? "" : "disabled";
  return `
    <button data-pin="${id}" class="pin-button ${type} ${state.activePin === id ? "active-pin" : ""}" type="button" title="${title}" ${disabled}>
      <span class="pin-icon">${type === "cannon" ? "G" : label}</span>
      <strong>${label}</strong>
      <small>${pin ? gridReference(pin) : "unset"}</small>
    </button>
  `;
}

function guideBookmark(key, label) {
  return `<button data-guide="${key}" class="${state.guidePage === key ? "active-bookmark" : ""}" type="button">${label}</button>`;
}

function phaseLight(phase, label) {
  const active = phaseLightActive(phase);
  return `<span class="${active ? "active-phase" : ""}"><i></i>${label}</span>`;
}

function phaseLightActive(phase) {
  if (phase === state.phase) return true;
  if (phase === "Plotting" && ["Calculator", "Correction"].includes(state.phase)) return true;
  if (phase === "FireDataSet" && ["FireDataSet", "TraverseGun", "LoadGun"].includes(state.phase)) return true;
  return false;
}

function guidebookSpread() {
  const pages = {
    process: {
      leftNo: "01",
      rightNo: "02",
      leftTitle: "Command Sequence",
      rightTitle: "Setup Discipline",
      left: `<ol>
        <li>Review current dispatch and copy critical lines into Quick Note.</li>
        <li>Start mission setup. The mission clock is not running.</li>
        <li>Place Gun, S1, S2 and S3 from grid references.</li>
        <li>When setup expires, execute plotting and fire control.</li>
      </ol>`,
      right: `<dl>
        <div><dt>Briefing</dt><dd>Menus only. No map work.</dd></div>
        <div><dt>Setup</dt><dd>Gun and observer pins only.</dd></div>
        <div><dt>Mission</dt><dd>Lines, calculator, traverse and fire.</dd></div>
      </dl>`,
    },
    map: {
      leftNo: "03",
      rightNo: "04",
      leftTitle: "Grid Reading",
      rightTitle: "Subgrid Orientation",
      left: `<dl>
        <div><dt>Main</dt><dd>B9 identifies column B, row 9.</dd></div>
        <div><dt>Full</dt><dd>B9-03-08 is main grid plus subgrid.</dd></div>
        <div><dt>Zoom</dt><dd>Subgrid numbers become legible at high zoom.</dd></div>
      </dl>`,
      right: `<dl>
        <div><dt>03</dt><dd>Sub-column, counted left to right.</dd></div>
        <div><dt>08</dt><dd>Sub-row, counted top to bottom.</dd></div>
        <div><dt>Pins</dt><dd>Use pin tablet to mark reported positions.</dd></div>
      </dl>`,
    },
    plotting: {
      leftNo: "05",
      rightNo: "06",
      leftTitle: "Plotting Tools",
      rightTitle: "Fire Solution",
      left: `<dl>
        <div><dt>White</dt><dd>Construction and helper lines.</dd></div>
        <div><dt>Yellow</dt><dd>Observer bearing lines for triangulation.</dd></div>
        <div><dt>Red</dt><dd>Range and final bearing for calculator input.</dd></div>
      </dl>`,
      right: `<ol>
        <li>Enter bearing and range in kilometers.</li>
        <li>Select ordnance and powder charge.</li>
        <li>Calculate elevation, set data, traverse, load.</li>
        <li>Confirm ready checks before firing.</li>
      </ol>`,
    },
    ammo: {
      leftNo: "07",
      rightNo: "08",
      leftTitle: "Ordnance",
      rightTitle: "Special Rounds",
      left: `<dl>
        <div><dt>HE</dt><dd>Area effect against open targets and exposed batteries.</dd></div>
        <div><dt>AP</dt><dd>Precision penetrator for armor, bunkers and hardened structures.</dd></div>
        <div><dt>Smoke</dt><dd>Mark impact areas or block sight lines.</dd></div>
      </dl>`,
      right: `<dl>
        <div><dt>Star</dt><dd>Reveals suspected target areas.</dd></div>
        <div><dt>Effect</dt><dd>Star does not complete a mission.</dd></div>
        <div><dt>Use</dt><dd>Fire when target position is uncertain.</dd></div>
      </dl>`,
    },
  };
  const page = pages[state.guidePage] || pages.process;
  return `
    <section class="manual-page left-page">
      <div class="page-mark">${page.leftNo}</div>
      <h3>${page.leftTitle}</h3>
      ${page.left}
    </section>
    <section class="manual-page right-page">
      <div class="page-mark">${page.rightNo}</div>
      <h3>${page.rightTitle}</h3>
      ${page.right}
    </section>
  `;
}

function orderSheet(order, archived = false) {
  const result = order.result;
  const ordnance = `${order.requiredAmmo}${order.requiredAmmo === "HE" ? " / STAR optional" : ""}`;
  const target = `${order.profile.label} / ${order.effect}`;
  const gun = `${gridReference(order.gunPosition)} / ${formatCoords(order.gunPosition)}`;
  return `
    <section class="order-card dispatch-sheet ${archived ? "archived-dispatch" : ""}">
      ${result ? `<div class="mission-stamp ${result.success ? "stamp-success" : "stamp-failed"}">${result.success ? "Success" : "Failed"}</div>` : ""}
      <div class="dispatch-header">
        <span>High Command to Ballista</span>
        <strong>${order.id}</strong>
      </div>
      <p class="dispatch-copy">${escapeHtml(order.orderText)}</p>
      <button class="dispatch-line note-line" type="button" data-note="${escapeHtml(`Ordnance - ${ordnance}`)}"><span>Ordnance</span><strong>${ordnance}</strong></button>
      <button class="dispatch-line note-line" type="button" data-note="${escapeHtml(`Target - ${target}`)}"><span>Target</span><strong>${target}</strong></button>
      <button class="dispatch-line note-line" type="button" data-note="${escapeHtml(`Gun - ${gun}`)}"><span>Gun</span><strong>${gun}</strong></button>
      ${result ? `<div class="dispatch-line result-line"><span>Result</span><strong>${result.success ? "Complete" : "Failed"} / ${result.accuracyLabel} / Score ${result.score}</strong></div>` : ""}
      <div class="asset-list">
        <span>Observation Assets</span>
        ${order.spotters.map((spotter) => `
          <button type="button" class="asset-row note-line" data-note="${escapeHtml(`${spotter.id} - ${gridReference(spotter.position)} - ${spotter.bearing.toFixed(1)} deg`)}">
            <strong>${spotter.id}</strong>
            <em>${gridReference(spotter.position)}</em>
            <b>${spotter.bearing.toFixed(1)} deg</b>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function appendQuickNote(note) {
  if (!note) return;
  const lines = state.quickNote
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.includes(note)) lines.push(note);
  state.quickNote = lines.join("\n").slice(0, 240);
  const quickNote = document.querySelector("#quickNote");
  if (quickNote) quickNote.value = state.quickNote;
  const counter = document.querySelector(".quick-note-head span");
  if (counter) counter.textContent = `${state.quickNote.length}/240`;
}

function quickNoteStyle() {
  const layout = clampQuickNoteLayout(state.quickNoteLayout);
  state.quickNoteLayout = layout;
  const x = layout.x ?? Math.max(12, window.innerWidth - layout.width - 12);
  const y = layout.y ?? Math.max(82, window.innerHeight - layout.height - 82);
  return `left: ${x}px; top: ${y}px; width: ${layout.width}px; height: ${layout.height}px;`;
}

function loadQuickNoteLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(quickNoteStorageKey));
    if (!stored) return { ...quickNoteDefaultLayout };
    return {
      x: Number.isFinite(stored.x) ? stored.x : null,
      y: Number.isFinite(stored.y) ? stored.y : null,
      width: Number.isFinite(stored.width) ? stored.width : quickNoteDefaultLayout.width,
      height: Number.isFinite(stored.height) ? stored.height : quickNoteDefaultLayout.height,
    };
  } catch {
    return { ...quickNoteDefaultLayout };
  }
}

function saveQuickNoteLayout() {
  localStorage.setItem(quickNoteStorageKey, JSON.stringify(state.quickNoteLayout));
}

function clampQuickNoteLayout(layout) {
  const minWidth = 220;
  const minHeight = 118;
  const maxWidth = Math.max(minWidth, window.innerWidth - 24);
  const maxHeight = Math.max(minHeight, window.innerHeight - 24);
  const width = clamp(layout.width, minWidth, maxWidth);
  const height = clamp(layout.height, minHeight, maxHeight);
  const fallbackX = Math.max(12, window.innerWidth - width - 12);
  const fallbackY = Math.max(82, window.innerHeight - height - 82);
  return {
    x: clamp(layout.x ?? fallbackX, 8, Math.max(8, window.innerWidth - width - 8)),
    y: clamp(layout.y ?? fallbackY, 8, Math.max(8, window.innerHeight - height - 8)),
    width,
    height,
  };
}

function applyQuickNoteLayout() {
  const element = document.querySelector(".quick-note");
  if (!element) return;
  state.quickNoteLayout = clampQuickNoteLayout(state.quickNoteLayout);
  element.style.left = `${state.quickNoteLayout.x}px`;
  element.style.top = `${state.quickNoteLayout.y}px`;
  element.style.width = `${state.quickNoteLayout.width}px`;
  element.style.height = `${state.quickNoteLayout.height}px`;
}

function startQuickNoteDrag(event) {
  if (event.target.closest("button")) return;
  const start = {
    x: event.clientX,
    y: event.clientY,
    layout: { ...clampQuickNoteLayout(state.quickNoteLayout) },
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    state.quickNoteLayout.x = start.layout.x + moveEvent.clientX - start.x;
    state.quickNoteLayout.y = start.layout.y + moveEvent.clientY - start.y;
    applyQuickNoteLayout();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    saveQuickNoteLayout();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function startQuickNoteResize(event) {
  const start = {
    x: event.clientX,
    y: event.clientY,
    layout: { ...clampQuickNoteLayout(state.quickNoteLayout) },
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    state.quickNoteLayout.width = start.layout.width + moveEvent.clientX - start.x;
    state.quickNoteLayout.height = start.layout.height + moveEvent.clientY - start.y;
    applyQuickNoteLayout();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    saveQuickNoteLayout();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function resetQuickNoteLayout() {
  state.quickNoteLayout = { ...quickNoteDefaultLayout };
  saveQuickNoteLayout();
  render();
}

function checkRow(key, label) {
  return `
    <label class="check-row">
      <input data-check="${key}" type="checkbox" ${state.checklist[key] ? "checked" : ""} ${state.phase === "ReadyToFire" ? "" : "disabled"}>
      <span>${label}</span>
    </label>
  `;
}

function mapHint() {
  if (state.activePin) return `Pin ${state.activePin}: click map to place.`;
  if (state.phase === "Briefing") return "Briefing: use top menu, then Start Mission.";
  if (state.phase === "Setup") return "Setup: place Gun, S1, S2, S3. Lines locked.";
  if (state.tool === "pan") return "Pan: drag map. Wheel zooms.";
  if (state.tool === "delete") return "Delete: click a line to remove it.";
  if (state.tool === "yellow") return "Yellow: two-click bearing line.";
  if (state.tool === "red") return "Red: two-click range line.";
  return "White: two-click guide line.";
}

function showCalculatorPanel() {
  return ["Plotting", "Calculator", "FireDataSet", "Correction"].includes(state.phase);
}

function showChecklistPanel() {
  return state.phase === "ReadyToFire";
}

function showMachinePanel() {
  return ["FireDataSet", "TraverseGun", "LoadGun"].includes(state.phase) || Boolean(state.busy);
}

function machineStatusLabel() {
  if (state.phase === "FireDataSet") return "Data set";
  if (state.phase === "LoadGun") return "Aligned";
  if (state.phase === "TraverseGun") return "Traversing";
  return "Ready";
}

function createMission() {
  missionNumber += 1;
  const profile = pick(targetProfiles);
  const targetPosition = {
    x: randomBetween(2800, 6500),
    y: randomBetween(700, 3600),
    z: 42,
  };
  targetPosition.z = groundHeight(targetPosition.x, targetPosition.y);
  const generatedGun = {
    x: randomBetween(-100, 900),
    y: randomBetween(-350, 450),
    z: 18,
  };
  generatedGun.z = groundHeight(generatedGun.x, generatedGun.y);
  const generatedSpotters = createSpotters(targetPosition);
  const id = `M-${String(missionNumber).padStart(3, "0")}`;
  const sector = sectorFromWorld(targetPosition);
  const timeLimitSeconds = Math.round(randomBetween(210, 330));
  const callsign = pick(["OP Adler", "OP Kiefer", "OP Nord", "OP Falke", "OP Stein"]);
  const orderText = [
    `${timeStamp()} / ${callsign}`,
    profile.radio,
    `Sector ${sector}.`,
    "Target not visible.",
    `Priority: ${profile.priority}.`,
    `Effect: ${profile.effect}.`,
    `Window: ${timeLimitSeconds} seconds.`,
  ].join("\n");

  return {
    id,
    title: profile.label,
    callsign,
    priority: profile.priority,
    targetHint: `${profile.radio} ${sector}`,
    effect: profile.effect,
    profile,
    targetPosition,
    targetRadius: profile.targetRadius,
    armor: profile.armor,
    requiredAmmo: profile.requiredAmmo,
    timeLimitSeconds,
    orderText,
    gunPosition: generatedGun,
    spotters: generatedSpotters,
  };
}

function createSpotters(targetPosition) {
  const presets = [
    { x: -2600, y: 1850 },
    { x: -950, y: -1550 },
    { x: 1700, y: 1600 },
  ];
  return presets.map((offset, index) => {
    const position = {
      x: clamp(targetPosition.x + offset.x + randomBetween(-450, 450), -200, 7200),
      y: clamp(targetPosition.y + offset.y + randomBetween(-350, 350), -500, 4300),
      z: 45,
    };
    position.z = groundHeight(position.x, position.y);
    return {
      id: `S${index + 1}`,
      label: `Spotter ${index + 1}`,
      position,
      bearing: bearingBetween(position, targetPosition),
    };
  });
}

function startNextMission() {
  clearInterval(busyTimer);
  clearInterval(projectileTimer);
  mission = createMission();
  gunPosition = mission.gunPosition;
  spotters = mission.spotters;
  Object.assign(state, freshMissionState());
  state.orderLog.unshift(mission);
  state.log.unshift({
    type: "warn",
    text: `${mission.id} received. Review orders, then start mission setup.`,
  });
  render();
}

function freshMissionState() {
  return {
    phase: "Briefing",
    tool: "yellow",
    activePin: null,
    mapZoom: 1,
    mapOffset: { x: 0, y: 0 },
    pins: createEmptyPins(),
    lineStart: null,
    helperLines: [],
    bearingLines: [],
    distanceLine: null,
    calcBearingInput: "",
    calcDistanceInput: "",
    calcElevation: "",
    recommendedCharge: 3,
    selectedCharge: 3,
    selectedAmmo: "HE",
    firingBearing: "",
    firingElevation: "",
    currentBearing: randomBetween(20, 120),
    currentElevation: 4,
    fuseMode: "impact",
    fuseTime: 8,
    checklist: { breech: false, quadrant: false, recoil: false, command: false },
    barrelHeat: 0.08,
    setupRemaining: setupDurationSeconds,
    timeRemaining: mission.timeLimitSeconds,
    missionStarted: false,
    helpOpen: false,
    orderOpen: false,
    logOpen: false,
    resultOpen: false,
    result: null,
    showPreviousOrders: false,
    revealedTarget: false,
    busy: null,
    trajectory: [],
    projectileIndex: -1,
    lastImpact: null,
    effects: [],
    ammoCounts: Object.fromEntries(
      Object.entries(ammoTypes).map(([key, value]) => [key, value.count]),
    ),
  };
}

function startMission(force = false) {
  if (state.phase === "Briefing") {
    state.phase = "Setup";
    state.setupRemaining = setupDurationSeconds;
    state.activePin = null;
    log(`${mission.id}: setup timer started. Place gun and spotter pins.`, "warn");
    render();
    return;
  }
  if (state.missionStarted || state.phase !== "Setup") return;
  if (!force && !requiredSetupPinsPlaced()) {
    log("Setup incomplete. Place Gun, S1, S2 and S3.", "bad");
    render();
    return;
  }
  state.phase = "Plotting";
  state.missionStarted = true;
  state.activePin = null;
  log(`${mission.id}: mission clock started.`, "warn");
  render();
}

function ensureMissionStarted() {
  if (state.missionStarted) return;
  startMission();
  updateStatusStrip();
}

function handleMapClick(event) {
  if (mapDrag?.moved) return;
  if (state.activePin) {
    const point = eventToWorld(event);
    state.pins[state.activePin] = { ...point, z: groundHeight(point.x, point.y) };
    log(`${state.activePin} pin set: ${gridReference(point)}.`, "good");
    render();
    return;
  }
  if (state.tool === "pan") return;
  if (!canEditMap()) return;
  if (state.tool === "delete") {
    deleteLineAtEvent(event);
    return;
  }
  const point = eventToWorld(event);
  if (!state.lineStart) {
    state.lineStart = point;
    drawMap();
    return;
  }
  const line = { from: state.lineStart, to: point };
  if (state.tool === "white") {
    state.helperLines.push(line);
    log(`White line: ${lineBearing(line).toFixed(1)} deg, ${formatDistance(lineDistance(line))}.`, "warn");
  } else if (state.tool === "yellow") {
    state.bearingLines.push({
      ...line,
      drawnBearing: lineBearing(line),
    });
    log(`Yellow line: ${lineBearing(line).toFixed(1)} deg, ${formatDistance(lineDistance(line))}.`, "warn");
  } else if (state.tool === "red") {
    state.distanceLine = line;
    const bearing = lineBearing(line).toFixed(1);
    const distance = formatDistance(lineDistance(line));
    state.calcBearingInput = bearing;
    state.calcDistanceInput = kmValue(lineDistance(line));
    invalidateCalculation();
    log(`Red line: ${bearing} deg, ${distance}. Values copied.`, "good");
  }
  state.lineStart = null;
  invalidateFiringData();
  render();
}

function handleMapMove(event) {
  if (mapDrag?.active) {
    const dx = event.clientX - mapDrag.lastX;
    const dy = event.clientY - mapDrag.lastY;
    if (Math.abs(event.clientX - mapDrag.startX) > 2 || Math.abs(event.clientY - mapDrag.startY) > 2) {
      mapDrag.moved = true;
    }
    state.mapOffset.x += dx * (canvas.width / canvas.getBoundingClientRect().width);
    state.mapOffset.y += dy * (canvas.height / canvas.getBoundingClientRect().height);
    mapDrag.lastX = event.clientX;
    mapDrag.lastY = event.clientY;
    drawMap();
    return;
  }
  if (!state.lineStart || !canEditMap() || state.tool === "delete") return;
  drawMap();
  const point = eventToWorld(event);
  const preview = { from: state.lineStart, to: point };
  drawWorldLine(preview, toolColor(state.tool), true, 2);
  drawCursorReadout(point, preview);
}

function handleMapPointerDown(event) {
  if (event.button !== 0) return;
  if (!canUseMapControls()) return;
  if (state.tool !== "pan") return;
  mapDrag = {
    active: true,
    moved: false,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  canvas.setPointerCapture(event.pointerId);
}

function handleMapPointerUp(event) {
  if (!mapDrag) return;
  mapDrag.active = false;
  canvas.releasePointerCapture?.(event.pointerId);
  setTimeout(() => {
    mapDrag = null;
  }, 0);
}

function handleMapPointerLeave() {
  if (mapDrag) mapDrag.active = false;
}

function undoLine() {
  if (state.tool === "yellow" && state.bearingLines.length) state.bearingLines.pop();
  else if (state.tool === "red" && state.distanceLine) state.distanceLine = null;
  else if (state.helperLines.length) state.helperLines.pop();
  state.lineStart = null;
  invalidateFiringData();
  render();
}

function deleteLineAtEvent(event) {
  const point = eventToMapPoint(event);
  const hit = findLineHit(point, 12);
  if (!hit) {
    log("No line selected for deletion.", "warn");
    render();
    return;
  }

  if (hit.type === "white") {
    state.helperLines.splice(hit.index, 1);
  } else if (hit.type === "yellow") {
    state.bearingLines.splice(hit.index, 1);
  } else if (hit.type === "red") {
    state.distanceLine = null;
    state.calcBearingInput = "";
    state.calcDistanceInput = "";
    invalidateCalculation();
  }

  state.lineStart = null;
  invalidateFiringData();
  log(`${hit.label} line deleted.`, "good");
  render();
}

function findLineHit(point, threshold) {
  const candidates = [];
  state.helperLines.forEach((line, index) => {
    candidates.push({ type: "white", label: "White", index, line });
  });
  state.bearingLines.forEach((line, index) => {
    candidates.push({ type: "yellow", label: "Yellow", index, line });
  });
  if (state.distanceLine) {
    candidates.push({ type: "red", label: "Red", index: 0, line: state.distanceLine });
  }

  let best = null;
  candidates.forEach((candidate) => {
    const distance = distanceToScreenLine(point, candidate.line);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { ...candidate, distance };
    }
  });
  return best;
}

function clearLines() {
  state.helperLines = [];
  state.bearingLines = [];
  state.distanceLine = null;
  state.lineStart = null;
  invalidateFiringData();
  log("Map cleared.", "warn");
  render();
}

function calculateSolution() {
  const bearing = Number(state.calcBearingInput);
  const distanceKm = Number(state.calcDistanceInput);
  const distance = distanceKm * 1000;
  if (!Number.isFinite(bearing) || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    log("Enter bearing and range in km.", "bad");
    render();
    return;
  }
  const best = findBestChargeAndElevation(bearing, distance, state.selectedAmmo);
  state.calcElevation = `${best.elevation.toFixed(1)} deg`;
  state.recommendedCharge = best.charge;
  state.selectedCharge = best.charge;
  state.phase = "Calculator";
  log(`Calculator: elevation ${best.elevation.toFixed(1)} deg, charge ${best.charge}. Error ${formatDistance(best.miss)}.`, best.miss < 90 ? "good" : "warn");
  render();
}

function applySolution() {
  state.firingBearing = Number(state.calcBearingInput).toFixed(1);
  state.firingElevation = parseFloat(state.calcElevation).toFixed(1);
  state.phase = "FireDataSet";
  state.trajectory = [];
  state.projectileIndex = -1;
  state.lastImpact = null;
  resetChecklist();
  log(`Fire data set: ${state.firingBearing} deg, elevation ${state.firingElevation} deg, charge ${state.selectedCharge}.`, "good");
  render();
}

function startAlignment() {
  const bearing = Number(state.firingBearing);
  const elevation = Number(state.firingElevation);
  const startBearing = state.currentBearing;
  const startElevation = state.currentElevation;
  const bearingDelta = shortestAngle(startBearing, bearing);
  const elevationDelta = elevation - startElevation;
  const deltaBearing = Math.abs(shortestAngle(state.currentBearing, bearing));
  const deltaElevation = Math.abs(state.currentElevation - elevation);
  const ammo = ammoTypes[state.selectedAmmo];
  const duration = Math.max(deltaBearing / 1.8, deltaElevation / 0.55) + 4 + (ammo.massKg > 100 ? 3 : 1.5);
  startBusy("Traversing", duration, (progress) => {
    const eased = easeInOut(progress);
    state.currentBearing = normalizeDeg(startBearing + bearingDelta * eased);
    state.currentElevation = startElevation + elevationDelta * eased;
  }, () => {
    state.currentBearing = bearing;
    state.currentElevation = elevation;
    state.phase = "LoadGun";
    log(`Aligned: ${bearing.toFixed(1)} deg, elevation ${elevation.toFixed(1)} deg.`, "good");
  });
}

function startLoading() {
  const ammo = ammoTypes[state.selectedAmmo];
  const duration = 6 + ammo.massKg / 28 + state.selectedCharge * 0.8;
  startBusy(`Loading ${ammo.label}`, duration, null, () => {
    state.phase = "ReadyToFire";
    resetChecklist();
    log(`${ammo.label} loaded. Complete ready checks.`, "warn");
  });
}

function fire() {
  if (state.ammoCounts[state.selectedAmmo] <= 0) {
    log("Ammo depleted.", "bad");
    render();
    return;
  }
  state.ammoCounts[state.selectedAmmo] -= 1;
  state.phase = "ProjectileFlight";
  const shot = simulateShot({
    bearingDeg: state.currentBearing,
    elevationDeg: state.currentElevation,
    ammoKey: state.selectedAmmo,
    chargeLevel: state.selectedCharge,
    fuseMode: state.fuseMode,
    fuseTime: Number(state.fuseTime),
    includeScatter: true,
  });
  state.trajectory = shot.trajectory;
  state.projectileIndex = 0;
  state.lastImpact = null;
  log(`FIRE. ${ammoTypes[state.selectedAmmo].label} in flight. ${shot.flightTime.toFixed(1)} s.`, "warn");
  animateProjectile(shot);
}

function animateProjectile(shot) {
  clearInterval(projectileTimer);
  const steps = Math.max(1, shot.trajectory.length - 1);
  const frameMs = Math.max(28, Math.min(90, (Math.min(shot.flightTime, 12) * 1000) / steps));
  projectileTimer = setInterval(() => {
    state.projectileIndex += 1;
    if (state.projectileIndex >= shot.trajectory.length) {
      clearInterval(projectileTimer);
      state.projectileIndex = -1;
      resolveImpact(shot);
      return;
    }
    drawMap();
  }, frameMs);
}

function resolveImpact(shot) {
  const ammo = ammoTypes[shot.ammoKey];
  const missDistance = distance2D(shot.impact, mission.targetPosition);
  if (shot.ammoKey === "ILLUMINATION") {
    resolveIllumination(shot, missDistance);
    return;
  }
  const effectiveRadius = (ammo.blastRadius || ammo.smokeRadius || ammo.lightRadius || 0) + mission.targetRadius;
  const armorModifier = ammo.penetration >= mission.armor ? 1 : 0.45;
  const ammoMatch = shot.ammoKey === mission.requiredAmmo;
  const ammoModifier = ammoMatch ? 1.25 : 0.55;
  const baseEffect = Math.max(0, 1 - missDistance / Math.max(effectiveRadius, 1));
  const effect = baseEffect * armorModifier * ammoModifier;
  state.lastImpact = shot.impact;
  state.effects.push({
    type: shot.ammoKey,
    point: shot.impact,
    radius: ammo.blastRadius || ammo.smokeRadius || ammo.lightRadius || 18,
    color: ammo.color,
    label: ["HE", "AP"].includes(shot.ammoKey) ? `${ammo.label} ROI` : ammo.label,
  });
  state.barrelHeat = Math.min(1, state.barrelHeat + chargeLevels[state.selectedCharge].stress);

  if (shot.ammoKey === "SMOKE" && mission.requiredAmmo !== "SMOKE") {
    state.phase = "Correction";
    log(`Smoke deployed. Offset ${formatDistance(missDistance)}.`, missDistance < 130 ? "good" : "warn");
  } else if (effect > 0.25) {
    state.phase = "MissionComplete";
    state.result = buildResult(shot, missDistance, true, ammoMatch);
    mission.result = state.result;
    state.resultOpen = true;
    log(`Effect confirmed. Impact offset ${formatDistance(missDistance)}.`, "good");
  } else {
    state.phase = "Correction";
    log(correctionText(shot.impact, missDistance, ammo), "bad");
  }
  render();
}

function resolveIllumination(shot, missDistance) {
  const ammo = ammoTypes[shot.ammoKey];
  state.lastImpact = shot.impact;
  state.effects.push({
    type: shot.ammoKey,
    point: shot.impact,
    radius: ammo.lightRadius,
    color: ammo.color,
    label: `${ammo.label} ROI`,
  });
  state.barrelHeat = Math.min(1, state.barrelHeat + chargeLevels[state.selectedCharge].stress);

  const revealRadius = ammo.lightRadius + mission.targetRadius;
  if (missDistance <= revealRadius) {
    state.revealedTarget = true;
    state.phase = "Correction";
    log(`Star effective. ${mission.profile.label} revealed. Offset ${formatDistance(missDistance)}.`, "good");
  } else {
    state.phase = "Correction";
    log(`Star offset ${formatDistance(missDistance)}. No reveal.`, "warn");
  }
  render();
}

function buildResult(shot, missDistance, success, ammoMatch) {
  const elapsedSeconds = state.missionStarted
    ? mission.timeLimitSeconds - state.timeRemaining
    : 0;
  const accuracyScore = Math.max(0, Math.round(100 - missDistance / 2));
  const ammoScore = ammoMatch ? 20 : -20;
  const timeScore = Math.max(0, Math.round((state.timeRemaining / mission.timeLimitSeconds) * 20));
  const score = clamp(Math.round(accuracyScore + ammoScore + timeScore), 0, 100);
  return {
    success,
    missDistance,
    elapsedSeconds,
    score,
    ammoLabel: `${ammoTypes[shot.ammoKey].label}${ammoMatch ? " / passend" : " / suboptimal"}`,
    accuracyLabel: accuracyScore >= 90 ? "Excellent" : accuracyScore >= 70 ? "Good" : accuracyScore >= 45 ? "Adequate" : "Poor",
    summary: [
      `${mission.profile.label}: ${success ? "effect achieved" : "effect insufficient"}.`,
      `Required ammo: ${ammoTypes[mission.requiredAmmo].label}.`,
      `Used: ${ammoTypes[shot.ammoKey].label}.`,
      `Miss: ${formatDistance(missDistance)}.`,
    ].join("\n"),
  };
}

function findBestChargeAndElevation(bearing, distance, ammoKey) {
  let best = { charge: 3, elevation: 8, miss: Number.POSITIVE_INFINITY };
  const target = pointFromBearingDistance(gunPosition, bearing, distance);
  for (let charge = 1; charge <= 5; charge += 1) {
    for (let elevation = 1; elevation <= 42; elevation += 0.25) {
      const shot = simulateShot({
        bearingDeg: bearing,
        elevationDeg: elevation,
        ammoKey,
        chargeLevel: charge,
        fuseMode: "impact",
        fuseTime: 0,
        includeScatter: false,
      });
      const miss = distance2D(shot.impact, target);
      if (miss < best.miss) best = { charge, elevation, miss };
    }
  }
  return best;
}

function simulateShot({ bearingDeg, elevationDeg, ammoKey, chargeLevel, fuseMode, fuseTime, includeScatter }) {
  const ammo = ammoTypes[ammoKey];
  const charge = chargeLevels[chargeLevel];
  const bearing = degToRad(bearingDeg);
  const elevation = degToRad(elevationDeg);
  const muzzleVelocity = ammo.muzzleVelocity * charge.velocity;
  const direction = {
    x: Math.sin(bearing) * Math.cos(elevation),
    y: Math.cos(bearing) * Math.cos(elevation),
    z: Math.sin(elevation),
  };
  let position = { ...gunPosition };
  let velocity = {
    x: direction.x * muzzleVelocity,
    y: direction.y * muzzleVelocity,
    z: direction.z * muzzleVelocity,
  };
  const trajectory = [];
  const dt = 0.08;
  let time = 0;
  let airburst = null;
  for (let i = 0; i < 2000; i += 1) {
    trajectory.push({ ...position });
    const ground = groundHeight(position.x, position.y);
    if (fuseMode === "timed" && time >= fuseTime) {
      airburst = { ...position };
      break;
    }
    if (position.z <= ground && time > 0.2) break;
    const relativeVelocity = {
      x: velocity.x - environment.wind.x,
      y: velocity.y - environment.wind.y,
      z: velocity.z,
    };
    const speed = Math.hypot(relativeVelocity.x, relativeVelocity.y, relativeVelocity.z);
    const dragScale = ammo.dragCoefficient * speed;
    velocity.x += -relativeVelocity.x * dragScale * dt;
    velocity.y += -relativeVelocity.y * dragScale * dt;
    velocity.z += (-environment.gravity - relativeVelocity.z * dragScale) * dt;
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;
    position.z += velocity.z * dt;
    time += dt;
    if (Math.hypot(position.x, position.y) > 9000 || position.z < -100) break;
  }
  let impact = airburst || { ...position };
  if (includeScatter) {
    const scatter = ammo.scatterMeters * (0.65 + state.barrelHeat);
    impact = {
      ...impact,
      x: impact.x + randomBetween(-scatter, scatter),
      y: impact.y + randomBetween(-scatter, scatter),
    };
  }
  return { ammoKey, trajectory, impact, flightTime: time, airburst };
}

function drawMap() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#141a18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPins();
  state.helperLines.forEach((line) => drawWorldLine(line, "#f0f2e8", false, 1.5));
  state.bearingLines.forEach((line) => {
    drawWorldLine(line, "#e3c64d", false, 2.3);
    drawLineLabel(line, `${line.drawnBearing.toFixed(1)} deg`, "#e3c64d");
  });
  if (state.distanceLine) {
    drawWorldLine(state.distanceLine, "#d95a4f", false, 2.8);
    drawLineLabel(state.distanceLine, `${formatDistance(lineDistance(state.distanceLine))} / ${lineBearing(state.distanceLine).toFixed(1)} deg`, "#d95a4f");
  }
  drawEffects();
  drawRevealedTarget();
  drawTrajectory(state.trajectory, "#d0aa5d");
  drawProjectile();
  drawImpact();
  drawLineStart();
}

function drawGrid() {
  const { majorWidth, majorHeight, columns, rows } = mapConfig;
  drawRepeatingGridLines(majorWidth / 10, majorHeight / 10, "rgba(86, 101, 92, 0.16)");
  drawRepeatingGridLines(majorWidth, majorHeight, "#26322d");

  ctx.fillStyle = "#59665e";
  ctx.font = "600 15px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  "ABCDEFGHIJKL".split("").forEach((letter, index) => {
    const x = mapBaseToScreenX(index * majorWidth + majorWidth / 2);
    const y = mapBaseToScreenY(18);
    if (x > -20 && x < canvas.width + 20 && y > -20 && y < canvas.height + 20) {
      ctx.fillText(letter, x, y);
    }
  });
  Array.from({ length: rows }, (_, index) => String(index + 1)).forEach((number, index) => {
    const x = mapBaseToScreenX(12);
    const y = mapBaseToScreenY(index * majorHeight + majorHeight / 2);
    if (x > -20 && x < canvas.width + 20 && y > -20 && y < canvas.height + 20) {
      ctx.fillText(number, x, y);
    }
  });
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  if (state.mapZoom >= 2.05) drawSubgridLabels();
}

function drawRepeatingGridLines(baseStepX, baseStepY, color) {
  const stepX = baseStepX * state.mapZoom;
  const stepY = baseStepY * state.mapZoom;
  if (stepX < 2 || stepY < 2) return;
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;

  for (let x = positiveModulo(state.mapOffset.x, stepX); x <= canvas.width; x += stepX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = positiveModulo(state.mapOffset.y, stepY); y <= canvas.height; y += stepY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function positiveModulo(value, step) {
  return ((value % step) + step) % step;
}

function drawSubgridLabels() {
  const { majorWidth, majorHeight, columns, rows } = mapConfig;
  ctx.fillStyle = "rgba(137, 151, 140, 0.44)";
  ctx.font = "9px sans-serif";
  ctx.textBaseline = "middle";
  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const left = col * majorWidth;
      const top = row * majorHeight;
      const cellLeft = mapBaseToScreenX(left);
      const cellTop = mapBaseToScreenY(top);
      const cellRight = mapBaseToScreenX(left + majorWidth);
      const cellBottom = mapBaseToScreenY(top + majorHeight);
      if (cellRight < 0 || cellLeft > canvas.width || cellBottom < 0 || cellTop > canvas.height) continue;

      ctx.textAlign = "center";
      for (let subCol = 1; subCol <= 10; subCol += 1) {
        const x = mapBaseToScreenX(left + (subCol - 0.5) * (majorWidth / 10));
        const y = mapBaseToScreenY(top + majorHeight / 20);
        if (x > -8 && x < canvas.width + 8 && y > -8 && y < canvas.height + 8) {
          ctx.fillText(String(subCol), x, y);
        }
      }
      ctx.textAlign = "left";
      for (let subRow = 1; subRow <= 10; subRow += 1) {
        const x = mapBaseToScreenX(left + 4);
        const y = mapBaseToScreenY(top + (subRow - 0.5) * (majorHeight / 10));
        if (x > -8 && x < canvas.width + 8 && y > -8 && y < canvas.height + 8) {
          ctx.fillText(String(subRow), x, y);
        }
      }
    }
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawPins() {
  Object.entries(state.pins).forEach(([id, point]) => {
    if (!point) return;
    if (id === "gun") drawGunPin(point);
    else drawMapPin(id, point, id.startsWith("S") ? "#e3c64d" : "#d95a4f");
  });
}

function drawGunPin(point) {
  const p = worldToMap(point);
  ctx.fillStyle = "#d8d4bf";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d8d4bf";
  ctx.lineWidth = 3;
  const bearing = degToRad(state.currentBearing);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.sin(bearing) * 38, p.y - Math.cos(bearing) * 38);
  ctx.stroke();
  ctx.fillStyle = "#d8d4bf";
  ctx.font = "14px sans-serif";
  ctx.fillText("Gun", p.x + 12, p.y + 16);
}

function drawMapPin(id, point, color) {
  const p = worldToMap(point);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#111715";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#e8eadf";
  ctx.font = "14px sans-serif";
  ctx.fillText(id, p.x + 10, p.y - 10);
}

function drawTrajectory(trajectory, color) {
  if (!trajectory.length) return;
  const visible = state.projectileIndex >= 0 ? trajectory.slice(0, state.projectileIndex + 1) : trajectory;
  if (!visible.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  visible.forEach((point, index) => {
    const p = worldToMap(point);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawProjectile() {
  if (state.projectileIndex < 0 || !state.trajectory[state.projectileIndex]) return;
  const p = worldToMap(state.trajectory[state.projectileIndex]);
  ctx.fillStyle = "#fff0b5";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawImpact() {
  if (!state.lastImpact) return;
  const p = worldToMap(state.lastImpact);
  ctx.strokeStyle = "#f0d184";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEffects() {
  state.effects.forEach((effect) => {
    const p = worldToMap(effect.point);
    const offensive = effect.type === "HE" || effect.type === "AP";
    ctx.fillStyle = hexToRgba(effect.color, offensive ? 0.1 : 0.16);
    ctx.strokeStyle = offensive ? "#f4d06f" : hexToRgba(effect.color, 0.55);
    ctx.lineWidth = offensive ? 2.6 : 1.5;
    if (offensive) ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, worldScale(effect.radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (offensive) {
      drawMapLabel(p.x + worldScale(effect.radius) + 8, p.y - 4, effect.label, "#f4d06f");
    }
  });
}

function drawRevealedTarget() {
  if (!state.revealedTarget) return;
  const p = worldToMap(mission.targetPosition);
  const symbol = targetSymbol(mission.profile.key);
  ctx.save();
  ctx.strokeStyle = "#ff3f37";
  ctx.fillStyle = "rgba(255, 63, 55, 0.26)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#130b0a";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff5a52";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, p.x, p.y);
  const label = mission.profile.label.toUpperCase();
  ctx.font = "bold 12px sans-serif";
  const labelWidth = ctx.measureText(label).width + 14;
  ctx.fillStyle = "rgba(17, 8, 7, 0.88)";
  ctx.strokeStyle = "#ff3f37";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(p.x - labelWidth / 2, p.y + 31, labelWidth, 22, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff6b62";
  ctx.fillText(label, p.x, p.y + 42);
  ctx.restore();
}

function targetSymbol(key) {
  if (key === "infantry") return "INF";
  if (key === "armored") return "ARM";
  if (key === "bunker") return "BNK";
  if (key === "battery") return "BAT";
  if (key === "observation") return "OBS";
  return "TGT";
}

function drawLineStart() {
  if (!state.lineStart) return;
  const p = worldToMap(state.lineStart);
  ctx.strokeStyle = toolColor(state.tool);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWorldLine(line, color, dashed, width) {
  const from = worldToMap(line.from);
  const to = worldToMap(line.to);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawCursorReadout(point, line) {
  const p = worldToMap(point);
  let text = `${lineBearing(line).toFixed(1)} deg`;
  if (state.tool === "red") text = `${formatDistance(lineDistance(line))} / ${lineBearing(line).toFixed(1)} deg`;
  if (state.tool === "white") text = `${lineBearing(line).toFixed(1)} deg / ${formatDistance(lineDistance(line))}`;
  drawMapLabel(p.x + 14, p.y - 14, text, toolColor(state.tool));
}

function drawLineLabel(line, text, color) {
  const from = worldToMap(line.from);
  const to = worldToMap(line.to);
  drawMapLabel((from.x + to.x) / 2 + 8, (from.y + to.y) / 2 - 8, text, color);
}

function drawMapLabel(x, y, text, color) {
  ctx.save();
  ctx.font = "13px sans-serif";
  const width = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(13, 17, 15, 0.88)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y - 18, width, 24, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f5efd9";
  ctx.fillText(text, x + 7, y - 2);
  ctx.restore();
}

function startBusy(label, duration, onProgress, onComplete) {
  clearInterval(busyTimer);
  const startedAt = performance.now();
  state.busy = { label, duration, progress: 0 };
  state.phase = label.includes("richtet") ? "TraverseGun" : state.phase;
  render();
  busyTimer = setInterval(() => {
    const elapsed = (performance.now() - startedAt) / 1000;
    state.busy.progress = Math.min(1, elapsed / duration);
    if (onProgress) onProgress(state.busy.progress);
    if (state.busy.progress >= 1) {
      clearInterval(busyTimer);
      state.busy = null;
      onComplete();
      render();
      return;
    }
    render();
  }, 160);
}

function correctionText(impact, missDistance, ammo) {
  const trueRange = distance2D(gunPosition, mission.targetPosition);
  const impactRange = distance2D(gunPosition, impact);
  const rangeError = impactRange - trueRange;
  const targetBearing = bearingBetween(gunPosition, mission.targetPosition);
  const dx = impact.x - mission.targetPosition.x;
  const dy = impact.y - mission.targetPosition.y;
  const lateral = dx * Math.cos(degToRad(targetBearing + 90)) + dy * Math.sin(degToRad(targetBearing + 90));
  const rangeText = rangeError < 0 ? "short" : "long";
  const sideText = lateral < 0 ? "left" : "right";
  const ammoHint = ammo.penetration < mission.armor ? " AP recommended." : "";
  return `Miss: ${formatDistance(missDistance)} off, ${formatDistance(Math.abs(rangeError))} ${rangeText}, ${formatDistance(Math.abs(lateral))} ${sideText}.${ammoHint}`;
}

function invalidateCalculation() {
  state.calcElevation = "";
  invalidateFiringData();
}

function invalidateFiringData() {
  state.firingBearing = "";
  state.firingElevation = "";
  if (!["MissionComplete", "Setup"].includes(state.phase)) state.phase = "Plotting";
  resetChecklist();
}

function resetChecklist() {
  state.checklist = { breech: false, quadrant: false, recoil: false, command: false };
}

function canEditMap() {
  return state.missionStarted && !isLocked() && state.phase !== "MissionComplete";
}

function canUseMapControls() {
  return state.phase !== "Briefing";
}

function canUsePin(type) {
  if (state.phase === "Briefing") return false;
  if (state.phase === "Setup") return type === "cannon" || type === "spotter";
  return state.phase !== "MissionComplete";
}

function isLocked() {
  return Boolean(state.busy) || state.phase === "ProjectileFlight";
}

function canCalculate() {
  return state.missionStarted && !isLocked();
}

function canApplySolution() {
  return state.missionStarted && !isLocked() && state.calcElevation !== "";
}

function canAlign() {
  return state.missionStarted && !isLocked() && state.firingBearing !== "" && state.firingElevation !== "";
}

function canLoad() {
  return !isLocked() && state.phase === "LoadGun";
}

function canFire() {
  return !isLocked() && state.phase === "ReadyToFire" && Object.values(state.checklist).every(Boolean);
}

function requiredSetupPinsPlaced() {
  return ["gun", "S1", "S2", "S3"].every((key) => Boolean(state.pins[key]));
}

function canUseMissionButton() {
  if (state.phase === "Briefing") return true;
  if (state.phase === "Setup") return requiredSetupPinsPlaced();
  return false;
}

function checklistCount() {
  return Object.values(state.checklist).filter(Boolean).length;
}

function phaseLabel(phase) {
  const labels = {
    Briefing: "Briefing",
    Setup: "Setup",
    Plotting: "Plotting",
    Calculator: "Calculator",
    FireDataSet: "Fire Data",
    TraverseGun: "Traversing",
    LoadGun: "Load",
    ReadyToFire: "Ready Check",
    ProjectileFlight: "Flight",
    Correction: "Correction",
    MissionComplete: "Complete",
  };
  return labels[phase] || phase;
}

function missionButtonLabel() {
  if (state.phase === "Briefing") return "Start Mission";
  if (state.phase === "Setup") {
    return requiredSetupPinsPlaced()
      ? `Done Setup ${formatTime(state.setupRemaining)}`
      : `Setup ${formatTime(state.setupRemaining)}`;
  }
  return "Mission Running";
}

function eventToWorld(event) {
  return mapToWorld(eventToMapPoint(event));
}

function eventToMapPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function handleMapWheel(event) {
  event.preventDefault();
  if (!canUseMapControls()) return;
  const rect = canvas.getBoundingClientRect();
  const focus = {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
  zoomMap(event.deltaY < 0 ? 1.12 : 0.9, focus);
}

function zoomMap(factor, focus = { x: canvas.width / 2, y: canvas.height / 2 }) {
  if (!canUseMapControls()) return;
  const previousZoom = state.mapZoom;
  const nextZoom = clamp(previousZoom * factor, minMapZoom(), mapConfig.maxZoom);
  if (nextZoom === previousZoom) return;
  state.mapOffset.x = focus.x - ((focus.x - state.mapOffset.x) / previousZoom) * nextZoom;
  state.mapOffset.y = focus.y - ((focus.y - state.mapOffset.y) / previousZoom) * nextZoom;
  state.mapZoom = nextZoom;
  render();
}

function resetMapZoom() {
  state.mapZoom = minMapZoom();
  state.mapOffset = { x: 0, y: 0 };
  render();
}

function minMapZoom() {
  const gridWidth = mapConfig.columns * mapConfig.majorWidth;
  const gridHeight = mapConfig.rows * mapConfig.majorHeight;
  return Math.max(mapConfig.minZoom, canvas.width / gridWidth, canvas.height / gridHeight);
}

function pointFromBearingDistance(from, bearingDeg, distance) {
  const bearing = degToRad(bearingDeg);
  return {
    x: from.x + Math.sin(bearing) * distance,
    y: from.y + Math.cos(bearing) * distance,
    z: groundHeight(from.x, from.y),
  };
}

function lineBearing(line) {
  return bearingBetween(line.from, line.to);
}

function lineDistance(line) {
  return distance2D(line.from, line.to);
}

function distanceToScreenLine(point, line) {
  const from = worldToMap(line.from);
  const to = worldToMap(line.to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1);
  const closest = {
    x: from.x + dx * t,
    y: from.y + dy * t,
  };
  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function createEmptyPins() {
  return {
    gun: null,
    S1: null,
    S2: null,
    S3: null,
    T1: null,
    T2: null,
    T3: null,
  };
}

function placedPinCount() {
  return Object.values(state.pins).filter(Boolean).length;
}

function latestRadioText() {
  return state.log[0]?.text || "No traffic.";
}

function radioSignalLevel() {
  const type = state.log[0]?.type;
  if (type === "bad") return 42;
  if (type === "warn") return 64;
  return 82;
}

function formatCoords(point) {
  return `${kmValue(point.x)} E / ${kmValue(point.y)} N`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toolColor(tool) {
  if (tool === "yellow") return "#e3c64d";
  if (tool === "red") return "#d95a4f";
  return "#f0f2e8";
}

function worldToMap(point) {
  const scale = mapConfig.baseScale * state.mapZoom;
  return {
    x: mapConfig.originX * state.mapZoom + state.mapOffset.x + point.x * scale,
    y: (canvas.height - mapConfig.originBottom) * state.mapZoom + state.mapOffset.y - point.y * scale,
  };
}

function mapToWorld(point) {
  const scale = mapConfig.baseScale * state.mapZoom;
  return {
    x: (point.x - state.mapOffset.x - mapConfig.originX * state.mapZoom) / scale,
    y: ((canvas.height - mapConfig.originBottom) * state.mapZoom + state.mapOffset.y - point.y) / scale,
    z: 0,
  };
}

function worldScale(value) {
  return value * mapConfig.baseScale * state.mapZoom;
}

function mapBaseToScreenX(baseX) {
  return baseX * state.mapZoom + state.mapOffset.x;
}

function mapBaseToScreenY(baseY) {
  return baseY * state.mapZoom + state.mapOffset.y;
}

function groundHeight(x, y) {
  return 12 + Math.sin(x / 900) * 10 + Math.cos(y / 700) * 8;
}

function log(text, type = "warn") {
  state.log.unshift({ text, type });
  state.log = state.log.slice(0, 9);
}

function startMissionClock() {
  clearInterval(missionTimer);
  missionTimer = setInterval(() => {
    if (!state.missionStarted && state.phase === "Setup") {
      state.setupRemaining = Math.max(0, state.setupRemaining - 1);
      if (state.setupRemaining === 0) {
        if (!requiredSetupPinsPlaced()) {
          log("Setup expired. Required pins missing.", "bad");
        }
        startMission(true);
        return;
      }
      updateStatusStrip();
      return;
    }
    if (!state.missionStarted || state.phase === "MissionComplete") return;
    state.timeRemaining = Math.max(0, state.timeRemaining - 1);
    if (state.timeRemaining === 0) {
      log(`Window expired. ${mission.profile.label} no longer viable.`, "bad");
      state.phase = "MissionComplete";
      state.result = {
        success: false,
        missDistance: 9999,
        elapsedSeconds: mission.timeLimitSeconds,
        score: 0,
        ammoLabel: "--",
        accuracyLabel: "No effect",
        summary: `${mission.profile.label}: window expired. No confirmed effect.`,
      };
      mission.result = state.result;
      state.resultOpen = true;
      render();
      return;
    }
    updateStatusStrip();
  }, 1000);
}

function updateStatusStrip() {
  const phasePill = document.querySelector("#phasePill");
  const timePill = document.querySelector("#timePill");
  const heatPill = document.querySelector("#heatPill");
  if (phasePill) phasePill.textContent = `Phase: ${phaseLabel(state.phase)}`;
  if (timePill) timePill.textContent = `Time: ${state.missionStarted ? formatTime(state.timeRemaining) : "standby"}`;
  if (heatPill) heatPill.textContent = `Heat: ${Math.round(state.barrelHeat * 100)}%`;
  const startMissionBtn = document.querySelector("#startMissionBtn");
  if (startMissionBtn) {
    startMissionBtn.textContent = missionButtonLabel();
    startMissionBtn.disabled = !canUseMissionButton();
  }
}

function bearingBetween(from, to) {
  return normalizeDeg(radToDeg(Math.atan2(to.x - from.x, to.y - from.y)));
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shortestAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timeStamp() {
  const minutes = 7 * 60 + 10 + missionNumber * 7;
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function sectorFromWorld(point) {
  const letters = "ABCDEFGHIJKL";
  const col = clamp(Math.floor(worldToMapX(point.x) / mapConfig.majorWidth), 0, letters.length - 1);
  const row = clamp(Math.floor(worldToMapY(point.y) / mapConfig.majorHeight) + 1, 1, mapConfig.rows);
  return `${letters[col]}${row}`;
}

function gridReference(point) {
  const baseX = worldToMapX(point.x);
  const baseY = worldToMapY(point.y);
  const col = clamp(Math.floor(baseX / mapConfig.majorWidth), 0, mapConfig.columns - 1);
  const row = clamp(Math.floor(baseY / mapConfig.majorHeight), 0, mapConfig.rows - 1);
  const localX = baseX - col * mapConfig.majorWidth;
  const localY = baseY - row * mapConfig.majorHeight;
  const subCol = clamp(Math.floor((localX / mapConfig.majorWidth) * 10) + 1, 1, 10);
  const subRow = clamp(Math.floor((localY / mapConfig.majorHeight) * 10) + 1, 1, 10);
  return `${"ABCDEFGHIJKL"[col]}${row + 1}-${String(subCol).padStart(2, "0")}-${String(subRow).padStart(2, "0")}`;
}

function worldToMapX(x) {
  return mapConfig.originX + x * mapConfig.baseScale;
}

function worldToMapY(y) {
  return 760 - mapConfig.originBottom - y * mapConfig.baseScale;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "--";
  return `${(meters / 1000).toFixed(2)} km`;
}

function kmValue(meters) {
  return (meters / 1000).toFixed(2);
}

function easeInOut(value) {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

render();
startMissionClock();
