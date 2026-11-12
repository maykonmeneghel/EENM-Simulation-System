# Anatomy meshes of the 3D step

`forearm.glb` and `leg.glb` are adapted from **BodyParts3D 4.0** (`isa_BP3D_4.0_obj_99.zip`, SHA-256
`40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e`), Database Center for Life Science (DBCLS),
<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>.

Credit, as the licensor asks:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

The database's license page (<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>, updated 2025-02-27) gives
CC BY 4.0. The header of each OBJ file in the archive (dated 2011-05-19) still states **CC Attribution-Share Alike 2.1
Japan**. To comply with both (docs/design/3d-view.md, decision 1), these adapted files are offered under
**CC BY-SA 4.0** (<https://creativecommons.org/licenses/by-sa/4.0/>). Share-alike covers these meshes only, not the
application's code.

Changes made to `forearm.glb` (`apps/web/scripts/anatomy/build-forearm.mjs`): seven parts extracted (right flexor
carpi radialis, right extensor carpi radialis longus and brevis, right radius, ulna, humerus, skin) and the 27 bones of
the right hand merged into one mesh; moved into a forearm frame in metres; the whole-body skin and the humerus cropped
to the forearm; vertices welded. No change of shape or scale.

Changes made to `leg.glb` (`apps/web/scripts/anatomy/build-leg.mjs`): nine parts extracted (right soleus, medial and
lateral heads of the right gastrocnemius, right tibialis anterior, tibia, fibula, femur, patella, skin) and the 26 bones
of the right foot merged into one mesh; moved into a leg frame in metres; the whole-body skin cropped to the right leg
and the femur to its knee end; vertices welded; the skin and the foot bones simplified (fewer triangles, meshoptimizer).
No change of scale.
