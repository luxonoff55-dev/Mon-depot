/* script.js — webcam + jsQR detection + UX polish (français) */

/*
  Pré-requis dans index.html (juste avant ce script) :
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
  <script src="script.js"></script>
*/

const messageEl = document.getElementById('message');
const video = document.getElementById('webcamFeed');

// Create a hidden canvas used for scanning and overlay canvas for drawing boxes
const hiddenCanvas = document.createElement('canvas');
const hiddenCtx = hiddenCanvas.getContext('2d');

const overlay = document.createElement('canvas');
overlay.id = 'overlay';
document.querySelector('.video-wrap')?.appendChild(overlay);
const overlayCtx = overlay.getContext('2d');

// Scanline element for visual effect
const scanline = document.createElement('div');
scanline.className = 'scanline';
document.querySelector('.video-wrap')?.appendChild(scanline);

// State
let stream = null;
let scanning = false;
let animationFrameId = null;
let lastResult = null;

// Preferred constraints: use rear camera on mobile if available
const constraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  audio: false
};

function setMessage(text, success = false) {
  messageEl.textContent = text;
  if (success) {
    messageEl.classList.add('success');
  } else {
    messageEl.classList.remove('success');
  }
}

// Start webcam and scanning
async function startWebcamAndScan() {
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // Ensure video plays
    await video.play();

    // Set canvas sizes to video size
    hiddenCanvas.width = video.videoWidth;
    hiddenCanvas.height = video.videoHeight;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    // Position scanline full height of overlay
    scanline.style.width = '100%';
    scanline.style.left = overlay.offsetLeft + 'px';

    scanning = true;
    setMessage('Caméra activée — place le QR dans le cadre');
    tick(); // start the loop
  } catch (err) {
    console.error('Erreur caméra:', err);
    setMessage("Impossible d'accéder à la caméra. Vérifie les permissions et le HTTPS.", false);
  }
}

// Stop webcam and scanning
function stopScanning() {
  scanning = false;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  setMessage('Scan arrêté.');
}

// Drawing helper: draw detection box
function drawLine(begin, end, color) {
  overlayCtx.beginPath();
  overlayCtx.moveTo(begin.x, begin.y);
  overlayCtx.lineTo(end.x, end.y);
  overlayCtx.lineWidth = 4;
  overlayCtx.strokeStyle = color;
  overlayCtx.stroke();
}

// Main loop: capture frames and run jsQR
function tick() {
  if (!scanning) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    // draw current video frame to hidden canvas
    hiddenCanvas.width = video.videoWidth;
    hiddenCanvas.height = video.videoHeight;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    hiddenCtx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
    const imageData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);

    // Try decode with jsQR (lib should be included)
    const code = window.jsQR ? jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) : null;

    // clear overlay first
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (code) {
      // draw a box around detection
      drawLine(code.location.topLeftCorner, code.location.topRightCorner, '#7ef9e6');
      drawLine(code.location.topRightCorner, code.location.bottomRightCorner, '#7ef9e6');
      drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, '#7ef9e6');
      drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, '#7ef9e6');

      // small marker in center
      overlayCtx.fillStyle = 'rgba(127,249,237,0.45)';
      const cx = (code.location.topLeftCorner.x + code.location.bottomRightCorner.x) / 2;
      const cy = (code.location.topLeftCorner.y + code.location.bottomRightCorner.y) / 2;
      overlayCtx.beginPath();
      overlayCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      overlayCtx.fill();

      // Avoid repeating same result
      if (code.data && code.data !== lastResult) {
        lastResult = code.data;
        onQRCodeScanned(code.data);
      }
    } else {
      // draw a faint centered scanning rectangle hint
      const w = overlay.width * 0.6;
      const h = overlay.height * 0.4;
      const x = (overlay.width - w) / 2;
      const y = (overlay.height - h) / 2;
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([10, 8]);
      overlayCtx.strokeRect(x, y, w, h);
      overlayCtx.setLineDash([]);
    }
  }

  animationFrameId = requestAnimationFrame(tick);
}

// Called when a QR code is decoded
function onQRCodeScanned(data) {
  setMessage("QR détecté — traitement en cours...", true);

  // small UX: flash overlay
  overlayCtx.fillStyle = 'rgba(127,249,237,0.06)';
  overlayCtx.fillRect(0, 0, overlay.width, overlay.height);

  // If the QR contains a URL, propose l'ouverture
  const urlPattern = /^(https?:\/\/[^\s]+)/i;
  const match = data.match(urlPattern);

  // Build an action area in the DOM if not present
  let actions = document.querySelector('.actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'actions';
    document.querySelector('.media-right').appendChild(actions);
  }
  actions.innerHTML = ''; // reset

  // Show the decoded text
  const info = document.createElement('div');
  info.className = 'decoded';
  info.style.color = '#bfffea';
  info.style.fontWeight = '600';
  info.style.overflowWrap = 'anywhere';
  info.textContent = `Contenu scanné: ${data}`;
  document.querySelector('.media-right').appendChild(info);

  // Visit button if URL
  if (match) {
    const openBtn = document.createElement('button');
    openBtn.className = 'btn';
    openBtn.textContent = 'Ouvrir le lien';
    openBtn.onclick = () => {
      // open in new tab
      window.open(match[1], '_blank', 'noopener');
    };
    actions.appendChild(openBtn);
  }

  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn secondary';
  copyBtn.textContent = 'Copier le texte';
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(data);
      setMessage('Texte copié dans le presse-papier ✅', true);
    } catch (e) {
      console.error('Copy failed:', e);
      setMessage('Impossible de copier automatiquement. Sélectionnez et copiez manuellement.', false);
    }
  };
  actions.appendChild(copyBtn);

  // Celebration: simple CSS animation / confetti fallback
  triggerConfetti();

  // Optionally stop scanning after a successful decode; comment out if you want continuous scanning
  stopScanning();
}

// Tiny confetti fallback (simple circles) — not heavy, pure DOM
function triggerConfetti() {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = 0;
  wrapper.style.top = 0;
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.overflow = 'visible';
  document.body.appendChild(wrapper);

  const colors = ['#7ef9e6', '#2be7ff', '#8f5cff', '#ffd166', '#ff6b6b'];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = Math.random() * 10 + 8;
    el.style.position = 'absolute';
    el.style.left = Math.random() * 100 + '%';
    el.style.top = '-10%';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = '50%';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.opacity = (Math.random() * 0.6) + 0.5;
    el.style.transform = `translateY(0) rotate(${Math.random()*360}deg)`;
    el.style.transition = `transform ${2 + Math.random()*1.8}s cubic-bezier(.2,.8,.2,1), top ${2 + Math.random()*1.8}s ease-in, opacity 1s linear`;
    wrapper.appendChild(el);

    // animate
    setTimeout(() => {
      el.style.top = (70 + Math.random()*30) + '%';
      el.style.transform = `translateY(0) rotate(${Math.random()*720}deg) translateX(${(Math.random()-0.5)*200}px)`;
      el.style.opacity = '0.1';
    }, 20 + i*30);
  }

  // cleanup
  setTimeout(() => document.body.removeChild(wrapper), 4200);
}

// Start on load, with a small delay to allow page rendering
window.addEventListener('DOMContentLoaded', () => {
  // Ensure container for right side exists (if user used original HTML)
  const right = document.querySelector('.media-right');
  if (!right) {
    // Try to adapt to the provided HTML structure
    const container = document.querySelector('.media-container');
    const rightCol = document.createElement('div');
    rightCol.className = 'media-right';
    // move existing video/message into it if present
    const existingVideo = document.getElementById('webcamFeed');
    const existingMessage = document.getElementById('message');

    if (existingVideo) {
      const wrap = document.createElement('div');
      wrap.className = 'video-wrap';
      existingVideo.parentNode.insertBefore(wrap, existingVideo);
      wrap.appendChild(existingVideo);
      rightCol.appendChild(wrap);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'video-wrap';
      const v = document.createElement('video');
      v.id = 'webcamFeed';
      v.autoplay = true;
      v.playsInline = true;
      wrap.appendChild(v);
      rightCol.appendChild(wrap);
    }

    if (existingMessage) {
      rightCol.appendChild(existingMessage);
    } else {
      const msg = document.createElement('p');
      msg.id = 'message';
      msg.textContent = 'Prêt à scanner';
      rightCol.appendChild(msg);
    }

    container.appendChild(rightCol);
  } else {
    // ensure .video-wrap wraps the #webcamFeed
    if (!document.querySelector('.video-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'video-wrap';
      const v = document.getElementById('webcamFeed');
      if (v) v.parentNode.insertBefore(wrap, v), wrap.appendChild(v);
      else wrap.appendChild(document.createElement('video'));
      document.querySelector('.media-right').prepend(wrap);
    }
  }

  // small UX delay then start
  setTimeout(startWebcamAndScan, 300);
});

// Optional: stop scanning when leaving page
window.addEventListener('pagehide', stopScanning);
