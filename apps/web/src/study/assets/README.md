# Study material sample, 2026-09-12

- `walnut-albedo.jpg`: original imagegen-generated base color for this project; converted to JPEG quality 88 for delivery. Prompt requested a flat, unlit walnut desk scan with organic grain, no objects or baked directional light. This is an artistic albedo, not a measured material scan. Source generation: exec-5a941b87-2be2-420d-8c04-481c680c4d9e.
- `paper-fiber.svg`, `stone-surface.svg`: original deterministic SVG materials, with fixed noise seeds. Shared between scene material and HTML surfaces where appropriate.
- `../materials.ts`: independently authored grayscale bump and roughness details. These describe fine surface finish, not measured normals extracted from the image.

All production assets ship with the frontend. No external texture CDN, image API or paid asset license is required when visitors use the site. THREE resources created by a scene are disposed when it unmounts. The existing turtle-shell and coin assets are outside this initial material sample.

## Final generation prompt (built-in imagegen, no CLI)

Generate a single production-ready PBR BASE COLOR / ALBEDO texture image, square 1024x1024 or 2048x2048. Full-bleed flat orthographic scan of a carefully maintained antique Chinese scholar's walnut wood writing desk surface. Muted dark warm walnut brown, subtle organic long flowing horizontal wood grain, two broad joined boards, tiny pores and restrained fine scratches, gently aged waxed wood, understated elegant realism. No objects, no paper, no frame, no lettering, no watermark. No perspective, no lighting gradients, no cast shadows, no specular highlights baked into image. The whole image is the wood surface only, edge-to-edge usable texture. Fine natural variations rather than striped repeated lines. This will be applied to a real 3D desktop with separate runtime lighting.


## Study objects (2026-09-14)

`TurtleShell.tsx` creates original parametric outer/inner shell surfaces and a belly plate.
Its original seeded scute maps use separate central, lateral and marginal regions, fine growth lines, height and roughness maps. No reference photographs are embedded.
`DeskObjects.tsx` creates rounded stone objects, stitched layered books with a local canvas label, a lathed glazed cup, and a bamboo brush with individual fittings.
Existing paper/stone illustrations and walnut texture remain local. The yellow underlay's geometry, material colors and placement are unchanged.

## Object material refinement (2026-09-17)

objectSurfaces.ts generates original seeded 512px pigment, bump and roughness maps for linen, paper, bamboo, slate, soapstone and celadon glaze. DeskObjects.tsx adds a recessed ink well, curved saucer, shaped brush tuft with individual strands, and a pierced stone seal handle. No external assets or runtime services are used. TurtleShell.tsx and the yellow underlay are unchanged.

## Desk and mat (2026-10-27)

- `walnut-albedo.jpg` removed: the desk is now the Blender table `public/models/desk.glb` (`scripts/blender/desk.py`), with its own procedural rosewood maps and a brass key-fret inlay.
- `mat-brocade.webp`: indigo silk brocade mat with a silver cloud-scroll border, generated with the built-in image model as a flat top-down textile (prompt in `.workbuddy/memory/2026-10-27.md`), cropped 19 px on each side to remove the white margin, 1024×1024 WebP q86. The woven relief normal map is derived from its luminance at runtime (`DeskMat.tsx`).
- `paper-sheet.webp`: Blender-rendered Xuan sheet (`scripts/blender/paper.py`). `paper-fiber.svg` stays only as a fallback for older CSS.
