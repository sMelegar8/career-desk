"""Melograno di cristallo – scena 3D procedurale renderizzata con Blender (bpy).

Uso:
  python studio/render/melograno.py --preview 60      # rende solo il fotogramma 60 (test)
  python studio/render/melograno.py                   # rende le 3 inquadrature + audio

Uscita: studio/clips/w01-melograno-cristallo/01.mp4, 02.mp4, 03.mp4
"""
import argparse
import math
import random
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).parent))
import asmr_audio  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "clips" / "w01-melograno-cristallo"
FRAMES = ROOT / "render" / "_frames" / "melograno"

FPS = 25
SHOTS = [(1, 125), (126, 250), (251, 375)]  # 5 s each
RES = (720, 1280)  # upscaled to 1080x1920 by assemble.py
SAMPLES = 16  # adaptive sampling + denoiser

R = 0.5          # fruit radius
SEED_COUNT = 140
OPEN_START, OPEN_END = 95, 130
POUR_START, POUR_END = 160, 215
RELEASE_FRAME = OPEN_START

random.seed(7)


# ---------------------------------------------------------------- materials
def principled(name, color, **inputs):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    for key, value in inputs.items():
        bsdf.inputs[key].default_value = value
    return mat, bsdf


def ruby_glass(name, color, roughness=0.0):
    mat, _ = principled(name, color, **{"Transmission Weight": 1.0, "Roughness": roughness, "IOR": 1.52})
    return mat


def walnut():
    mat, bsdf = principled("walnut", (0.12, 0.06, 0.03), Roughness=0.72)
    nt = mat.node_tree
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 1.6
    wave.inputs["Distortion"].default_value = 9.0
    wave.inputs["Detail"].default_value = 6.0
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.6, 3.0, 1.0)
    coords = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.025, 0.011, 0.006, 1)
    ramp.color_ramp.elements[1].color = (0.075, 0.036, 0.018, 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def steel():
    mat, _ = principled("steel", (0.8, 0.8, 0.82), Metallic=1.0, Roughness=0.12)
    return mat


# ---------------------------------------------------------------- geometry
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.max_bounces = 8
    scene.cycles.transmission_bounces = 8
    scene.cycles.glossy_bounces = 4
    scene.cycles.diffuse_bounces = 2
    # persistent data turned the glass black after ~12 consecutive frames: keep it off
    scene.render.use_persistent_data = False
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0
    scene.render.resolution_x, scene.render.resolution_y = RES
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, SHOTS[-1][1]
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.004, 0.005, 1)
    scene.world = world
    return scene


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, bm_builder):
    import bmesh

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm_builder(bm)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def half_shell(side, mat):
    """Hollow hemisphere (pomegranate half) with its cut face on the x=0 plane."""
    import bmesh

    def build(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=R)
        for v in bm.verts:  # slightly squashed, a little lumpy like a real fruit
            v.co.z *= 0.9
            v.co *= 1 + 0.025 * math.sin(6 * math.atan2(v.co.y, v.co.z + 1e-6))
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        # keep the cup on this side, hollow: the cut face stays open
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(side, 0, 0), clear_inner=True)

    obj = mesh_object(f"half_{side}", build)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    mod = obj.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.03
    return obj


def crown(mat):
    import bmesh

    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=False, segments=12, radius1=0.12, radius2=0.16, depth=0.16)
        for v in bm.verts:
            if v.co.z > 0:
                angle = math.atan2(v.co.y, v.co.x)
                v.co.z += 0.05 * (1 + math.cos(6 * angle))

    obj = mesh_object("crown", build)
    obj.data.materials.append(mat)
    obj.location = (0, 0, R * 0.9 + 0.04)
    obj.modifiers.new("solid", "SOLIDIFY").thickness = 0.015
    return obj


def seed_mesh():
    import bmesh

    def build(bm):
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.045)
        for v in bm.verts:
            v.co.z *= 1.5  # elongated, faceted kernel

    obj = mesh_object("seed_proto", build)
    return obj.data


def seeds(mesh, mats):
    objs = []
    spacing = 0.105
    n = int(R / spacing) + 1
    cells = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            for k in range(-n, n + 1):
                p = Vector((i, j, k)) * spacing
                p += Vector((random.uniform(-0.01, 0.01) for _ in range(3)))
                if abs(p.x) > 0.06 and p.length < R * 0.78 and p.z < R * 0.55:
                    cells.append(p)
    random.shuffle(cells)
    for idx, p in enumerate(cells[:SEED_COUNT]):
        obj = link(bpy.data.objects.new(f"seed_{idx:03d}", mesh.copy()))
        obj.data.materials.append(random.choice(mats))
        obj.location = p + Vector((0, 0, R))
        obj.rotation_euler = Euler([random.uniform(0, math.pi) for _ in range(3)])
        obj.scale = [random.uniform(0.85, 1.15)] * 3
        objs.append(obj)
    return objs


def board(mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = "board"
    obj.scale = (5.0, 3.0, 0.08)
    obj.location = (0, 0, -0.04)
    obj.data.materials.append(mat)
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = 0.02
    bev.segments = 3
    return obj


def knife(mat):
    import bmesh

    def build(bm):
        # blade profile in the YZ plane, extruded along x (thin)
        pts = [(-0.9, 0.0), (0.55, 0.0), (0.8, 0.26), (-0.9, 0.32)]
        verts = [bm.verts.new((0, y, z)) for y, z in pts]
        face = bm.faces.new(verts)
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=moved, vec=(0.012, 0, 0))

    blade = mesh_object("blade", build)
    blade.data.materials.append(mat)
    blade.modifiers.new("bevel", "BEVEL").width = 0.003
    handle_mat, _ = principled("handle", (0.015, 0.012, 0.01), Roughness=0.35)
    bpy.ops.mesh.primitive_cube_add(size=1)
    handle = bpy.context.active_object
    handle.name = "handle"
    handle.scale = (0.035, 0.6, 0.12)
    handle.location = (0.006, -1.2, 0.16)
    handle.data.materials.append(handle_mat)
    handle.parent = blade
    return blade


# ---------------------------------------------------------------- animation
def key(obj, frame, **props):
    for name, value in props.items():
        setattr(obj, name, value)
        obj.keyframe_insert(name, frame=frame)


def animate_knife(blade):
    key(blade, 1, location=(-0.006, 0.1, R * 1.8 + 0.12))
    key(blade, 15, location=(-0.006, 0.1, R * 1.8 + 0.02))
    key(blade, 85, location=(-0.006, 0.1, 0.005))   # through the fruit, resting on the board
    key(blade, 92, location=(-0.006, 0.1, 0.005))
    key(blade, 110, location=(-0.006, 3.0, 4.0))     # out of every shot


def animate_halves(left, right):
    # origin = bottom of the cut face; when open the dome rests on the board with the cut face up
    def open_loc(side):
        return (side * 0.15, 0, R)

    for obj, side in ((left, -1), (right, 1)):
        obj.rotation_mode = "XYZ"
        key(obj, 1, location=(side * 0.002, 0, 0), rotation_euler=(0, 0, 0))
        key(obj, OPEN_START, location=(side * 0.002, 0, 0), rotation_euler=(0, 0, 0))
        key(obj, OPEN_END - 8, location=open_loc(side), rotation_euler=(0, side * math.radians(95), 0))
        key(obj, OPEN_END, location=open_loc(side), rotation_euler=(0, side * math.radians(88), 0))
    # the left half keeps tipping and pours its seeds onto the board
    key(left, POUR_START, location=open_loc(-1), rotation_euler=(0, -math.radians(88), 0))
    key(left, POUR_END, location=(-0.35, 0, R + 0.3), rotation_euler=(0, -math.radians(150), 0))


def setup_physics(scene, left, right, seed_objs, board_obj, crown_obj):
    bpy.ops.rigidbody.world_add()
    rbw = scene.rigidbody_world
    rbw.point_cache.frame_start = 1
    rbw.point_cache.frame_end = SHOTS[-1][1]
    rbw.substeps_per_frame = 20
    rbw.solver_iterations = 20

    def add(obj, kind, shape, **props):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.rigidbody.object_add(type=kind)
        rb = obj.rigid_body
        rb.collision_shape = shape
        for k, v in props.items():
            setattr(rb, k, v)
        return rb

    for shell in (left, right):
        rb = add(shell, "PASSIVE", "MESH", kinematic=True, friction=0.4, collision_margin=0.002)
        rb.mesh_source = "FINAL"  # include the solidify thickness
    add(board_obj, "PASSIVE", "BOX", friction=0.6)
    for s in seed_objs:
        rb = add(s, "ACTIVE", "CONVEX_HULL", mass=0.01, friction=0.35, restitution=0.35,
                 collision_margin=0.001, linear_damping=0.1, angular_damping=0.2)
        rb.kinematic = True
        s.keyframe_insert("rigid_body.kinematic", frame=1)
        s.keyframe_insert("rigid_body.kinematic", frame=RELEASE_FRAME - 1)
        rb.kinematic = False
        s.keyframe_insert("rigid_body.kinematic", frame=RELEASE_FRAME)
    crown_obj.parent = right
    crown_obj.matrix_parent_inverse = right.matrix_world.inverted()


# ---------------------------------------------------------------- lights & cameras
def area_light(name, loc, rot, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    obj = link(bpy.data.objects.new(name, data))
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def lights():
    key_light = area_light("key", (-2.6, -0.8, 1.6), (0, math.radians(-60), math.radians(-15)), 700, 1.2, (1.0, 0.86, 0.7))
    area_light("rim", (2.2, 2.0, 1.8), (math.radians(-50), math.radians(40), 0), 450, 0.6, (0.75, 0.85, 1.0))
    area_light("top", (0, 0, 3.5), (0, 0, 0), 50, 3.0)
    # a slow-moving sparkle light for the final macro shot
    sparkle = area_light("sparkle", (1.5, -1.5, 0.8), (math.radians(70), 0, math.radians(45)), 0, 0.15)
    sparkle.data.keyframe_insert("energy", frame=SHOTS[2][0])
    sparkle.data.energy = 300
    sparkle.data.keyframe_insert("energy", frame=SHOTS[2][0] + 15)
    key(sparkle, SHOTS[2][0], location=(1.5, -1.5, 0.8))
    key(sparkle, SHOTS[2][1], location=(-1.5, -1.2, 0.9))
    return key_light


def camera(name, lens):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.dof.use_dof = True
    data.dof.aperture_fstop = 2.8
    return link(bpy.data.objects.new(name, data))


def aim(cam, target):
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def cameras(scene):
    # shot 1: 45° close-up of the cut
    c1 = camera("cam_cut", 55)
    key(c1, 1, location=(-2.0, -2.7, 1.6))
    aim(c1, (0, 0, R * 1.05))
    c1.keyframe_insert("rotation_euler", frame=1)
    key(c1, SHOTS[0][1], location=(-1.7, -2.3, 1.35))
    aim(c1, (0, 0, R * 0.75))
    c1.keyframe_insert("rotation_euler", frame=SHOTS[0][1])
    c1.data.dof.focus_distance = 3.3
    c1.data.dof.aperture_fstop = 4.0

    # shot 2: overhead, halves open and seeds pour
    # image vertical along world x, the direction of the action
    c2 = camera("cam_top", 40)
    key(c2, SHOTS[1][0], location=(-0.3, 0, 4.3), rotation_euler=(0, 0, math.radians(90)))
    key(c2, SHOTS[1][1], location=(-0.45, 0, 3.6), rotation_euler=(0, 0, math.radians(92)))
    c2.data.dof.focus_distance = 3.9
    c2.data.dof.aperture_fstop = 5.6

    # shot 3: low macro on the pile of glass seeds
    c3 = camera("cam_macro", 85)
    key(c3, SHOTS[2][0], location=(-2.6, -1.9, 0.45))
    key(c3, SHOTS[2][1], location=(-2.2, -1.6, 0.35))
    c3.data.dof.focus_distance = 1.9
    c3.data.dof.aperture_fstop = 4.0

    for cam, (start, _) in zip((c1, c2, c3), SHOTS):
        marker = scene.timeline_markers.new(cam.name, frame=start)
        marker.camera = cam
    scene.camera = c1
    return c1, c2, c3


# ---------------------------------------------------------------- build & render
def build():
    scene = reset()
    glass = ruby_glass("ruby_glass", (0.85, 0.05, 0.08), 0.0)
    seed_mats = [ruby_glass(f"seed_{i}", c, 0.0) for i, c in enumerate([(0.9, 0.02, 0.06), (0.75, 0.01, 0.12), (1.0, 0.12, 0.15)])]
    board_obj = board(walnut())
    left = half_shell(-1, glass)
    right = half_shell(1, glass)
    for half in (left, right):
        half.location.z = 0
        half.data.transform(Matrix.Translation((0, 0, R * 0.9)))
    crown_obj = crown(glass)
    seed_objs = seeds(seed_mesh(), seed_mats)
    blade = knife(steel())
    animate_knife(blade)
    animate_halves(left, right)
    setup_physics(scene, left, right, seed_objs, board_obj, crown_obj)
    lights()
    cameras(scene)
    bpy.data.meshes.remove(bpy.data.meshes["seed_proto"])
    return scene, seed_objs, blade


def bake(scene):
    bpy.ops.ptcache.bake_all(bake=True)


def aim_macro(scene, seed_objs):
    """Point the macro camera at where the seeds actually landed in the simulation."""
    scene.frame_set(SHOTS[2][0])
    positions = [s.matrix_world.translation.copy() for s in seed_objs]
    landed = [p for p in positions if p.z < 0.15] or positions
    centre = sum(landed, Vector()) / len(landed)
    cam = bpy.data.objects["cam_macro"]
    cam.animation_data_clear()
    for frame, offset in ((SHOTS[2][0], Vector((0.25, -2.0, 0.75))), (SHOTS[2][1], Vector((0.15, -1.6, 0.55)))):
        cam.location = centre + offset
        aim(cam, centre + Vector((0, 0, 0.03)))
        cam.keyframe_insert("location", frame=frame)
        cam.keyframe_insert("rotation_euler", frame=frame)
    cam.data.dof.focus_distance = offset.length
    return centre, len(landed)


def impacts(scene, seed_objs):
    """Frames where seeds hit something (sudden drop in speed) → audio events."""
    events = []
    prev = {s.name: None for s in seed_objs}
    vel = {s.name: Vector() for s in seed_objs}
    for f in range(RELEASE_FRAME, SHOTS[-1][1] + 1):
        scene.frame_set(f)
        for s in seed_objs:
            pos = s.matrix_world.translation.copy()
            if prev[s.name] is not None:
                v = (pos - prev[s.name]) * FPS
                dv = (v - vel[s.name]).length
                if vel[s.name].length > 0.4 and dv > 0.8:
                    events.append((f / FPS, min(1.0, dv / 4)))
                vel[s.name] = v
            prev[s.name] = pos
    return events


def render(scene, frames):
    FRAMES.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    for f in frames:
        target = FRAMES / f"{f:04d}.png"
        if target.exists():
            continue
        scene.frame_set(f)
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        print(f"frame {f} ok", flush=True)


def encode(events):
    OUT.mkdir(parents=True, exist_ok=True)
    cut_times = [(22 + i * 7) / FPS for i in range(10)]  # crunchy cracks while the blade goes through
    for n, (start, end) in enumerate(SHOTS, 1):
        t0, t1 = (start - 1) / FPS, end / FPS
        wav = FRAMES.parent / f"melograno_{n:02d}.wav"
        asmr_audio.render_glass_track(
            wav, duration=t1 - t0,
            cracks=[t - t0 for t in cut_times if t0 <= t < t1],
            tinkles=[(t - t0, a) for t, a in events if t0 <= t < t1],
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
    parser.add_argument("--preview", type=int, nargs="*", help="render only these frames to studio/render/_preview")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    scene, seed_objs, _ = build()
    bake(scene)
    print("seed pile (centre, landed):", aim_macro(scene, seed_objs), flush=True)
    if args.preview:
        global FRAMES
        FRAMES = ROOT / "render" / "_preview"
        render(scene, args.preview)
        return
    events = impacts(scene, seed_objs)
    render(scene, range(1, SHOTS[-1][1] + 1))
    encode(events)


if __name__ == "__main__":
    main()
