// Euler XYZ (degrees) to quaternion [x, y, z, w], matching three.js 'XYZ' order.
export function quat([x, y, z]) {
  const r = Math.PI / 360, c1 = Math.cos(x * r), c2 = Math.cos(y * r), c3 = Math.cos(z * r), s1 = Math.sin(x * r), s2 = Math.sin(y * r), s3 = Math.sin(z * r);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
