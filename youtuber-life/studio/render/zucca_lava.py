"""Zucca di lava – scena 3D procedurale renderizzata con Blender (bpy).

Uso:
  python studio/render/zucca_lava.py --preview 60 180 300   # solo questi fotogrammi (test)
  python studio/render/zucca_lava.py                        # 3 inquadrature + audio

Uscita: studio/clips/w01-zucca-lava/01.mp4, 02.mp4, 03.mp4
Nessuna simulazione fisica: ogni fotogramma è indipendente, il rendering si può riprendere.
"""
import argparse
import math
import random
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import asmr_audio  # noqa: E402
from melograno import aim, area_light, camera, key, knife, link, mesh_object, principled, reset, steel  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "clips" / "w01-zucca-lava"
FRAMES = ROOT / "render" / "_frames" / "zucca_lava"

FPS = 25
SHOTS = [(1, 125), (126, 250), (251, 375)]  # 5 s each, same as melograno.reset()

R = 0.5          # horizontal radius
SQUASH = 0.72    # pumpkins are wider than tall
LOBE = 0.07
CRACK_START, CRACK_PEAK = 30, 95
PART_START, PART_SMALL = 95, 118                 # halves crack apart a little
PART_SLOW_END = 205                              # slow opening in the macro shot
FALL_END = 232                                   # halves fall open with a thud

random.seed(11)


# ---------------------------------------------------------------- materials
def crust():
    """Black cooled lava with glowing cracks (Voronoi edges) that brighten over time."""
    mat, bsdf = principled("crust", (0.018, 0.016, 0.015), Roughness=0.75)
    nt = mat.node_tree
    coords = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 9.0
    vor.inputs["Randomness"].default_value = 1.0
    # warp the coordinates so the cracks wander instead of forming clean cells
    warp = nt.nodes.new("ShaderNodeTexNoise")
    warp.inputs["Scale"].default_value = 3.0
    nt.links.new(coords.outputs["Object"], warp.inputs["Vector"])
    warped = nt.nodes.new("ShaderNodeVectorMath")
    warped.operation = "MULTIPLY_ADD"
    warped.inputs[1].default_value = (0.18, 0.18, 0.18)
    nt.links.new(warp.outputs["Color"], warped.inputs[0])
    nt.links.new(coords.outputs["Object"], warped.inputs[2])
    nt.links.new(warped.outputs["Vector"], vor.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.018
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.22, 0.02, 1)
    # rocky bump
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 8.0
    nt.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # crack brightness is driven by a multiply node we can keyframe
    mult = nt.nodes.new("ShaderNodeMath")
    mult.operation = "MULTIPLY"
    nt.links.new(ramp.outputs["Color"], mult.inputs[0])
    nt.links.new(mult.outputs["Value"], bsdf.inputs["Emission Strength"])
    strength = mult.inputs[1]
    for frame, value in ((1, 0.8), (CRACK_START, 1.0), (CRACK_PEAK, 5.0), (SHOTS[2][0], 4.0), (SHOTS[2][1], 1.5)):
        strength.default_value = value
        strength.keyframe_insert("default_value", frame=frame)
    return mat


def molten():
    """Flowing molten core: animated 4D noise through a black-red-orange-yellow ramp."""
    mat = bpy.data.materials.new("molten")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    coords = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 4.0
    noise.inputs["Detail"].default_value = 10.0
    noise.inputs["Distortion"].default_value = 1.5
    nt.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    w = noise.inputs["W"]
    w.default_value = 0.0
    w.keyframe_insert("default_value", frame=1)
    w.default_value = 3.0
    w.keyframe_insert("default_value", frame=SHOTS[-1][1])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.35, (0.06, 0.004, 0.0, 1)
    els[1].position, els[1].color = 0.8, (1.0, 0.5, 0.08, 1)
    mid = els.new(0.55)
    mid.color = (0.85, 0.1, 0.0, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    strength = emit.inputs["Strength"]
    for frame, value in ((1, 0.0), (PART_START, 2.5), (SHOTS[1][0], 3.5), (SHOTS[2][0], 3.0), (SHOTS[2][1], 1.2)):
        strength.default_value = value
        strength.keyframe_insert("default_value", frame=frame)
    return mat


def slate():
    mat, bsdf = principled("slate", (0.03, 0.032, 0.035), Roughness=0.55)
    nt = mat.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["To Min"].default_value = 0.35
    ramp.inputs["To Max"].default_value = 0.8
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def ember_mat():
    mat = bpy.data.materials.new("ember")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 0.45, 0.08, 1)
    emit.inputs["Strength"].default_value = 12.0
    nt.links.new(emit.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return mat


# ---------------------------------------------------------------- geometry
def pumpkin_half(side, crust_mat, core_mat):
    """Solid half pumpkin: lobed crust outside, flat molten cut face on the x=0 plane."""
    import bmesh

    def build(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=R)
        for v in bm.verts:
            phi = math.atan2(v.co.y, v.co.x)
            v.co.x *= 1 + LOBE * math.cos(10 * phi)
            v.co.y *= 1 + LOBE * math.cos(10 * phi)
            v.co.z *= SQUASH
            if abs(v.co.z) > R * SQUASH * 0.85:  # dimples at top and bottom
                v.co.z *= 0.93
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(side, 0, 0), clear_inner=True)
        boundary = [e for e in bm.edges if e.is_boundary]
        filled = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
        for f in filled["faces"]:
            f.material_index = 1
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, R * SQUASH))  # bottom on the board

    obj = mesh_object(f"half_{side}", build)
    obj.data.materials.append(crust_mat)
    obj.data.materials.append(core_mat)
    for p in obj.data.polygons:
        p.use_smooth = p.material_index == 0
    return obj


def stem(mat, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.05, depth=0.2)
    obj = bpy.context.active_object
    obj.name = "stem"
    obj.location = (0.03, 0, 2 * R * SQUASH + 0.06)
    obj.rotation_euler = (0, math.radians(12), 0)
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def board(mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = "board"
    obj.scale = (5.0, 3.0, 0.08)
    obj.location = (0, 0, -0.04)
    obj.data.materials.append(mat)
    return obj


def embers(mat, count=70):
    import bmesh

    def build(bm):
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.008)

    proto = mesh_object("ember_proto", build).data
    bpy.data.objects.remove(bpy.data.objects["ember_proto"])
    for i in range(count):
        obj = link(bpy.data.objects.new(f"ember_{i:02d}", proto))
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        start = random.randint(PART_START, SHOTS[-1][1] - 40)
        life = random.randint(30, 70)
        origin = Vector((random.uniform(-0.12, 0.12), random.uniform(-0.3, 0.3), random.uniform(0.25, 0.6)))
        drift = Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), random.uniform(0.6, 1.2)))
        key(obj, start - 1, location=origin, scale=(0, 0, 0))
        key(obj, start, location=origin, scale=(1, 1, 1))
        key(obj, start + life - 5, location=origin + drift * 0.9, scale=(0.8, 0.8, 0.8))
        key(obj, start + life, location=origin + drift, scale=(0, 0, 0))


# ---------------------------------------------------------------- animation
def animate_knife(blade):
    top = 2 * R * SQUASH
    key(blade, 1, location=(-0.006, 0.1, top + 0.16))
    key(blade, 15, location=(-0.006, 0.1, top + 0.03))
    key(blade, CRACK_PEAK, location=(-0.006, 0.1, top * 0.45))   # wedged into the crust
    key(blade, PART_START + 2, location=(-0.006, 0.1, top * 0.45))
    key(blade, PART_SMALL + 4, location=(-0.006, 3.0, 4.0))       # out of every shot


def animate_halves(left, right):
    def open_loc(side):
        return (side * 0.12, 0, R * (1 + LOBE))  # dome on the board, molten face up

    for obj, side in ((left, -1), (right, 1)):
        obj.rotation_mode = "XYZ"
        key(obj, 1, location=(side * 0.001, 0, 0), rotation_euler=(0, 0, 0))
        key(obj, PART_START, location=(side * 0.001, 0, 0), rotation_euler=(0, 0, 0))
        key(obj, PART_SMALL, location=(side * 0.03, 0, 0), rotation_euler=(0, side * math.radians(10), 0))
        key(obj, PART_SLOW_END, location=(side * 0.05, 0, 0.02), rotation_euler=(0, side * math.radians(38), 0))
        key(obj, FALL_END - 6, location=open_loc(side), rotation_euler=(0, side * math.radians(93), 0))
        key(obj, FALL_END, location=open_loc(side), rotation_euler=(0, side * math.radians(88), 0))


def core_light():
    data = bpy.data.lights.new("core", "POINT")
    data.color = (1.0, 0.4, 0.08)
    data.shadow_soft_size = 0.2
    obj = link(bpy.data.objects.new("core", data))
    obj.location = (0, 0, R * SQUASH)
    for frame, energy in ((1, 0), (PART_START, 0), (PART_SMALL, 60), (PART_SLOW_END, 120), (SHOTS[2][0], 90), (SHOTS[2][1], 30)):
        data.energy = energy
        data.keyframe_insert("energy", frame=frame)
    key(obj, FALL_END, location=(0, 0, R * SQUASH))
    key(obj, FALL_END + 5, location=(0, 0, R + 0.35))


def lights():
    area_light("rim", (2.2, 2.4, 1.6), (math.radians(-55), math.radians(40), 0), 160, 0.8, (0.6, 0.75, 1.0))
    area_light("fill", (-2.4, -1.6, 1.4), (0, math.radians(-60), math.radians(-30)), 40, 1.5, (1.0, 0.8, 0.7))
    core_light()


def cameras(scene):
    mid = R * SQUASH
    c1 = camera("cam_cut", 55)
    key(c1, 1, location=(-1.7, -2.3, 1.35))
    aim(c1, (0, 0, mid * 1.15))
    c1.keyframe_insert("rotation_euler", frame=1)
    key(c1, SHOTS[0][1], location=(-1.45, -1.95, 1.1))
    aim(c1, (0, 0, mid))
    c1.keyframe_insert("rotation_euler", frame=SHOTS[0][1])
    c1.data.dof.focus_distance = 2.8
    c1.data.dof.aperture_fstop = 4.0

    c2 = camera("cam_macro", 50)
    key(c2, SHOTS[1][0], location=(0.4, -2.1, 0.8))
    aim(c2, (0, 0, mid))
    c2.keyframe_insert("rotation_euler", frame=SHOTS[1][0])
    key(c2, SHOTS[1][1], location=(0.3, -2.5, 1.15))
    aim(c2, (0, 0, mid * 0.8))
    c2.keyframe_insert("rotation_euler", frame=SHOTS[1][1])
    c2.data.dof.focus_distance = 2.3
    c2.data.dof.aperture_fstop = 4.0

    # image vertical along world x: both halves fit the portrait frame
    c3 = camera("cam_top", 40)
    key(c3, SHOTS[2][0], location=(0, 0, 4.0), rotation_euler=(0, 0, math.radians(90)))
    key(c3, SHOTS[2][1], location=(0, 0, 3.4), rotation_euler=(0, 0, math.radians(93)))
    c3.data.dof.focus_distance = 3.4
    c3.data.dof.aperture_fstop = 5.6

    for cam, (start, _) in zip((c1, c2, c3), SHOTS):
        marker = scene.timeline_markers.new(cam.name, frame=start)
        marker.camera = cam
    scene.camera = c1


def build():
    scene = reset()
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.002, 0.003, 1)
    crust_mat, core_mat = crust(), molten()
    board(slate())
    left = pumpkin_half(-1, crust_mat, core_mat)
    right = pumpkin_half(1, crust_mat, core_mat)
    stem(principled("stem", (0.02, 0.018, 0.015), Roughness=0.8)[0], right)
    blade = knife(steel())
    animate_knife(blade)
    animate_halves(left, right)
    embers(ember_mat())
    lights()
    cameras(scene)
    return scene


def render(scene, frames, target_dir):
    target_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    for f in frames:
        target = target_dir / f"{f:04d}.png"
        if target.exists():
            continue
        scene.frame_set(f)
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        print(f"frame {f} ok", flush=True)


def encode():
    OUT.mkdir(parents=True, exist_ok=True)
    cracks = [(20 + i * 9) / FPS for i in range(9)]  # rocky crunches while the blade bites
    cracks.append(PART_START / FPS)                   # the big split
    for n, (start, end) in enumerate(SHOTS, 1):
        t0, t1 = (start - 1) / FPS, end / FPS
        wav = FRAMES.parent / f"zucca_lava_{n:02d}.wav"
        asmr_audio.render_lava_track(
            wav, duration=t1 - t0,
            cracks=[t - t0 for t in cracks if t0 <= t < t1],
            sizzle_from=max(0.0, PART_START / FPS - t0),
            thuds=[FALL_END / FPS - t0] if t0 <= FALL_END / FPS < t1 else [],
            seed=n,
        )
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-framerate", str(FPS), "-start_number", str(start), "-i", str(FRAMES / "%04d.png"),
            "-i", str(wav), "-frames:v", str(end - start + 1),
            "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            str(OUT / f"{n:02d}.mp4"),
        ], check=True)
        print(f"clip {n:02d}.mp4 ok", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=int, nargs="*")
    args = parser.parse_args()
    scene = build()
    if args.preview:
        render(scene, args.preview, ROOT / "render" / "_preview_lava")
        return
    render(scene, range(1, SHOTS[-1][1] + 1), FRAMES)
    encode()


if __name__ == "__main__":
    main()
