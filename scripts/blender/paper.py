"""Hand-made Xuan paper sheet for the Liuyao study letter, built and rendered in Blender.

The letter in the page is an editable HTML element, so the sheet is delivered as
a top-down render with real alpha: deckled (torn-fibre) edges, slight cockle
lit by a low sun, and the fibre texture. Text is never baked in.

Run inside Blender: python bmcp.py run paper.py
Outputs: logs/blender/paper-sheet.png (RGBA), assets-src/blender/paper.blend
"""
import math
from pathlib import Path

import bmesh
import bpy
import numpy as np

REPO = Path(globals().get("__file__", "")).resolve().parents[2]
FIBRE = REPO / "logs/model-work/Photorealistic_archival_qualit_2026-10-25T13-33-58.png"
OUT_PNG = REPO / "logs/blender/paper-sheet.png"
OUT_BLEND = REPO / "assets-src/blender/paper.blend"
W, H = 0.80, 1.10          # sheet size in metres-ish units; aspect matches the 320×440 letter
RES_X, RES_Y = 1280, 1760
MARGIN = 0.012              # transparent margin around the deckle in the render


def value_noise_1d(n, cells, seed):
    rng = np.random.default_rng(seed)
    g = rng.random(cells + 1)
    g[-1] = g[0]
    x = np.linspace(0, cells, n, endpoint=False)
    i = np.floor(x).astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    return g[i] * (1 - f) + g[i + 1] * f


def value_noise_2d(h, w, cy, cx, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((cy + 1, cx + 1))
    y = np.linspace(0, cy, h, endpoint=False)
    x = np.linspace(0, cx, w, endpoint=False)
    y0, x0 = np.floor(y).astype(int), np.floor(x).astype(int)
    fy, fx = (y - y0)[:, None], (x - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0] * (1 - fx) + g[y0][:, x0 + 1] * fx
    b = g[y0 + 1][:, x0] * (1 - fx) + g[y0 + 1][:, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def deckle_alpha(h, w):
    """Alpha mask of a hand-made sheet: wandering, feathery edges, never a ruler line."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    px = 1.0 / w * W                                     # metres per pixel
    d_left, d_right = xx * px, (w - 1 - xx) * px
    d_top, d_bottom = yy * px * (H / W) * (w / h), (h - 1 - yy) * px * (H / W) * (w / h)
    # Perimeter-dependent wander for each side, different seeds per edge.
    def wander(n, seed):
        return (value_noise_1d(n, 7, seed) - .5) * 0.010 + (value_noise_1d(n, 40, seed + 1) - .5) * 0.004 \
            + (value_noise_1d(n, 220, seed + 2) - .5) * 0.0018
    left = d_left - wander(h, 10)[:, None]
    right = d_right - wander(h, 20)[:, None]
    top = d_top - wander(w, 30)[None, :]
    bottom = d_bottom - wander(w, 40)[None, :]
    edge = np.minimum(np.minimum(left, right), np.minimum(top, bottom)) - 0.012
    fibres = (value_noise_2d(h, w, 900, 650, 50) - .5) * 0.0024
    alpha = np.clip((edge + fibres) / 0.0016 + 0.5, 0, 1)
    # The deckle is thinner pulp: slightly translucent in a narrow band.
    band = np.clip(edge / 0.006, 0, 1)
    return alpha * (0.78 + 0.22 * band)


def main():
    old = bpy.data.scenes.get("LY_Paper")
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new("LY_Paper")
    bpy.context.window.scene = scene

    # Sheet: dense grid with gentle cockle (paper dries unevenly after brushing).
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=200, y_segments=275, size=0.5)
    uv = bm.loops.layers.uv.new("UVMap")
    # Smooth (bilinear) cockle sampled per vertex; stepped sampling shows as banding.
    cock = value_noise_2d(512, 512, 5, 4, 7) + 0.35 * value_noise_2d(512, 512, 13, 10, 8)
    for v in bm.verts:
        v.co.x *= W
        v.co.y *= H
        fy, fx = (v.co.y / H + .5) * 511, (v.co.x / W + .5) * 511
        i, j = min(int(fy), 510), min(int(fx), 510)
        ty, tx = fy - i, fx - j
        c = (cock[i, j] * (1 - tx) + cock[i, j + 1] * tx) * (1 - ty) + (cock[i + 1, j] * (1 - tx) + cock[i + 1, j + 1] * tx) * ty
        v.co.z = (c - .65) * 0.009
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / W + .5, loop.vert.co.y / H + .5)
    mesh = bpy.data.meshes.new("paper_sheet")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True

    # Alpha image computed at render resolution so the deckle stays crisp.
    a = deckle_alpha(RES_Y, RES_X)
    alpha_img = bpy.data.images.get("paper_alpha")
    if alpha_img:
        bpy.data.images.remove(alpha_img)
    alpha_img = bpy.data.images.new("paper_alpha", RES_X, RES_Y, alpha=False)
    alpha_img.colorspace_settings.name = "Non-Color"
    rgba = np.stack([a, a, a, np.ones_like(a)], -1).astype(np.float32)
    alpha_img.pixels.foreach_set(rgba.ravel())
    alpha_img.pack()

    fibre = bpy.data.images.load(str(FIBRE), check_existing=True)
    fibre.pack()
    mat = bpy.data.materials.get("paper_xuan") or bpy.data.materials.new("paper_xuan")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = fibre
    alpha_tex = nt.nodes.new("ShaderNodeTexImage")
    alpha_tex.image = alpha_img
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.0015
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(alpha_tex.outputs["Color"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.88
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mesh.materials.append(mat)
    sheet = bpy.data.objects.new("paper_sheet", mesh)
    scene.collection.objects.link(sheet)

    # Orthographic top view; a low sun reveals the cockle, a soft fill keeps it bright.
    cam_data = bpy.data.cameras.new("LY_paper_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = H + 2 * MARGIN
    cam = bpy.data.objects.new("LY_paper_cam", cam_data)
    cam.location = (0, 0, 3)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("LY_paper_sun", bpy.data.lights.new("LY_paper_sun", "SUN"))
    sun.data.energy = 1.5
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(64), 0, math.radians(-38))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("LY_paper_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (1, 0.97, 0.92, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = RES_X
    scene.render.resolution_y = int(RES_X * (H + 2 * MARGIN) / (W + 2 * MARGIN))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.filepath = str(OUT_PNG)
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(OUT_BLEND), {sheet, cam, sun}, fake_user=True, compress=True)
    print(f"render={OUT_PNG} {scene.render.resolution_x}x{scene.render.resolution_y}")


main()
