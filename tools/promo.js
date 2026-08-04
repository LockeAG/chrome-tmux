// The frame fills the viewport and the design is centred, so a capture at any
// window size can be fitted and padded to each store format without distortion
// and without a visible seam.

const frame = document.getElementById('frame');
const unit = Math.min(innerWidth, innerHeight) / 100;
frame.style.setProperty('--u', `${unit}px`);
