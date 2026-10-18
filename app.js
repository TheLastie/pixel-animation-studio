(() => {
  const SIZE = 24, SCALE = 16, COLORS = ['#ff6a4f', '#f5cd65', '#81d6bf', '#a98bef', '#f4efe5', '#272731'];
  const canvas = document.querySelector('#drawingCanvas'), ctx = canvas.getContext('2d');
  const preview = document.querySelector('#previewCanvas'), pctx = preview.getContext('2d');
  const $ = id => document.getElementById(id);
  let frames = createDemo(), active = 0, tool = 'pencil', color = COLORS[0], zoom = 800, fps = 8;
  let gridOn = true, onionOn = true, playing = false, playTimer = null, drawing = false, dragged = -1;
  const undoStack = [], redoStack = [];

  function blankFrame() { return Array(SIZE * SIZE).fill(null); }
  function setPixel(frame, x, y, c) { if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) frame[y * SIZE + x] = c; }
  function createDemo() {
    const palette = { wing: COLORS[3], wingLight: COLORS[2], body: COLORS[0], spot: COLORS[1], eye: COLORS[5], cream: COLORS[4] };
    const shapes = [];
    for (let i = 0; i < 6; i++) {
      const frame = blankFrame(), flutter = [0, 1, 3, 4, 2, 1][i], rise = [1, 0, -1, -1, 0, 1][i];
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const dx = Math.abs(x - 11.5), yy = y - rise;
        const wingTop = Math.pow((yy - 8) / (4.1 + flutter * .45), 2) + Math.pow((dx - 5) / (3.5 + flutter * .55), 2);
        const wingBottom = Math.pow((yy - 13) / (2.7 + flutter * .25), 2) + Math.pow((dx - 5.4) / (3.2 + flutter * .4), 2);
        if (wingTop < 1 || wingBottom < 1) setPixel(frame, x, y, (x + y) % 5 === 0 ? palette.wingLight : palette.wing);
        if (Math.abs(x - 11.5) < 1.1 && yy >= 6 && yy <= 16) setPixel(frame, x, y, palette.body);
        if (Math.abs(x - 11.5) <= 1 && yy >= 5 && yy <= 6) setPixel(frame, x, y, palette.spot);
        if ((x === 11 || x === 12) && yy === 4) setPixel(frame, x, y, palette.body);
        if ((x === 9 && yy === 4) || (x === 14 && yy === 4)) setPixel(frame, x, y, palette.cream);
        if ((x === 10 || x === 13) && yy === 7) setPixel(frame, x, y, palette.eye);
        if (x === 11 && yy === 18 && i % 2 === 0) setPixel(frame, x, y, palette.spot);
      }
      shapes.push(frame);
    }
    return shapes;
  }

  function drawFrame(target, frame, options = {}) {
    target.clearRect(0, 0, SIZE * SCALE, SIZE * SCALE);
    if (options.onion && onionOn && active > 0) {
      target.globalAlpha = .22;
      paintPixels(target, frames[active - 1], true);
      target.globalAlpha = 1;
    }
    paintPixels(target, frame, gridOn && options.grid !== false);
  }
  function paintPixels(target, frame, withGrid) {
    for (let i = 0; i < frame.length; i++) {
      const c = frame[i]; if (!c) continue;
      const x = i % SIZE, y = Math.floor(i / SIZE);
      target.fillStyle = c; target.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
    if (withGrid) {
      target.beginPath(); target.strokeStyle = 'rgba(22,21,29,.22)'; target.lineWidth = .65;
      for (let n = 1; n < SIZE; n++) { target.moveTo(n * SCALE + .5, 0); target.lineTo(n * SCALE + .5, SIZE * SCALE); target.moveTo(0, n * SCALE + .5); target.lineTo(SIZE * SCALE, n * SCALE + .5); }
      target.stroke();
    }
  }
  function drawActive() { drawFrame(ctx, frames[active], { onion: true }); renderThumbnails(); drawPreview(); updateCounts(); }
  function drawPreview() { drawAt(active, pctx); }
  function drawAt(index, target) { target.clearRect(0, 0, target.canvas.width, target.canvas.height); const ratio = target.canvas.width / (SIZE * SCALE); target.save(); target.scale(ratio, ratio); paintPixels(target, frames[index], false); target.restore(); }

  function renderThumbnails() {
    const strip = $('framesStrip'); strip.replaceChildren();
    frames.forEach((frame, index) => {
      const card = document.createElement('button'); card.type = 'button'; card.className = `frame-card${index === active ? ' is-active' : ''}`;
      card.setAttribute('role', 'listitem'); card.setAttribute('aria-label', `Кадр ${index + 1}${index === active ? ', выбран' : ''}`); card.setAttribute('aria-pressed', String(index === active));
      card.draggable = true; card.dataset.index = index;
      const thumb = document.createElement('canvas'); thumb.width = 96; thumb.height = 96; thumb.setAttribute('aria-hidden', 'true'); drawAt(index, thumb.getContext('2d'));
      const label = document.createElement('span'); label.textContent = `Кадр ${String(index + 1).padStart(2, '0')}`;
      card.append(thumb, label);
      card.addEventListener('click', () => { active = index; drawActive(); });
      card.addEventListener('dragstart', event => { dragged = index; card.classList.add('is-dragging'); event.dataTransfer.setData('text/plain', String(index)); });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      card.addEventListener('dragover', event => event.preventDefault());
      card.addEventListener('drop', event => { event.preventDefault(); const from = dragged, to = Number(card.dataset.index); if (from < 0 || from === to) return; snapshot(); const [item] = frames.splice(from, 1); frames.splice(to, 0, item); active = to; dragged = -1; drawActive(); });
      strip.append(card);
    });
  }
  function updateCounts() {
    $('activeFrameNumber').textContent = String(active + 1).padStart(2, '0');
    $('totalFrames').textContent = String(frames.length).padStart(2, '0');
    $('frameCount').textContent = `${String(frames.length).padStart(2, '0')} кадров`;
    $('projectLabel').textContent = `Мотылёк / ${SIZE} × ${SIZE}`;
  }
  function snapshot() { undoStack.push({ frames: frames.map(frame => [...frame]), active }); if (undoStack.length > 45) undoStack.shift(); redoStack.length = 0; updateHistoryButtons(); }
  function restore(source, dest) { if (!source.length) return; dest.push({ frames: frames.map(frame => [...frame]), active }); const state = source.pop(); frames = state.frames; active = Math.min(state.active, frames.length - 1); updateHistoryButtons(); drawActive(); }
  function updateHistoryButtons() { $('undoButton').disabled = !undoStack.length; $('redoButton').disabled = !redoStack.length; }
  function cellAt(event) { const rect = canvas.getBoundingClientRect(); return [Math.floor((event.clientX - rect.left) / rect.width * SIZE), Math.floor((event.clientY - rect.top) / rect.height * SIZE)]; }
  function applyTool(event) {
    const [x, y] = cellAt(event); if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    if (tool === 'picker') { const picked = frames[active][y * SIZE + x]; if (picked) setColor(picked); selectTool('pencil'); return; }
    if (tool === 'fill') { floodFill(x, y); drawActive(); drawing = false; return; }
    setPixel(frames[active], x, y, tool === 'eraser' ? null : color); drawActive();
  }
  function floodFill(x, y) {
    const frame = frames[active], start = y * SIZE + x, old = frame[start]; if (old === color) return;
    const stack = [[x, y]], seen = new Uint8Array(SIZE * SIZE);
    while (stack.length) {
      const [cx, cy] = stack.pop(); if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
      const index = cy * SIZE + cx; if (seen[index] || frame[index] !== old) continue;
      seen[index] = 1; frame[index] = color; stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  function selectTool(name) { tool = name; document.querySelectorAll('.tool-button').forEach(button => button.classList.toggle('is-active', button.dataset.tool === name)); }
  function setColor(value) {
    color = value.toLowerCase(); $('colorCode').textContent = color.toUpperCase(); $('currentHex').textContent = color.toUpperCase(); $('currentDot').style.background = color; $('customColor').value = color;
    document.querySelectorAll('.swatch').forEach(button => { const selected = button.dataset.color === color; button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }
  function addFrame(duplicate) { if (frames.length >= 24) return; snapshot(); const frame = duplicate ? [...frames[active]] : blankFrame(); frames.splice(active + 1, 0, frame); active++; drawActive(); }
  function deleteFrame() { if (frames.length <= 1) return; snapshot(); frames.splice(active, 1); active = Math.min(active, frames.length - 1); drawActive(); }
  function setZoom(value) { zoom = Math.max(400, Math.min(1200, value)); $('zoomLabel').textContent = `${zoom}%`; const side = `${Math.round(384 * zoom / 800)}px`; canvas.style.width = side; canvas.style.height = side; }
  function toggle(button, key) { if (key === 'gridOn') gridOn = !gridOn; else onionOn = !onionOn; button.classList.toggle('is-on', key === 'gridOn' ? gridOn : onionOn); button.setAttribute('aria-pressed', String(key === 'gridOn' ? gridOn : onionOn)); drawActive(); }
  function togglePlayback() {
    playing = !playing; $('playButton').textContent = playing ? 'Ⅱ' : '▶'; $('playButton').setAttribute('aria-label', playing ? 'Остановить' : 'Воспроизвести');
    if (playTimer) clearInterval(playTimer);
    if (playing) playTimer = setInterval(() => { active = (active + 1) % frames.length; drawActive(); }, 1000 / fps);
  }
  function setSpeed(value) { fps = Number(value); $('fpsOutput').textContent = `${fps} к/с`; if (playing) { clearInterval(playTimer); playTimer = setInterval(() => { active = (active + 1) % frames.length; drawActive(); }, 1000 / fps); } }
  function exportSheet() {
    const sheet = document.createElement('canvas'); sheet.width = SIZE * frames.length; sheet.height = SIZE;
    const out = sheet.getContext('2d'); out.imageSmoothingEnabled = false;
    frames.forEach((frame, fi) => frame.forEach((c, i) => { if (c) { out.fillStyle = c; out.fillRect(fi * SIZE + i % SIZE, Math.floor(i / SIZE), 1, 1); } }));
    sheet.toBlob(blob => { if (!blob) return; const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `pixel-motion-${frames.length}-frames.png`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); });
  }

  canvas.addEventListener('pointerdown', event => { event.preventDefault(); canvas.setPointerCapture(event.pointerId); snapshot(); drawing = true; applyTool(event); });
  canvas.addEventListener('pointermove', event => { if (!drawing || !['pencil', 'eraser'].includes(tool)) return; applyTool(event); });
  canvas.addEventListener('pointerup', () => { drawing = false; }); canvas.addEventListener('pointercancel', () => { drawing = false; });
  document.querySelectorAll('.tool-button').forEach(button => button.addEventListener('click', () => selectTool(button.dataset.tool)));
  document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => setColor(button.dataset.color)));
  $('customColor').addEventListener('input', event => setColor(event.target.value));
  $('gridToggle').addEventListener('click', () => toggle($('gridToggle'), 'gridOn'));
  $('onionToggle').addEventListener('click', () => toggle($('onionToggle'), 'onionOn'));
  $('addFrameButton').addEventListener('click', () => addFrame(false)); $('duplicateButton').addEventListener('click', () => addFrame(true)); $('deleteFrameButton').addEventListener('click', deleteFrame);
  $('undoButton').addEventListener('click', () => restore(undoStack, redoStack)); $('redoButton').addEventListener('click', () => restore(redoStack, undoStack));
  $('zoomOut').addEventListener('click', () => setZoom(zoom - 100)); $('zoomIn').addEventListener('click', () => setZoom(zoom + 100));
  $('playButton').addEventListener('click', togglePlayback); $('fpsInput').addEventListener('input', event => setSpeed(event.target.value)); $('exportButton').addEventListener('click', exportSheet);
  document.addEventListener('keydown', event => {
    if (event.target.matches('input')) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    if (event.key === 'ArrowRight') { active = (active + 1) % frames.length; drawActive(); }
    if (event.key === 'ArrowLeft') { active = (active + frames.length - 1) % frames.length; drawActive(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack); }
    if (!event.ctrlKey && !event.metaKey && !event.altKey) { const hotkeys = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' }; if (hotkeys[event.key.toLowerCase()]) selectTool(hotkeys[event.key.toLowerCase()]); }
  });
  setZoom(zoom); setSpeed(fps); setColor(color); drawActive(); updateHistoryButtons();
})();
