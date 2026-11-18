"""Ming-style rosewood scholar's table (明式书案) for the Liuyao study, built procedurally in Blender.

Top: a framed panel (心板 inside four mitred frame members 边抹, grain running along each
member) with a continuous brass key-fret (回纹) inlay on the frame and dark joint lines.
Edge: an ice-plate moulding (冰盘沿) swept round the top, a recessed waist (束腰), an apron
(牙板) with beaded lines (阳线), and four legs ending in inward hoof feet (马蹄足).
The table runs far back (beyond the camera's view) so only the front and side edges read.

  python scripts/blender/bmcp.py run scripts/blender/desk.py
Outputs: apps/web/public/models/desk.glb, assets-src/blender/desk.blend, logs/blender/desk-preview.png
Then:    node logs/model-work/pack-blender.mjs apps/web/public/models/desk.glb 2048

Conventions after glTF export (three.js): Y up, top surface at y = 0, front edge at z = +FRONT,
x centred. Material names: desk_wood, desk_brass, desk_joint.
"""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

REPO = Path(globals().get("__file__", "")).resolve().parents[2]
OUT_GLB = REPO / "apps/web/public/models/desk.glb"
OUT_BLEND = REPO / "assets-src/blender/desk.blend"
OUT_PREVIEW = REPO / "logs/blender/desk-preview.png"

HALF_W = 8.5            # x from -8.5 to 8.5
FRONT, BACK = 3.9, 14.0  # glTF z: front edge +3.9; Blender y = -z, so front is y = -3.9
ARRIS = 0.03            # the top pieces stop this far inside the outline; the moulding takes over
FRAME = 0.62            # frame member width
BAND = (0.2, 0.42)      # key-fret band, measured from the inner edge of the moulding
LINE = 0.016            # inlay line width
FLOOR = -3.0            # floor height (legs reach it)
UV_LEN = 15.8           # metres of table covered by one texture repeat along the grain
UV_ACROSS = 8.0         # metres covered across the grain (texture repeats; it tiles)


# ───────────────────────── textures ─────────────────────────
def noise2(h, w, cy, cx, seed):
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


def rosewood(h=1024, w=2048):
    """Tileable polished rosewood. Columns = along the grain, rows = across it.

    Real flat-sawn grain: rings of uneven spacing that wander slowly, thin dark latewood lines,
    long ribbon figure and almost no surface relief under a polished finish."""
    V = (np.arange(h) / h)[:, None]
    # Large, slow wander (several rings of drift along the length) keeps lines from reading as ruled.
    warp = noise2(h, w, 2, 3, 1) * 7 + noise2(h, w, 5, 7, 2) * 2 + noise2(h, w, 13, 4, 3) * .4
    t = V * 72 + warp
    t = t + .4 * np.sin(2 * np.pi * t / 8) + .25 * np.sin(2 * np.pi * t / 2.25)   # uneven spacing; periods divide 72 so it still tiles
    rings = t % 1.0
    late = np.exp(-((rings - .5) ** 2) / .004) * (.35 + .65 * noise2(h, w, 40, 6, 8))
    soft = np.exp(-((rings - .5) ** 2) / .04)
    figure = noise2(h, w, 14, 60, 4)                                  # ribbon figure along the grain
    large = noise2(h, w, 3, 5, 6)
    pores = noise2(h, w, 260, 1400, 7)
    band = noise2(h, w, 9, 2, 9)                                      # broad colour bands across boards
    base = srgb(96, 42, 24)[None, None] * (.84 + .22 * large[..., None]) * (.9 + .16 * band[..., None])
    color = base * (1 - .22 * late[..., None] - .08 * soft[..., None]) * (.93 + .12 * figure[..., None])
    color += srgb(160, 88, 44) * .05 * np.clip(figure - .55, 0, 1)[..., None] * 2
    color *= (.97 + .04 * pores[..., None])
    height = -late * .08 + pores * .03
    gy, gx = np.gradient(height)
    nx, ny = -gx * 2, -gy * 2
    l = np.sqrt(nx * nx + ny * ny + 1)
    normal = np.stack([nx / l * .5 + .5, ny / l * .5 + .5, 1 / l * .5 + .5], -1)
    return np.clip(color, 0, 1), normal[::2, ::2]


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


def material(name, *, color=None, base=(0.8, 0.8, 0.8), normal=None, metallic=0.0, roughness=0.5, coat=0.0):
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
    if normal is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = .6
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = .2
    for i, node in enumerate(nt.nodes):
        node.location = (-320 * (i % 3), -280 * (i // 3))
    return mat


# ───────────────────────── geometry ─────────────────────────
X0, X1 = -HALF_W, HALF_W
Y0, Y1 = -FRONT, BACK          # Blender y; front edge at Y0
WOOD, BRASS, JOINT = 0, 1, 2


def quad(bm, uv, pts, uvs, mat):
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.material_index = mat
    for loop, c in zip(f.loops, uvs):
        loop[uv].uv = c
    return f


def grain_uv(p, along_x, offset):
    """Grain runs along the member; v repeats every UV_ACROSS metres."""
    if along_x:
        return (p[0] / UV_LEN + .5, p[1] / UV_ACROSS + offset)
    return (p[1] / UV_LEN + .5, p[0] / UV_ACROSS + offset)


def build_top(bm, uv):
    ax0, ax1, ay0, ay1 = X0 + ARRIS, X1 - ARRIS, Y0 + ARRIS, Y1 - ARRIS
    ix0, ix1, iy0, iy1 = ax0 + FRAME, ax1 - FRAME, ay0 + FRAME, ay1 - FRAME
    # Centre panel: one board's grain across the width.
    pts = [(ix0, iy0, 0), (ix1, iy0, 0), (ix1, iy1, 0), (ix0, iy1, 0)]
    quad(bm, uv, pts, [grain_uv(p, True, .11) for p in pts], WOOD)
    # Mitred frame members: front / back run along x, the sides along y.
    members = [
        ([(ax0, ay0, 0), (ax1, ay0, 0), (ix1, iy0, 0), (ix0, iy0, 0)], True, .43),
        ([(ix0, iy1, 0), (ix1, iy1, 0), (ax1, ay1, 0), (ax0, ay1, 0)], True, .61),
        ([(ax0, ay0, 0), (ix0, iy0, 0), (ix0, iy1, 0), (ax0, ay1, 0)], False, .27),
        ([(ix1, iy0, 0), (ax1, ay0, 0), (ax1, ay1, 0), (ix1, iy1, 0)], False, .79),
    ]
    for pts, along_x, off in members:
        quad(bm, uv, pts, [grain_uv(p, along_x, off) for p in pts], WOOD)
    return (ax0, ax1, ay0, ay1), (ix0, ix1, iy0, iy1)


def strip(bm, uv, a, b, width, z, mat, extend=True):
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    d = (b - a)
    if d.length < 1e-6:
        return
    d.normalize()
    n = Vector((-d.y, d.x, 0)) * width / 2
    e = d * (width / 2 if extend else 0)
    pts = [(a - e - n), (b + e - n), (b + e + n), (a - e + n)]
    quad(bm, uv, [(p.x, p.y, z) for p in pts], [(.5, .5)] * 4, mat)


def polyline(bm, uv, pts, width, z, mat):
    for a, b in zip(pts, pts[1:]):
        strip(bm, uv, a, b, width, z, mat)


def build_inlay(bm, uv, outer):
    """Continuous border lines plus 回 spirals on all four frame members, with a square at each corner."""
    ax0, ax1, ay0, ay1 = outer
    o, i = BAND
    s = i - o
    z = 0.0012
    # Two border lines around the whole frame.
    for off in (o, i):
        rect = [(ax0 + off, ay0 + off), (ax1 - off, ay0 + off), (ax1 - off, ay1 - off), (ax0 + off, ay1 - off), (ax0 + off, ay0 + off)]
        polyline(bm, uv, rect, LINE, z, BRASS)
    # One 回 unit in a cell: x along the side (0..1), y inward from the outer line (0..1).
    unit = [(.14, .2), (.86, .2), (.86, .8), (.14, .8), (.14, .38), (.66, .38), (.66, .62), (.34, .62)]
    sides = [  # origin on the outer border line, direction along the side, inward normal
        ((ax0 + o, ay0 + o), (1, 0), (0, 1), ax1 - ax0 - 2 * o),
        ((ax1 - o, ay1 - o), (-1, 0), (0, -1), ax1 - ax0 - 2 * o),
        ((ax0 + o, ay1 - o), (0, -1), (1, 0), ay1 - ay0 - 2 * o),
        ((ax1 - o, ay0 + o), (0, 1), (-1, 0), ay1 - ay0 - 2 * o),
    ]
    for (sx, sy), (dx, dy), (nx, ny), length in sides:
        run = length - 2 * s                      # corners take one square cell each
        count = max(1, int(run / (s * 1.12)))
        cell = run / count
        for k in range(count):
            flip = k % 2 == 1
            start = s + k * cell
            pts = []
            for ux, uy in unit:
                ux = 1 - ux if flip else ux
                along, inward = start + ux * cell, uy * s
                pts.append((sx + dx * along + nx * inward, sy + dy * along + ny * inward))
            polyline(bm, uv, pts, LINE, z, BRASS)
        # Corner square at the start of each side (each side owns one corner).
        corner = [(.2, .2), (.8, .2), (.8, .8), (.2, .8), (.2, .2)]
        polyline(bm, uv, [(sx + dx * cx * s + nx * cy * s, sy + dy * cx * s + ny * cy * s) for cx, cy in corner], LINE, z, BRASS)
        inner = [(.4, .4), (.6, .4), (.6, .6), (.4, .6), (.4, .4)]
        polyline(bm, uv, [(sx + dx * cx * s + nx * cy * s, sy + dy * cx * s + ny * cy * s) for cx, cy in inner], LINE, z, BRASS)


def build_joints(bm, uv, outer, inner):
    ax0, ax1, ay0, ay1 = outer
    ix0, ix1, iy0, iy1 = inner
    z, w = 0.0008, 0.006
    polyline(bm, uv, [(ix0, iy0), (ix1, iy0), (ix1, iy1), (ix0, iy1), (ix0, iy0)], w, z, JOINT)
    for a, b in (((ax0, ay0), (ix0, iy0)), ((ax1, ay0), (ix1, iy0)), ((ax1, ay1), (ix1, iy1)), ((ax0, ay1), (ix0, iy1))):
        strip(bm, uv, a, b, w, z, JOINT, extend=False)


# Ice-plate edge, waist and beaded apron, as (outward offset from the outline, z).
PROFILE = [(-ARRIS, 0), (-.012, -.003), (-.002, -.014), (0, -.03), (0, -.075), (-.008, -.105), (-.024, -.14), (-.048, -.17),
           (-.07, -.195), (-.08, -.22), (-.08, -.25), (-.15, -.25), (-.15, -.31), (-.095, -.31), (-.095, -.335),
           (-.082, -.345), (-.082, -.36), (-.095, -.37), (-.095, -.6), (-.082, -.61), (-.082, -.625), (-.095, -.635),
           (-.095, -.66), (-.42, -.66)]


def build_moulding(bm, uv):
    corners = [(X0, Y0), (X1, Y0), (X1, Y1), (X0, Y1)]
    normals = [(0, -1), (1, 0), (0, 1), (-1, 0)]   # outward normal of side k (from corner k to k+1)
    acc = np.cumsum([0] + [math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(PROFILE, PROFILE[1:])])
    for k in range(4):
        (cx0, cy0), (cx1, cy1) = corners[k], corners[(k + 1) % 4]
        n = Vector((*normals[k], 0))
        n_prev, n_next = Vector((*normals[k - 1], 0)), Vector((*normals[(k + 1) % 4], 0))
        along_x = k % 2 == 0
        for j in range(len(PROFILE) - 1):
            ring = []
            for d, z in (PROFILE[j], PROFILE[j + 1]):
                # Mitred corners: offset along both adjoining normals.
                p0 = Vector((cx0, cy0, z)) + (n + n_prev) * d
                p1 = Vector((cx1, cy1, z)) + (n + n_next) * d
                ring.append((p0, p1))
            (a0, a1), (b0, b1) = ring
            pts = [a0, a1, b1, b0]
            uvs = []
            for p, v in ((a0, acc[j]), (a1, acc[j]), (b1, acc[j + 1]), (b0, acc[j + 1])):
                t = (p.x if along_x else p.y) / UV_LEN + .5
                uvs.append((t, v / UV_ACROSS + .37 * k))
            quad(bm, uv, [tuple(p) for p in pts], uvs, WOOD)


def build_legs(bm, uv):
    size, inset = .3, .1
    z_top, z_floor = -.66, FLOOR
    for sx, sy in ((X0 + inset, Y0 + inset), (X1 - inset - size, Y0 + inset), (X0 + inset, Y1 - inset - size), (X1 - inset - size, Y1 - inset - size)):
        # Square leg, slightly tapered, ending in a hoof foot that turns inward.
        inward = Vector((1 if sx < 0 else -1, 1 if sy < 0 else -1, 0)) * .06
        levels = [(z_top, 0, 0), (z_floor + .28, .02, 0), (z_floor + .12, -.01, .5), (z_floor + .03, .0, 1), (z_floor, .01, 1)]
        rings = []
        for z, shrink, hoof in levels:
            o = inward * hoof
            x0, y0, x1, y1 = sx + shrink + o.x, sy + shrink + o.y, sx + size - shrink + o.x, sy + size - shrink + o.y
            rings.append([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)])
        for r in range(len(rings) - 1):
            for q in range(4):
                a, b = rings[r], rings[r + 1]
                pts = [a[q], a[(q + 1) % 4], b[(q + 1) % 4], b[q]]
                quad(bm, uv, pts, [((p[0] + p[1]) / 3, p[2] / UV_ACROSS) for p in pts], WOOD)
        quad(bm, uv, rings[-1][::-1], [(0, 0), (.04, 0), (.04, .04), (0, .04)], WOOD)


def preview(scene, desk):
    cam_data = bpy.data.cameras.new("LY_desk_cam")
    cam_data.lens = 32
    cam = bpy.data.objects.new("LY_desk_cam", cam_data)
    cam.location = (0, -12.5, 7.6)            # matches the page's overview camera (glTF z → -y)
    target = bpy.data.objects.new("LY_desk_target", None)
    target.location = (0, -.2, 0)
    cam.constraints.new("TRACK_TO").target = target
    sun = bpy.data.objects.new("LY_desk_sun", bpy.data.lights.new("LY_desk_sun", "SUN"))
    sun.data.energy, sun.data.color = 2.4, (1, .9, .78)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-25))
    lamp = bpy.data.objects.new("LY_desk_lamp", bpy.data.lights.new("LY_desk_lamp", "POINT"))
    lamp.data.energy, lamp.data.color = 900, (1, .75, .45)
    lamp.location = (-1.5, 3.3, 1.5)
    world = bpy.data.worlds.new("LY_desk_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value, bg.inputs["Strength"].default_value = (.18, .14, .1, 1), .5
    for o in (cam, target, sun, lamp):
        scene.collection.objects.link(o)
    scene.world, scene.camera = world, cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(OUT_PREVIEW)
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return [cam, target, sun, lamp]


def main():
    old = bpy.data.scenes.get("LY_Desk")
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new("LY_Desk")
    bpy.context.window.scene = scene
    color, normal = rosewood()
    wood = material("desk_wood", color=image("desk_wood_color", color, "sRGB"), normal=image("desk_wood_normal", normal, "Non-Color"),
                    roughness=.5, coat=.22)
    brass = material("desk_brass", base=(.72, .5, .25), metallic=1, roughness=.36)
    joint = material("desk_joint", base=(.03, .014, .008), roughness=.8)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    outer, inner = build_top(bm, uv)
    build_inlay(bm, uv, outer)
    build_joints(bm, uv, outer, inner)
    build_moulding(bm, uv)
    build_legs(bm, uv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("desk")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(35))
    for m in (wood, brass, joint):
        mesh.materials.append(m)
    desk = bpy.data.objects.new("desk", mesh)
    scene.collection.objects.link(desk)
    helpers = preview(scene, desk)
    for sc in bpy.data.scenes:
        for layer in sc.view_layers:
            for obj in sc.objects:
                obj.select_set(obj == desk, view_layer=layer)
    bpy.context.view_layer.objects.active = desk
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB), export_format="GLB", use_selection=True, use_active_scene=True,
                              export_image_format="WEBP", export_image_quality=88, export_yup=True, export_materials="EXPORT",
                              export_cameras=False, export_lights=False, export_animations=False)
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(OUT_BLEND), {desk, *helpers}, fake_user=True, compress=True)
    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    print(f"desk tris={tris} glb={OUT_GLB.stat().st_size}")


main()
