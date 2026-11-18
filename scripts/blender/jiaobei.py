"""Divination block (筊杯) for the Liuyao study, built procedurally in Blender.

Run inside Blender (via bmcp.py run jiaobei.py). Works in its own scene, never
touches or saves the user's open .blend. Outputs:
  apps/web/public/models/jiaobei.glb   web asset (one block; the page instances two)
  assets-src/blender/jiaobei.blend     editable source (object, materials, packed maps)
  logs/blender/jiaobei-preview.png     EEVEE preview

Conventions (glTF / three.js after export): length along X, convex face +Y,
flat face lowest at y = 0, crescent bows toward -Z, origin at footprint centre.
"""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np

ARGS = globals().get("ARGS", {})
REPO = Path(globals().get("__file__", "")).resolve().parents[2]
OUT_GLB = REPO / "apps/web/public/models/jiaobei.glb"
OUT_BLEND = REPO / "assets-src/blender/jiaobei.blend"
OUT_PREVIEW = REPO / "logs/blender/jiaobei-preview.png"

HALF_LEN = 0.60      # 1.2 units long
MAX_WIDTH = 0.40
DOME = 0.235         # convex face height
BELLY = 0.022        # the "flat" face is very slightly crowned, like a carved block
SAG = 0.25           # crescent bow of the centre line
RINGS, AROUND = 140, 96
TEX_W, TEX_H = 2048, 1024


# ───────────────────────── geometry ─────────────────────────
def width(u):
    return MAX_WIDTH * (1 - abs(u) ** 1.6) ** 0.62


def dome(u):
    return DOME * (1 - abs(u) ** 2.1) ** 0.62


def belly(u):
    return BELLY * (1 - abs(u) ** 2) ** 0.5


def section(phi, p_top=2.35, p_bottom=5.5):
    """Superellipse cross-section: a full dome above, a nearly flat face below.
    Both halves have vertical tangents at the rim, so the edge is round and
    continuous instead of a hard 90° crease."""
    c, s = math.cos(phi), math.sin(phi)
    p = p_top if s >= 0 else p_bottom
    v = math.copysign(abs(c) ** (2 / p), c)
    w = math.copysign(abs(s) ** (2 / p), s)
    return v, w


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rng = np.random.default_rng(7)
    # Low-frequency hand-carved irregularity on the dome.
    wobble = rng.normal(0, 1, (8, 12))

    def irregular(u, phi):
        i = (u + 1) / 2 * 7
        j = (phi % (2 * math.pi)) / (2 * math.pi) * 11
        i0, j0 = int(i), int(j)
        fi, fj = i - i0, j - j0
        a = wobble[i0, j0] * (1 - fj) + wobble[i0, (j0 + 1) % 12] * fj
        b = wobble[min(i0 + 1, 7), j0] * (1 - fj) + wobble[min(i0 + 1, 7), (j0 + 1) % 12] * fj
        return a * (1 - fi) + b * fi

    def point(u, phi):
        x = HALF_LEN * u
        yc = SAG * (1 - u * u)
        # Normal of the bowed centre line, so width is measured across it.
        dy = -2 * SAG * u / HALF_LEN
        n = math.hypot(dy, 1)
        nx, ny = -dy / n, 1 / n
        v, w = section(phi)
        half = width(u) / 2
        z = dome(u) * w if w >= 0 else belly(u) * w
        if w > 0:
            z *= 1 + 0.025 * irregular(u, phi) * w
        return (x + nx * v * half, yc + ny * v * half, z)

    # Rings are denser near the tips (u = -cos θ) to keep the rounded ends smooth.
    thetas = [math.pi * i / RINGS for i in range(1, RINGS)]
    rings = []
    for t in thetas:
        u = -math.cos(t)
        rings.append([(u, 2 * math.pi * j / AROUND) for j in range(AROUND)])
    verts = [[bm.verts.new(point(u, phi)) for (u, phi) in ring] for ring in rings]
    tip_a = bm.verts.new(point(-1.0, 0))
    tip_b = bm.verts.new(point(1.0, 0))

    def uv(u, j):
        return ((u + 1) / 2, j / AROUND)

    for r in range(len(rings) - 1):
        ua, ub = rings[r][0][0], rings[r + 1][0][0]
        for j in range(AROUND):
            j2 = (j + 1) % AROUND
            face = bm.faces.new((verts[r][j], verts[r][j2], verts[r + 1][j2], verts[r + 1][j]))
            for loop, (uu, jj) in zip(face.loops, ((ua, j), (ua, j + 1), (ub, j + 1), (ub, j))):
                loop[uv_layer].uv = uv(uu, jj)
    for tip, ring, u_tip, reverse in ((tip_a, 0, -1.0, True), (tip_b, len(rings) - 1, 1.0, False)):
        u_ring = rings[ring][0][0]
        for j in range(AROUND):
            j2 = (j + 1) % AROUND
            corners = [(verts[ring][j], (u_ring, j)), (verts[ring][j2], (u_ring, j + 1)), (tip, (u_tip, j + .5))]
            if reverse:
                corners = corners[::-1]
            face = bm.faces.new([c[0] for c in corners])
            for loop, (_, (uu, jj)) in zip(face.loops, corners):
                loop[uv_layer].uv = uv(uu, jj)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Material slots: 0 = lacquered convex face, 1 = flat wooden face.
    for f in bm.faces:
        f.material_index = 0 if f.calc_center_median().z > 0.002 else 1
    # Footprint centred, lowest point on the ground.
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zmin = min(v.co.z for v in bm.verts)
    offset = ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, zmin)
    for v in bm.verts:
        v.co.x -= offset[0]
        v.co.y -= offset[1]
        v.co.z -= offset[2]
    mesh = bpy.data.meshes.new("jiaobei")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


# ───────────────────────── textures ─────────────────────────
def value_noise(h, w, cy, cx, seed, wrap_y=True):
    rng = np.random.default_rng(seed)
    grid = rng.random((cy + 1, cx + 1))
    if wrap_y:
        grid[-1, :] = grid[0, :]
    y = np.linspace(0, cy, h, endpoint=not wrap_y)
    x = np.linspace(0, cx, w)
    y0 = np.minimum(np.floor(y).astype(int), cy - 1)
    x0 = np.minimum(np.floor(x).astype(int), cx - 1)
    fy = (y - y0)[:, None]
    fx = (x - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    g00 = grid[y0][:, x0]
    g01 = grid[y0][:, x0 + 1]
    g10 = grid[y0 + 1][:, x0]
    g11 = grid[y0 + 1][:, x0 + 1]
    return (g00 * (1 - fx) + g01 * fx) * (1 - fy) + (g10 * (1 - fx) + g11 * fx) * fy


def fbm(h, w, cy, cx, seed, octaves=4):
    total, amp, norm = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(h, w, cy * 2 ** o, cx * 2 ** o, seed + o)
        norm += amp
        amp *= 0.5
    return total / norm


def srgb(*rgb):
    return np.array(rgb, dtype=np.float64) / 255.0


def build_maps():
    h, w = TEX_H, TEX_W
    V = (np.arange(h) + 0.5)[:, None] / h          # around the section (row 0 = V 0)
    U = (np.arange(w) + 0.5)[None, :] / w          # along the length
    phi = 2 * np.pi * V
    top = (np.sin(phi) > 0).astype(np.float64) * np.ones((1, w))
    rim = np.exp(-(np.sin(phi) ** 2) / 0.012) * np.ones((1, w))
    tip = (np.abs(2 * U - 1) ** 10) * np.ones((h, 1))

    large = fbm(h, w, 6, 10, 11)
    streak = value_noise(h, w, 260, 6, 21)                # lacquer brush streaks run lengthwise
    fine = fbm(h, w, 90, 180, 31, 3)
    chips = fbm(h, w, 40, 80, 41, 3)

    # Convex face: layered vermilion lacquer over a dark ground, worn at rim and tips.
    blotch = fbm(h, w, 3, 5, 71, 3)
    lacquer = srgb(124, 22, 14)[None, None, :] * (0.82 + 0.3 * large[..., None]) * (0.95 + 0.08 * streak[..., None])
    lacquer = lacquer * (1 - 0.18 * np.clip(blotch - .45, 0, 1)[..., None] * 3) + srgb(70, 30, 18) * 0.12 * tip[..., None]
    lacquer = lacquer * np.array([1.0, 0.94 + 0.08 * fine.mean(), 1.0])
    soft_rim = np.exp(-(np.sin(phi) ** 2) / 0.03) * np.ones((1, w))
    wear = np.clip((soft_rim * 0.7 + tip * 0.9) * (0.4 + 0.8 * large) - 0.5, 0, 1) * 1.6
    wear = np.clip(wear, 0, 1)
    ground = srgb(58, 22, 14)
    bare = srgb(132, 86, 52)
    lacquer = lacquer * (1 - wear[..., None]) + ground * np.clip(wear * 1.6, 0, 1)[..., None] * (1 - np.clip(wear - .6, 0, 1)[..., None] * 2) \
        + bare * np.clip(wear - .6, 0, 1)[..., None] * 2
    lacquer = np.clip(lacquer, 0, 1)

    # Flat face: straight-grained wood, red stain, lacquer bleeding in from the rim.
    warp = fbm(h, w, 4, 3, 51, 3)
    rings = (V * 62 + 0.45 * warp + 0.12 * np.sin(U * 7)) % 1.0
    grain = np.exp(-((rings - 0.5) ** 2) / 0.006) * (0.6 + 0.4 * value_noise(h, w, 30, 4, 81))
    flecks = np.clip(value_noise(h, w, 700, 40, 91) - 0.7, 0, 1) * 3
    pores = value_noise(h, w, 420, 30, 61)
    wood = srgb(178, 118, 74)[None, None, :] * (0.92 + 0.12 * large[..., None])
    wood = wood * (1 - 0.22 * grain[..., None] - 0.08 * flecks[..., None]) * (0.96 + 0.05 * pores[..., None])
    wood = wood * 0.86 + srgb(150, 44, 26) * 0.14
    bleed = np.clip(rim * 1.3 + tip * 0.8 - 0.25 + 0.25 * chips, 0, 1)
    wood = wood * (1 - bleed[..., None]) + srgb(128, 26, 16) * bleed[..., None]

    color = lacquer * top[..., None] + wood * (1 - top[..., None])

    rough_lacquer = 0.3 + 0.12 * fine + 0.1 * blotch + 0.3 * wear
    rough_wood = 0.58 + 0.1 * grain + 0.06 * pores - 0.25 * bleed
    roughness = np.clip(rough_lacquer * top + rough_wood * (1 - top), 0.08, 1)

    height = top * (0.02 * fine + 0.04 * streak - wear * 0.25) + (1 - top) * (-grain * 0.06 - flecks * 0.04 + pores * 0.02)
    gy, gx = np.gradient(height)
    strength = 6.0
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx / length * .5 + .5, ny / length * .5 + .5, nz / length * .5 + .5], -1)

    orm = np.stack([np.ones_like(roughness), roughness, np.zeros_like(roughness)], -1)
    coat = top * (1 - np.clip(wear * 1.5, 0, 1))
    return color, orm, normal, coat


def image(name, rgb, colorspace):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, TEX_W, TEX_H, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], -1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def material(name, maps, lacquered):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    base = nt.nodes.new("ShaderNodeTexImage")
    base.image = maps["color"]
    nt.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    orm = nt.nodes.new("ShaderNodeTexImage")
    orm.image = maps["orm"]
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nrm = nt.nodes.new("ShaderNodeTexImage")
    nrm.image = maps["normal"]
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 1.0
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if lacquered:
        bsdf.inputs["Coat Weight"].default_value = 0.45
        bsdf.inputs["Coat Roughness"].default_value = 0.16
    for i, node in enumerate(nt.nodes):
        node.location = (-300 * (i % 3), -260 * (i // 3))
    return mat


# ───────────────────────── scene, preview, export ─────────────────────────
def fresh_scene(name):
    old = bpy.data.scenes.get(name)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    return scene


def preview(scene, objects):
    cam_data = bpy.data.cameras.new("LY_cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("LY_cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (2.6, -3.4, 2.3)
    target = bpy.data.objects.new("LY_target", None)
    scene.collection.objects.link(target)
    target.location = (0, 0.1, 0.08)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    scene.camera = cam
    key = bpy.data.objects.new("LY_key", bpy.data.lights.new("LY_key", "AREA"))
    key.data.energy = 220
    key.data.size = 2.5
    key.location = (-1.5, -1.5, 3)
    key.rotation_euler = (0.6, -0.4, 0)
    rim = bpy.data.objects.new("LY_rim", bpy.data.lights.new("LY_rim", "AREA"))
    rim.data.energy = 120
    rim.data.size = 1.5
    rim.location = (1.8, 2.2, 1.6)
    rim.rotation_euler = (-1.0, 0.5, 2.6)
    for light in (key, rim):
        scene.collection.objects.link(light)
    floor = bpy.data.meshes.new("LY_floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(floor)
    bm.free()
    floor_obj = bpy.data.objects.new("LY_floor", floor)
    fm = bpy.data.materials.new("LY_floor")
    fm.use_nodes = True
    fb = next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    fb.inputs["Base Color"].default_value = (0.32, 0.25, 0.18, 1)
    fb.inputs["Roughness"].default_value = 0.8
    floor.materials.append(fm)
    scene.collection.objects.link(floor_obj)
    world = bpy.data.worlds.new("LY_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.25, 0.22, 0.2, 1)
    bg.inputs["Strength"].default_value = 0.5
    scene.world = world
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 900
    scene.render.filepath = str(OUT_PREVIEW)
    scene.view_settings.view_transform = "AgX"
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    cam.location = (0.05, 0.2, 4.2)
    cam_data.lens = 50
    scene.render.filepath = str(OUT_PREVIEW.with_name('jiaobei-top.png'))
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return [cam, target, key, rim, floor_obj]


def main():
    scene = fresh_scene("LY_Jiaobei")
    mesh = build_mesh()
    color, orm, normal, _coat = build_maps()
    maps = {
        "color": image("jiaobei_color", color, "sRGB"),
        "orm": image("jiaobei_orm", orm, "Non-Color"),
        "normal": image("jiaobei_normal", normal, "Non-Color"),
    }
    mesh.materials.append(material("jiaobei_lacquer", maps, True))
    mesh.materials.append(material("jiaobei_wood", maps, False))
    block = bpy.data.objects.new("jiaobei", mesh)
    scene.collection.objects.link(block)

    # Second instance only for the preview: one face up, one face down.
    twin = bpy.data.objects.new("jiaobei_twin", mesh)
    scene.collection.objects.link(twin)
    zmax = max(v.co.z for v in mesh.vertices)
    twin.rotation_euler = (math.pi, 0, 0.5)
    twin.location = (0.15, 0.75, zmax)
    block.location = (0, -0.35, 0)
    block.rotation_euler = (0, 0, -0.25)
    helpers = []
    if ARGS.get("preview", "1") == "1":
        helpers = preview(scene, [block, twin])

    # Export only the canonical block at the origin.
    block.location = (0, 0, 0)
    block.rotation_euler = (0, 0, 0)
    # Selection lives per view layer: clear every scene and export the active scene only.
    for sc in bpy.data.scenes:
        for layer in sc.view_layers:
            for obj in sc.objects:
                obj.select_set(obj == block, view_layer=layer)
    bpy.context.view_layer.objects.active = block
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB), export_format="GLB", use_selection=True, use_active_scene=True,
        export_image_format="WEBP", export_image_quality=90, export_apply=True,
        export_yup=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False,
    )
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(OUT_BLEND), {block, twin, *helpers}, fake_user=True, compress=True)
    print(f"verts={len(mesh.vertices)} tris={sum(len(p.vertices) - 2 for p in mesh.polygons)} height={zmax:.3f}")
    print(f"glb={OUT_GLB} bytes={OUT_GLB.stat().st_size}")
    print(f"preview={OUT_PREVIEW if helpers else 'skipped'}")


main()
