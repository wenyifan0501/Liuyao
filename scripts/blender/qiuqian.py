"""Temple lot tube (签筒) and lot slip (签条) for the Liuyao study, built procedurally in Blender.

Cinnabar-lacquered tube with real wall thickness, rounded rim, dark lacquered foot,
three brass bands, and a gilt-framed plaque on the front whose characters 靈籤 are
real KaiTi glyph geometry wrapped onto the curved surface (never a painted guess).
The lot slip is a separate object so the page can instance it and print the drawn
lot's number at runtime.

  python scripts/blender/bmcp.py run scripts/blender/qiuqian.py
Outputs: apps/web/public/models/qiuqian_tube.glb (nodes qiuqian_tube, qiuqian_lot),
         assets-src/blender/qiuqian.blend, logs/blender/qiuqian-preview.png, -label.png
Then:    node logs/model-work/pack-blender.mjs apps/web/public/models/qiuqian_tube.glb 1024

Conventions after glTF export (three.js): Y up, tube base on y = 0, plaque faces +Z.
Lot: origin at its centre, length along Y (1.12), front face +Z. Lot UV layout (the
page relies on it): front face spans u 0.06–1, v 0–1 bottom→top; back and edges sit
in the plain strip u 0.01–0.04; the top 7.5 % of v is the red-lacquered tip.
"""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np

REPO = Path(globals().get("__file__", "")).resolve().parents[2]
FONT = Path("C:/Windows/Fonts/simkai.ttf")
OUT_GLB = REPO / "apps/web/public/models/qiuqian_tube.glb"
OUT_BLEND = REPO / "assets-src/blender/qiuqian.blend"
OUT_PREVIEW = REPO / "logs/blender/qiuqian-preview.png"

SEGS = 128
Z_FOOT, Z_TOP = 0.062, 1.17          # lacquered body spans these heights
R_LOW, R_HIGH = 0.340, 0.380         # outer radius, slightly flared toward the mouth
WALL = 0.028
FRONT = -math.pi / 2                 # Blender -Y → glTF +Z (the camera side)
BANDS = (0.10, 0.60, 1.13)
PLAQUE = dict(u=0.105, w0=0.67, w1=1.07, frame=0.017)
LOT_W, LOT_T, LOT_L = 0.05, 0.016, 1.12


def r_outer(z):
    t = min(max((z - Z_FOOT) / (Z_TOP - Z_FOOT), 0.0), 1.0)
    return R_LOW + (R_HIGH - R_LOW) * t


def wrap(u, w, d):
    """Unwrapped plaque space → tube surface. u: arc length to the viewer's right, w: height, d: outward offset."""
    r = r_outer(w)
    phi = FRONT + u / r
    return ((r + d) * math.cos(phi), (r + d) * math.sin(phi), w)


# ───────────────────────── textures ─────────────────────────
def noise2(h, w, cy, cx, seed):
    """Tileable value noise of shape (h, w) with cy×cx lattice cells."""
    g = np.random.default_rng(seed).random((cy, cx))
    y, x = np.arange(h) / h * cy, np.arange(w) / w * cx
    y0, x0 = np.floor(y).astype(int), np.floor(x).astype(int)
    fy, fx = (y - y0)[:, None], (x - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    y1, x1 = (y0 + 1) % cy, (x0 + 1) % cx
    a = g[y0][:, x0] * (1 - fx) + g[y0][:, x1] * fx
    b = g[y1][:, x0] * (1 - fx) + g[y1][:, x1] * fx
    return a * (1 - fy) + b * fy


def srgb(*c):
    return np.array(c, dtype=np.float64) / 255.0


def to_normal(height, strength):
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * .5 + .5, ny / l * .5 + .5, nz / l * .5 + .5], -1)


def lacquer_maps(h=1024, w=2048):
    """Rows = height (row 0 at the foot), columns = around the tube (u 0.5 is the front)."""
    V = (np.arange(h) + .5)[:, None] / h
    U = (np.arange(w) + .5)[None, :] / w
    large = noise2(h, w, 4, 8, 1)
    streak = noise2(h, w, 6, 420, 2)              # vertical brush strokes
    fine = noise2(h, w, 160, 320, 3)
    blotch = noise2(h, w, 7, 14, 4)
    color = srgb(128, 24, 15)[None, None] * (0.84 + 0.26 * large[..., None]) * (0.94 + 0.1 * streak[..., None])
    color *= (1 - 0.16 * np.clip(blotch - .5, 0, 1)[..., None] * 2.5)
    color = color * (1 - 0.22 * (1 - V)[..., None] ** 6)          # foot darkened by handling
    # Wear: the rim, a ring above each band, and where hands grip the sides.
    side = np.minimum(np.abs(U - .25), np.abs(U - .75))
    grip = np.exp(-(side / .06) ** 2) * np.exp(-((V - .36) / .1) ** 2)
    rim = np.exp(-((1 - V) / .025) ** 2)
    bands = sum(np.exp(-((V - (b - Z_FOOT) / (Z_TOP - Z_FOOT) - .03) / .012) ** 2) for b in BANDS)
    wear = np.clip((rim * .9 + bands * .45 + grip * .7) * (.45 + .9 * fine) - .42, 0, 1) * 1.8
    wear = np.clip(wear, 0, 1)
    color = color * (1 - wear[..., None]) + srgb(52, 22, 14) * wear[..., None]
    rough = np.clip(.28 + .1 * fine + .08 * blotch + .35 * wear, .1, 1)
    orm = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)
    normal = to_normal(.03 * streak + .015 * fine - .25 * wear, 3.0)
    return np.clip(color, 0, 1), orm, normal


def lot_maps(h=1024, w=128):
    V = (np.arange(h) + .5)[:, None] / h
    fibres = noise2(h, w, 5, 48, 11)
    blush = noise2(h, w, 6, 2, 12)
    color = srgb(214, 186, 128)[None, None] * (0.9 + 0.12 * fibres[..., None]) * (0.95 + 0.08 * blush[..., None])
    tip = np.clip((V - .925) / .006, 0, 1) * np.ones((1, w))
    color = color * (1 - tip[..., None]) + srgb(150, 30, 20) * tip[..., None]
    rough = np.clip(.62 + .1 * fibres - .3 * tip, 0, 1)
    orm = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)
    return np.clip(color, 0, 1), orm


def image(name, rgb, colorspace):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.concatenate([rgb, np.ones((h, w, 1))], -1).astype(np.float32).ravel())
    img.pack()
    return img


def material(name, *, color=None, base=(0.8, 0.8, 0.8), orm=None, normal=None, metallic=0.0, roughness=0.5, coat=0.0):
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
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if color is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = color
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if orm is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = orm
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if normal is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.14
    for i, node in enumerate(nt.nodes):
        node.location = (-320 * (i % 3), -280 * (i // 3))
    return mat


# ───────────────────────── geometry ─────────────────────────
def lathe(bm, uv, profile, mats, segs=SEGS):
    """Revolve [(r, z), ...]; zero radius makes a pole. mats[k] is the material of segment k → k+1."""
    rings = []
    for r, z in profile:
        if r < 1e-7:
            rings.append(bm.verts.new((0, 0, z)))
        else:
            rings.append([bm.verts.new((r * math.cos(math.pi / 2 + 2 * math.pi * j / segs),
                                        r * math.sin(math.pi / 2 + 2 * math.pi * j / segs), z)) for j in range(segs)])
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        va, vb = profile[k][1] / 1.2, profile[k + 1][1] / 1.2
        for j in range(segs):
            j2 = (j + 1) % segs
            ua, ub = j / segs, (j + 1) / segs
            if isinstance(a, list) and isinstance(b, list):
                quad = [(a[j], (ua, va)), (a[j2], (ub, va)), (b[j2], (ub, vb)), (b[j], (ua, vb))]
            elif isinstance(b, list):
                quad = [(a, ((ua + ub) / 2, va)), (b[j2], (ub, vb)), (b[j], (ua, vb))]
            else:
                quad = [(a[j], (ua, va)), (a[j2], (ub, va)), (b, ((ua + ub) / 2, vb))]
            face = bm.faces.new([q[0] for q in quad])
            face.material_index = mats[k]
            for loop, (_, c) in zip(face.loops, quad):
                loop[uv].uv = c


def wrapped_slab(bm, uv, u0, u1, w0, w1, d0, d1, mat, nu=24, nw=4):
    """A box in unwrapped plaque space, front and back subdivided so it follows the tube."""
    grid = {}
    for side, d in (("f", d1), ("b", d0)):
        for i in range(nu + 1):
            for k in range(nw + 1):
                u = u0 + (u1 - u0) * i / nu
                w = w0 + (w1 - w0) * k / nw
                grid[side, i, k] = bm.verts.new(wrap(u, w, d))
    faces = []
    for i in range(nu):
        for k in range(nw):
            faces.append(bm.faces.new((grid["f", i, k], grid["f", i + 1, k], grid["f", i + 1, k + 1], grid["f", i, k + 1])))
            faces.append(bm.faces.new((grid["b", i, k + 1], grid["b", i + 1, k + 1], grid["b", i + 1, k], grid["b", i, k])))
    rim = [(i, 0) for i in range(nu)] + [(nu, k) for k in range(nw)] + [(i, nw) for i in range(nu, 0, -1)] + [(0, k) for k in range(nw, 0, -1)]
    nxt = rim[1:] + rim[:1]
    for (i, k), (i2, k2) in zip(rim, nxt):
        faces.append(bm.faces.new((grid["b", i, k], grid["b", i2, k2], grid["f", i2, k2], grid["f", i, k])))
    for f in faces:
        f.material_index = mat
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x * 3 + .5, loop.vert.co.z * 3)


def glyph(bm, uv, char, font, size, wc, d_base, depth, mat, scene):
    """Real glyph outline from the font, extruded, then wrapped onto the tube surface."""
    cu = bpy.data.curves.new("LY_glyph", "FONT")
    cu.body = char
    cu.font = font
    cu.size = size
    cu.extrude = depth / 2
    cu.bevel_depth = depth * 0.18
    cu.bevel_resolution = 1
    cu.resolution_u = 4
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    obj = bpy.data.objects.new("LY_glyph", cu)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(cu)
    if not me.vertices:
        raise RuntimeError(f"font {FONT} has no outline for {char!r}")
    zmin = min(v.co.z for v in me.vertices)
    verts = [bm.verts.new(wrap(v.co.x, wc + v.co.y, d_base + (v.co.z - zmin))) for v in me.vertices]
    for p in me.polygons:
        try:
            f = bm.faces.new([verts[i] for i in p.vertices])
        except ValueError:
            continue
        f.material_index = mat
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x * 4 + .5, loop.vert.co.z * 4)
    n = len(me.vertices)
    bpy.data.meshes.remove(me)
    return n


def build_tube(scene, mats):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    LAC, FOOT, INSIDE, BRASS, PANEL, GOLD = range(6)
    # One closed revolve: underside → foot → lacquered wall → rounded lip → inner wall → floor.
    outer = [(r_outer(z), z) for z in np.linspace(Z_FOOT + .008, Z_TOP, 28)]
    profile = ([(0, 0), (.3, 0), (.352, .002), (.362, .012), (.364, .045), (.356, .056), (.343, Z_FOOT)] + outer +
               [(R_HIGH + .002, 1.18), (R_HIGH - .004, 1.19), (R_HIGH - WALL / 2, 1.194), (R_HIGH - WALL + .004, 1.19),
                (R_HIGH - WALL, 1.178)] +
               [(r_outer(z) - WALL, z) for z in np.linspace(1.16, .1, 12)] + [(R_LOW - WALL - .012, .084), (0, .084)])
    seg_mats = []
    for k in range(len(profile) - 1):
        z0, z1 = profile[k][1], profile[k + 1][1]
        if k < 7:
            seg_mats.append(FOOT)
        elif z1 >= z0 or z0 >= 1.17:
            seg_mats.append(LAC)
        else:
            seg_mats.append(INSIDE)
    lathe(bm, uv, profile, seg_mats)
    # Brass bands with a raised bead in the middle.
    for zc in BANDS:
        r = r_outer(zc)
        band = [(r - .001, zc - .03), (r + .006, zc - .027), (r + .01, zc - .018), (r + .01, zc - .006), (r + .014, zc - .003),
                (r + .014, zc + .003), (r + .01, zc + .006), (r + .01, zc + .018), (r + .006, zc + .027), (r - .001, zc + .03)]
        lathe(bm, uv, band, [BRASS] * (len(band) - 1))
    # Plaque: black-lacquer panel, gilt frame, gilt glyphs.
    u, w0, w1, fw = PLAQUE["u"], PLAQUE["w0"], PLAQUE["w1"], PLAQUE["frame"]
    wrapped_slab(bm, uv, -u, u, w0, w1, -.002, .003, PANEL, nu=28, nw=6)
    for a, b, c, d in ((-u, u, w1 - fw, w1), (-u, u, w0, w0 + fw), (-u, -u + fw, w0 + fw, w1 - fw), (u - fw, u, w0 + fw, w1 - fw)):
        wrapped_slab(bm, uv, a, b, c, d, .002, .008, GOLD, nu=max(2, int((b - a) / .008)), nw=max(2, int((d - c) / .03)))
    font = bpy.data.fonts.load(str(FONT), check_existing=True)
    inner_h = (w1 - w0) - 2 * fw
    verts = 0
    for i, ch in enumerate(("靈", "籤")):
        verts += glyph(bm, uv, ch, font, inner_h * .42, w1 - fw - inner_h * (.27 + .46 * i), .003, .0045, GOLD, scene)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("qiuqian_tube")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(40))
    for m in mats:
        mesh.materials.append(m)
    obj = bpy.data.objects.new("qiuqian_tube", mesh)
    scene.collection.objects.link(obj)
    print(f"glyph verts={verts}")
    return obj


def build_lot(scene, mat):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    half, top = LOT_W / 2, LOT_L / 2
    outline = [(-half, -top), (half, -top), (half, top - half)]
    outline += [(half * math.cos(a), top - half + half * math.sin(a)) for a in np.linspace(0, math.pi, 14)[1:-1]]
    outline += [(-half, top - half)]
    front = bm.faces.new([bm.verts.new((x, -LOT_T / 2, z)) for x, z in outline])
    ext = bmesh.ops.extrude_face_region(bm, geom=[front])
    bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, LOT_T, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=.0022, segments=2, profile=.5, affect="EDGES", clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    for f in bm.faces:
        for loop in f.loops:
            x, z = loop.vert.co.x, loop.vert.co.z
            v = (z + top) / LOT_L
            if f.normal.y < -.7:
                loop[uv].uv = (.06 + .94 * (x + half) / LOT_W, v)
            else:
                loop[uv].uv = (.01 + .03 * (x + half) / LOT_W, v)
    mesh = bpy.data.meshes.new("qiuqian_lot")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(50))
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("qiuqian_lot", mesh)
    scene.collection.objects.link(obj)
    return obj


def preview(scene, tube, lot):
    helpers = []
    rng = np.random.default_rng(5)
    for i in range(30):
        a, r = i * 2.39996, .05 + math.sqrt(i / 30) * .24
        o = bpy.data.objects.new(f"LY_lot_{i}", lot.data)
        o.location = (r * math.cos(a), r * math.sin(a), .9 + (i % 4) * .05)
        o.rotation_euler = (.08 * math.sin(a), -.08 * math.cos(a), rng.random() * 3)
        scene.collection.objects.link(o)
        helpers.append(o)
    drawn = bpy.data.objects.new("LY_lot_drawn", lot.data)
    drawn.location, drawn.rotation_euler, drawn.scale = (.75, -.75, .012), (-math.pi / 2, 0, .55), (1.35, 1.35, 1.35)
    scene.collection.objects.link(drawn)
    helpers.append(drawn)
    cam_data = bpy.data.cameras.new("LY_qq_cam")
    cam_data.lens = 58
    cam = bpy.data.objects.new("LY_qq_cam", cam_data)
    cam.location = (1.1, -3.6, 1.7)
    target = bpy.data.objects.new("LY_qq_target", None)
    target.location = (.1, 0, .72)
    cam.constraints.new("TRACK_TO").target = target
    key = bpy.data.objects.new("LY_qq_key", bpy.data.lights.new("LY_qq_key", "AREA"))
    key.data.energy, key.data.size, key.data.color = 260, 2.2, (1, .86, .7)
    key.location, key.rotation_euler = (-2, -2.2, 2.6), (.75, -.55, 0)
    fill = bpy.data.objects.new("LY_qq_fill", bpy.data.lights.new("LY_qq_fill", "AREA"))
    fill.data.energy, fill.data.size = 90, 3
    fill.location, fill.rotation_euler = (2.6, -1.5, 1.6), (1.1, .7, 0)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    floor = bpy.data.meshes.new("LY_qq_floor")
    bm.to_mesh(floor)
    bm.free()
    floor.materials.append(material("LY_qq_floor", base=(.32, .2, .13), roughness=.6))
    floor_obj = bpy.data.objects.new("LY_qq_floor", floor)
    for o in (cam, target, key, fill, floor_obj):
        scene.collection.objects.link(o)
    helpers += [cam, target, key, fill, floor_obj]
    world = bpy.data.worlds.new("LY_qq_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value, bg.inputs["Strength"].default_value = (.2, .16, .12, 1), .45
    scene.world, scene.camera = world, cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1150
    scene.view_settings.view_transform = "AgX"
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(OUT_PREVIEW)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    # Close-up of the plaque to check the glyphs.
    cam.location, target.location, cam_data.lens = (.0, -1.6, .87), (0, 0, .87), 85
    scene.render.resolution_x, scene.render.resolution_y = 700, 900
    scene.render.filepath = str(OUT_PREVIEW.with_name("qiuqian-label.png"))
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return helpers


def main():
    old = bpy.data.scenes.get("LY_Qiuqian")
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new("LY_Qiuqian")
    bpy.context.window.scene = scene
    lc, lo, ln = lacquer_maps()
    lacquer = material("qiuqian_lacquer", color=image("qiuqian_lacquer_color", lc, "sRGB"),
                       orm=image("qiuqian_lacquer_orm", lo, "Non-Color"), normal=image("qiuqian_lacquer_normal", ln, "Non-Color"), coat=.55)
    foot = material("qiuqian_foot", base=(.07, .028, .018), roughness=.42, coat=.4)
    inside = material("qiuqian_inside", base=(.045, .02, .013), roughness=.85)
    brass = material("qiuqian_brass", base=(.74, .53, .27), metallic=1, roughness=.3)
    panel = material("qiuqian_panel", base=(.025, .018, .014), roughness=.3, coat=.6)
    gold = material("qiuqian_gold", base=(.86, .64, .3), metallic=1, roughness=.26)
    pc, po = lot_maps()
    lot_mat = material("qiuqian_lot", color=image("qiuqian_lot_color", pc, "sRGB"), orm=image("qiuqian_lot_orm", po, "Non-Color"))
    tube = build_tube(scene, [lacquer, foot, inside, brass, panel, gold])
    lot = build_lot(scene, lot_mat)
    helpers = preview(scene, tube, lot)
    # Selection lives per view layer: objects still selected in other LY_* scenes would leak into
    # the GLB, so clear every scene and export the active scene only.
    for sc in bpy.data.scenes:
        for layer in sc.view_layers:
            for obj in sc.objects:
                obj.select_set(obj in (tube, lot) and sc == scene, view_layer=layer)
    bpy.context.view_layer.objects.active = tube
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB), export_format="GLB", use_selection=True, use_active_scene=True, export_image_format="WEBP",
                              export_image_quality=90, export_yup=True, export_materials="EXPORT", export_cameras=False,
                              export_lights=False, export_animations=False)
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(OUT_BLEND), {tube, lot, *helpers}, fake_user=True, compress=True)
    tris = sum(len(p.vertices) - 2 for p in tube.data.polygons)
    print(f"tube tris={tris} lot tris={sum(len(p.vertices) - 2 for p in lot.data.polygons)} glb={OUT_GLB.stat().st_size}")


main()
