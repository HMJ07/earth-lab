import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPx;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = aSize * uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    gl_FragColor = vec4(vColor, a * a);
  }
`;

/** Deterministic PRNG so the sky looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStars(count = 3200, radius = 90): Points {
  const random = mulberry32(20261003);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const v = new Vector3();

  for (let i = 0; i < count; i++) {
    // Uniform direction on the sphere.
    const z = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    v.set(r * Math.cos(phi), z, r * Math.sin(phi)).multiplyScalar(radius);
    positions.set([v.x, v.y, v.z], i * 3);

    const bright = Math.pow(random(), 6);
    sizes[i] = 0.9 + bright * 2.4;

    const temperature = random();
    const warm: [number, number, number] = [1, 0.86, 0.72];
    const cool: [number, number, number] = [0.72, 0.84, 1];
    const tint = temperature < 0.5 ? cool : warm;
    const level = 0.35 + bright * 0.65;
    colors.set([tint[0] * level, tint[1] * level, tint[2] * level], i * 3);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));

  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uPx: { value: Math.min(window.devicePixelRatio, 2) } },
  });

  const stars = new Points(geometry, material);
  stars.name = 'stars';
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  return stars;
}
