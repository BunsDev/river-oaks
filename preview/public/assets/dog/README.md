# Wish dog

The browser wish uses a textured, rigged sable canine adapted from [NewDLC's CC0 wolf](https://opengameart.org/content/3d-wolf). The source includes color, normal and roughness maps. `sources.json` records provenance and checksums.

`sable-coat.png` is an AI-generated adaptation of the source color atlas, with finer directional fur detail. The original normal and roughness maps remain in use. The generated atlas is included so rebuilding does not require generation again.

`scripts/build_wish_dog.py` converts the source to glTF PBR, adds glossy brown eye materials, smooths and decimates the silhouette to fewer than 30,000 triangles, and normalizes the model to 0.96 metres at the ears. Extract the linked source ZIP to `data/raw/wish-dog/` and run the script with bpy 4.5.3.

The runtime shares immutable geometry/textures across wishes and gives each dog an independent skeleton and materials. Head and tail motion leave the paws planted; reduced motion freezes the pose. Undo also cancels attachment of a pending model. Residents remain visible if the asset cannot load.

This is a browser game model with normal-mapped coat detail, not a scanned animal or a simulated fur groom.
