"""Study desk lamp (书斋台灯) for the Liuyao desk, built procedurally in Blender.

Rosewood stepped base, turned column, brass socket and spokes, a hexagonal
Xuan-paper shade in a dark wooden frame with turned corner drops and two red
silk tassels. Runs in its own scene; never touches or saves the open .blend.

  python scripts/blender/bmcp.py run scripts/blender/lamp.py
Outputs: apps/web/public/models/desk_lamp.glb, assets-src/blender/desk_lamp.blend,
         logs/blender/desk_lamp-preview.png
Then:    node logs/model-work/pack-blender.mjs apps/web/public/models/desk_lamp.glb 1024

Conventions after glTF export (three.js): Y up, base on y = 0, origin at the
footprint centre, a flat shade panel faces +Z (the camera). Material names
lamp_paper / lamp_bulb are used by the page to switch off their shadows.
"""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO = Path(globals().get("__file__", "")).resolve().parents[2]
FIBRE = REPO / "logs/model-work/Photorealistic_archival_qualit_2026-10-25T13-33-58.png"
OUT_GLB = REPO / "apps/web/public/models/desk_lamp.glb"
OUT_BLEND = REPO / "assets-src/blender/desk_lamp.blend"
OUT_PREVIEW = REPO / "logs/blender/desk_lamp-preview.png"

SHADE_Z0, SHADE_Z1 = 1.00, 1.95
R_BOTTOM, R_TOP = 0.58, 0.44
SIDES = 6
BULB_Z = 1.31


# ───────────────────────── textures ─────────────────────────
def noise2(n, cy, cx, seed):
    """Tileable value noise, n×n, with cy×cx lattice cells."""
    g = np.random.default_rng(seed).random((cy, cx))
    y, x = np.arange(n) / n * cy, np.arange(n) / n * cx
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


def rosewood_maps(n=1024):
    """Polished dark rosewood; grain runs along image Y (= the UV v axis)."""
    X = np.arange(n)[None, :] / n
    warp = noise2(n, 3, 2, 3) * 1.6 + noise2(n, 9, 5, 4) * 0.35
    rings = (X * 18 + warp) % 1.0
    grain = np.exp(-((rings - 0.5) ** 2) / 0.008)
    figure = noise2(n, 5, 60, 5)          # long streaks along the grain (few cells along Y)
    large = noise2(n, 4, 4, 6)
    pores = noise2(n, 320, 320, 7)
    base = srgb(104, 46, 28)[None, None] * (0.82 + 0.3 * large[..., None])
    color = base * (1 - 0.3 * grain[..., None]) * (0.92 + 0.14 * figure[..., None])
    color += srgb(120, 58, 32) * 0.10 * np.clip(figure - .55, 0, 1)[..., None] * 3
    color *= (0.97 + 0.03 * pores[..., None])
    rough = np.clip(0.34 + 0.12 * grain + 0.06 * pores - 0.05 * figure, 0.15, 1)
    orm = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)
    normal = to_normal(-grain * 0.25 + pores * 0.02, 3.0)
    return np.clip(color, 0, 1), orm, normal


def silk_maps(n=256):
    X = np.arange(n)[None, :] / n
    strands = 0.75 + 0.25 * np.sin(X * 2 * np.pi * 48 + noise2(n, 4, 8, 9) * 3)
    color = srgb(150, 22, 16)[None, None] * strands[..., None] * (0.9 + 0.15 * noise2(n, 8, 16, 10)[..., None])
    return np.clip(color, 0, 1) * np.ones((n, 1, 1))


def image(name, rgb, colorspace):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = colorspace
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], -1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def material(name, *, color=None, base=(0.8, 0.8, 0.8), orm=None, normal=None, metallic=0.0, roughness=0.5,
             coat=0.0, emission=None, emission_color=None, emission_strength=0.0, double=False):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double
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
        bsdf.inputs["Coat Roughness"].default_value = 0.18
    if emission is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = emission
        nt.links.new(t.outputs["Color"], bsdf.inputs["Emission Color"])
    elif emission_color is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission_color, 1)
    bsdf.inputs["Emission Strength"].default_value = emission_strength
    for i, node in enumerate(nt.nodes):
        node.location = (-320 * (i % 3), -280 * (i // 3))
    return mat


# ───────────────────────── geometry helpers ─────────────────────────
def lathe(bm, uv, profile, segs=64, center=(0.0, 0.0), v_scale=1.6):
    """Revolve [(radius, z), ...] around a vertical axis. Zero radius at either end becomes a pole."""
    cx, cy = center
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append(bm.verts.new((cx, cy, z)))
        else:
            rings.append([bm.verts.new((cx + r * math.cos(2 * math.pi * j / segs), cy + r * math.sin(2 * math.pi * j / segs), z))
                          for j in range(segs)])
    zs = [z for _, z in profile]
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        va, vb = zs[k] * v_scale, zs[k + 1] * v_scale
        for j in range(segs):
            j2 = (j + 1) % segs
            if isinstance(a, list) and isinstance(b, list):
                quad = [(a[j], (j / segs, va)), (a[j2], ((j + 1) / segs, va)), (b[j2], ((j + 1) / segs, vb)), (b[j], (j / segs, vb))]
            elif isinstance(b, list):
                quad = [(a, ((j + .5) / segs, va)), (b[j2], ((j + 1) / segs, vb)), (b[j], (j / segs, vb))]
            else:
                quad = [(a[j], (j / segs, va)), (a[j2], ((j + 1) / segs, va)), (b, ((j + .5) / segs, vb))]
            face = bm.faces.new([q[0] for q in quad])
            for loop, (_, coord) in zip(face.loops, quad):
                loop[uv].uv = coord
    for end in (rings[0], rings[-1]):
        if isinstance(end, list):
            face = bm.faces.new(end)
            for loop in face.loops:
                loop[uv].uv = (loop.vert.co.x * 2, loop.vert.co.y * 2)


def frame_box(bm, p0, p1, w, h, hint):
    """Rectangular beam from p0 to p1; w across `hint`×axis, h perpendicular to it."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    s = d.cross(Vector(hint))
    if s.length < 1e-6:
        s = d.cross(Vector((1, 0, 0)))
    s.normalize()
    t = s.cross(d).normalized()
    ends = [[bm.verts.new(p + s * sx * w / 2 + t * ty * h / 2) for sx, ty in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for p in (p0, p1)]
    a, b = ends
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(4):
        bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))


def rod(bm, uv, p0, p1, r, segs=12):
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    s = d.cross(Vector((0, 0, 1)))
    if s.length < 1e-6:
        s = d.cross(Vector((1, 0, 0)))
    s.normalize()
    t = s.cross(d)
    ends = [[bm.verts.new(p + (s * math.cos(2 * math.pi * j / segs) + t * math.sin(2 * math.pi * j / segs)) * r) for j in range(segs)] for p in (p0, p1)]
    for j in range(segs):
        j2 = (j + 1) % segs
        f = bm.faces.new((ends[0][j], ends[0][j2], ends[1][j2], ends[1][j]))
        for loop, c in zip(f.loops, ((j / segs, 0), ((j + 1) / segs, 0), ((j + 1) / segs, 1), (j / segs, 1))):
            loop[uv].uv = c
    bm.faces.new(ends[0][::-1])
    bm.faces.new(ends[1])


def box_uv(bm, uv, scale=1.4):
    """Box projection: each face takes the two axes perpendicular to its dominant normal."""
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co[a] * scale, co[b] * scale)


def beveled_box(bm, size, center, bevel):
    verts = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*size, 1)))["verts"]
    edges = list({e for v in verts for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=verts + edges, offset=bevel, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)


def finish(name, bm, mat, smooth_angle=None, scene=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    if smooth_angle is not None:
        mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


def corner(k, z):
    t = (z - SHADE_Z0) / (SHADE_Z1 - SHADE_Z0)
    r = R_BOTTOM + (R_TOP - R_BOTTOM) * t
    a = 2 * math.pi * k / SIDES
    return Vector((r * math.cos(a), r * math.sin(a), z))


# ───────────────────────── build ─────────────────────────
def build(scene):
    wood_c, wood_orm, wood_n = rosewood_maps()
    wood = material("lamp_wood", color=image("lamp_wood_color", wood_c, "sRGB"), orm=image("lamp_wood_orm", wood_orm, "Non-Color"),
                    normal=image("lamp_wood_normal", wood_n, "Non-Color"), coat=0.35)
    brass = material("lamp_brass", base=(0.74, 0.52, 0.26), metallic=1.0, roughness=0.32)
    fibre = bpy.data.images.load(str(FIBRE), check_existing=True)
    fibre.pack()
    paper = material("lamp_paper", color=fibre, roughness=0.9, emission=fibre, emission_strength=1.0, double=True)
    bulb = material("lamp_bulb", base=(1, 0.9, 0.75), emission_color=(1.0, 0.82, 0.55), emission_strength=8.0)
    silk = material("lamp_silk", color=image("lamp_silk_color", silk_maps(), "sRGB"), roughness=0.55)
    parts = []

    # Rosewood base (two beveled tiers) and turned column.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    beveled_box(bm, (0.76, 0.76, 0.075), (0, 0, 0.0375), 0.016)
    beveled_box(bm, (0.56, 0.56, 0.06), (0, 0, 0.105), 0.012)
    box_uv(bm, uv)
    lathe(bm, uv, [(0.0, 0.135), (0.09, 0.135), (0.095, 0.15), (0.088, 0.17), (0.06, 0.19), (0.05, 0.22), (0.072, 0.265),
                   (0.08, 0.30), (0.072, 0.335), (0.05, 0.37), (0.042, 0.42), (0.039, 0.62), (0.037, 0.86), (0.036, 0.92),
                   (0.05, 0.95), (0.062, 0.98), (0.05, 1.01), (0.04, 1.03), (0.0, 1.03)])
    parts.append(finish("lamp_body", bm, wood, 35, scene))

    # Brass: collar, socket cup, socket, three spokes to the shade ring.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    lathe(bm, uv, [(0.0, 0.128), (0.098, 0.128), (0.102, 0.134), (0.102, 0.142), (0.096, 0.148), (0.0, 0.148)])
    lathe(bm, uv, [(0.0, 1.025), (0.045, 1.025), (0.06, 1.04), (0.064, 1.06), (0.05, 1.075), (0.032, 1.08), (0.032, 1.2),
                   (0.036, 1.215), (0.03, 1.235), (0.0, 1.235)])
    for k in (0, 2, 4):
        end = corner(k, SHADE_Z0 + 0.02) * 0.96
        end.z = SHADE_Z0 + 0.02
        rod(bm, uv, (0, 0, 1.06), end, 0.0065)
    parts.append(finish("lamp_brass", bm, brass, None, scene))

    # Bulb (hidden by the shade; gives the page a warm hot spot).
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.058, matrix=Matrix.Translation((0, 0, BULB_Z)))
    parts.append(finish("lamp_bulb", bm, bulb, None, scene))

    # Shade frame: slanted corner posts, bottom/top rings, a thin mid rail, turned drops.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for k in range(SIDES):
        a = 2 * math.pi * k / SIDES
        tangent = (-math.sin(a), math.cos(a), 0)
        bottom, top = corner(k, SHADE_Z0 - 0.035), corner(k, SHADE_Z1 + 0.05)
        frame_box(bm, bottom, top, 0.032, 0.032, tangent)
        for z, w, h in ((SHADE_Z0 + 0.012, 0.046, 0.05), (SHADE_Z1 - 0.012, 0.04, 0.045), ((SHADE_Z0 + SHADE_Z1) / 2, 0.02, 0.022)):
            frame_box(bm, corner(k, z), corner(k + 1, z), w, h, (0, 0, 1))
    box_uv(bm, uv, 3.0)
    edges = list(bm.edges)
    bmesh.ops.bevel(bm, geom=list(bm.verts) + edges, offset=0.004, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    for k in range(SIDES):
        c = corner(k, SHADE_Z0)
        lathe(bm, uv, [(0.0, SHADE_Z0 - 0.03), (0.024, SHADE_Z0 - 0.04), (0.03, SHADE_Z0 - 0.06), (0.017, SHADE_Z0 - 0.085),
                       (0.025, SHADE_Z0 - 0.1), (0.012, SHADE_Z0 - 0.12), (0.0, SHADE_Z0 - 0.125)], segs=20, center=(c.x, c.y))
        c = corner(k, SHADE_Z1)
        lathe(bm, uv, [(0.0, SHADE_Z1 + 0.045), (0.022, SHADE_Z1 + 0.05), (0.026, SHADE_Z1 + 0.07), (0.012, SHADE_Z1 + 0.09),
                       (0.0, SHADE_Z1 + 0.095)], segs=20, center=(c.x, c.y))
    parts.append(finish("lamp_frame", bm, wood, 40, scene))

    # Paper panels, slightly inside the frame centre line.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for k in range(SIDES):
        quad = [corner(k, SHADE_Z0) * 0.985, corner(k + 1, SHADE_Z0) * 0.985, corner(k + 1, SHADE_Z1) * 0.985, corner(k, SHADE_Z1) * 0.985]
        for q, z in zip(quad, (SHADE_Z0, SHADE_Z0, SHADE_Z1, SHADE_Z1)):
            q.z = z
        verts = [bm.verts.new(q) for q in quad]
        f = bm.faces.new(verts)
        for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = c
    parts.append(finish("lamp_paper", bm, paper, 10, scene))

    # Two silk tassels under the front corners (a flat panel faces -Y, i.e. the camera).
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for k in (4, 5):
        c = corner(k, SHADE_Z0)
        top = SHADE_Z0 - 0.125
        rod(bm, uv, (c.x, c.y, top), (c.x, c.y, top - 0.06), 0.004, 8)
        lathe(bm, uv, [(0.0, top - 0.055), (0.016, top - 0.062), (0.021, top - 0.078), (0.014, top - 0.092), (0.018, top - 0.1),
                       (0.024, top - 0.13), (0.029, top - 0.2), (0.031, top - 0.25), (0.0, top - 0.252)], segs=24, center=(c.x, c.y), v_scale=1.0)
    parts.append(finish("lamp_silk", bm, silk, None, scene))
    return parts


def preview(scene):
    mat = bpy.data.materials['lamp_paper']
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    link = bsdf.inputs['Emission Color'].links[0]
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs[7].default_value = (1.0, 0.72, 0.42, 1)
    nt.links.new(link.from_socket, mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs['Emission Color'])
    preview.restore = (nt, mix, link.from_socket, bsdf)
    cam_data = bpy.data.cameras.new("LY_lamp_cam")
    cam_data.lens = 55
    cam = bpy.data.objects.new("LY_lamp_cam", cam_data)
    cam.location = (2.4, -3.6, 1.75)
    scene.collection.objects.link(cam)
    target = bpy.data.objects.new("LY_lamp_target", None)
    target.location = (0, 0, 0.95)
    scene.collection.objects.link(target)
    cam.constraints.new("TRACK_TO").target = target
    scene.camera = cam
    fill = bpy.data.objects.new("LY_lamp_fill", bpy.data.lights.new("LY_lamp_fill", "AREA"))
    fill.data.energy = 60
    fill.data.size = 3
    fill.location = (-2.5, -2.5, 2.5)
    fill.rotation_euler = (0.8, -0.6, 0)
    scene.collection.objects.link(fill)
    glow = bpy.data.objects.new("LY_lamp_glow", bpy.data.lights.new("LY_lamp_glow", "POINT"))
    glow.data.energy = 90
    glow.data.color = (1.0, 0.78, 0.5)
    glow.data.shadow_soft_size = 0.25
    glow.location = (0, 0, BULB_Z)
    scene.collection.objects.link(glow)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    floor = bpy.data.meshes.new("LY_lamp_floor")
    bm.to_mesh(floor)
    bm.free()
    floor.materials.append(material("LY_lamp_floor", base=(0.3, 0.2, 0.13), roughness=0.6))
    scene.collection.objects.link(bpy.data.objects.new("LY_lamp_floor", floor))
    world = bpy.data.worlds.new("LY_lamp_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.18, 0.15, 0.12, 1)
    bg.inputs["Strength"].default_value = 0.4
    scene.world = world
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1200
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(OUT_PREVIEW)
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return [cam, target, fill, glow]


def main():
    old = bpy.data.scenes.get("LY_Lamp")
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new("LY_Lamp")
    bpy.context.window.scene = scene
    parts = build(scene)
    helpers = preview(scene)
    nt, mix, src, bsdf = preview.restore
    nt.links.new(src, bsdf.inputs['Emission Color'])
    nt.nodes.remove(mix)
    # Selection lives per view layer: clear every scene and export the active scene only.
    for sc in bpy.data.scenes:
        for layer in sc.view_layers:
            for obj in sc.objects:
                obj.select_set(obj in parts and sc == scene, view_layer=layer)
    bpy.context.view_layer.objects.active = parts[0]
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB), export_format="GLB", use_selection=True, use_active_scene=True, export_image_format="WEBP",
                              export_image_quality=90, export_yup=True, export_materials="EXPORT", export_cameras=False,
                              export_lights=False, export_animations=False)
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(OUT_BLEND), {*parts, *helpers}, fake_user=True, compress=True)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts)
    print(f"parts={len(parts)} tris={tris} glb={OUT_GLB.stat().st_size}")


main()
