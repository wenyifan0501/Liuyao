import * as THREE from 'three';

// Original seeded material detail. Height and roughness are linear data, not
// color maps: wood color variation must not turn into deep engraved stripes.
export function surfaceDetail(kind: 'wood' | 'stone' | 'cloth') {
  const size = 512;
  const height = document.createElement('canvas'), rough = document.createElement('canvas');
  height.width = height.height = rough.width = rough.height = size;
  const hc = height.getContext('2d')!, rc = rough.getContext('2d')!;
  const h = hc.createImageData(size, size), r = rc.createImageData(size, size);
  let seed = 32871;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const bands = Array.from({length: size}, () => random());
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = random(), row = bands[(y + Math.round(3 * Math.sin(x / 90))) & 511];
    const weave = Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2);
    const detail = kind === 'wood' ? row * 19 + noise * 8 : kind === 'stone' ? noise * 17 : weave * 24 + noise * 9;
    const elevation = 115 + detail;
    const roughness = kind === 'wood' ? 158 + row * 35 + noise * 12 : kind === 'stone' ? 150 + noise * 36 : 222 + noise * 20;
    const index = (y * size + x) * 4;
    for (let channel = 0; channel < 3; channel++) { h.data[index + channel] = elevation; r.data[index + channel] = roughness; }
    h.data[index + 3] = r.data[index + 3] = 255;
  }
  hc.putImageData(h, 0, 0); rc.putImageData(r, 0, 0);
  const bump = new THREE.CanvasTexture(height), roughness = new THREE.CanvasTexture(rough);
  for (const map of [bump, roughness]) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(kind === 'wood' ? 3 : 2, kind === 'wood' ? 3 : 2);
    map.anisotropy = 4;
  }
  return { bump, roughness, dispose() { bump.dispose(); roughness.dispose(); } };
}
