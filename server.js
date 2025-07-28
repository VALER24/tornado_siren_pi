const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

let tornadoActive = false;
let severeActive = false;
let manualSiren = false;
let sirenTimer = null;
let currentLoop = null; // 'tornado', 'severe', or null
let latestAlerts = [];

const API_URL = 'https://api.weather.gov/alerts/active?event=Tornado%20Warning,Severe%20Thunderstorm%20Warning';

app.use(express.static('public'));
app.use(express.json());

function turnOn() {
    console.log('[SIREN] ON');
    exec('python3 on.py');
}

function turnOff() {
    console.log('[SIREN] OFF');
    exec('python3 off.py');
}

function stopLoop() {
    if (sirenTimer) clearTimeout(sirenTimer);
    sirenTimer = null;
    currentLoop = null;
    turnOff();
}

function startTornadoLoop() {
    stopLoop();
    currentLoop = 'tornado';
    let state = true;
    const loop = () => {
        if (!tornadoActive || manualSiren || currentLoop !== 'tornado') return stopLoop();
        state ? turnOn() : turnOff();
        state = !state;
        sirenTimer = setTimeout(loop, 5000);
    };
    loop();
}

function startSevereLoop() {
    stopLoop();
    currentLoop = 'severe';
    let timePassed = 0;
    let state = true;
    const loop = () => {
        if (!severeActive || manualSiren || currentLoop !== 'severe') return stopLoop();
        if (timePassed >= 20000) return stopLoop();
        state ? turnOn() : turnOff();
        timePassed += state ? 2000 : 5000;
        state = !state;
        sirenTimer = setTimeout(loop, state ? 2000 : 5000);
    };
    loop();
}

async function checkAlerts() {
    try {
        const res = await axios.get(API_URL);
        const alerts = res.data.features;
        const newTornado = alerts.some(a => a.properties.event === 'Tornado Warning');
        const newSevere = alerts.some(a => a.properties.event === 'Severe Thunderstorm Warning');

        // Only act if status has changed or if siren is not running correctly
        const stateChanged = (newTornado !== tornadoActive || newSevere !== severeActive);
        tornadoActive = newTornado;
        severeActive = newSevere;
        latestAlerts = alerts;

        if (manualSiren) return; // Don't interfere with manual control

        if (stateChanged || currentLoop === null) {
            if (tornadoActive) startTornadoLoop();
            else if (severeActive) startSevereLoop();
            else stopLoop();
        }

        console.log(`[CHECK] Tornado: ${tornadoActive}, Severe: ${severeActive}, Manual: ${manualSiren}, Loop: ${currentLoop}`);
    } catch (err) {
        console.error('[ERROR] Fetching alerts:', err.message);
    }
}

setInterval(checkAlerts, 1000);

// API routes
app.get('/alerts', (req, res) => {
    res.json(latestAlerts.map(a => ({
        event: a.properties.event,
        area: a.properties.areaDesc,
        headline: a.properties.headline,
        expires: a.properties.expires
    })));
});

app.post('/siren/:action', (req, res) => {
    const { action } = req.params;
    if (action === 'on') {
        manualSiren = true;
        stopLoop(); // stop any auto-loop
        turnOn();
    } else if (action === 'off') {
        manualSiren = false;
        stopLoop();
        checkAlerts(); // resume automatic mode if alert is still active
    }
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});














































