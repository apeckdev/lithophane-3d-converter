import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';

export async function generateStand(thicknessMm: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        try {
            // Stand Parameters
            const tolerance = 0.6; // Extra space for fit
            const slotWidth = thicknessMm + tolerance;
            const floorY = 3; // Thickness of the floor under the lithophane
            const tiltAngle = 10 * (Math.PI / 180); // 10 degrees tilt back

            const standWidth = 60; // Total width of the stand
            const totalDepth = 40; // Total depth (front-to-back)
            const backSupportHeight = 20; // Height of the back support
            const frontLipHeight = 8; // Height of the front lip

            // Calculate trigonometry values
            const tanTilt = Math.tan(tiltAngle);
            const cosTilt = Math.cos(tiltAngle);

            // Define the slot position
            // We want the lithophane's center of mass to be roughly centered over the base for stability.
            // Let's anchor the back-bottom corner of the slot on the "floor" of the stand.
            const backSlotXAtFloor = 22;

            // Calculate relative X coordinates based on Y height (x = y * tan(theta))
            // x = x_base + (y - y_base) * tan(theta)
            const getBackWallX = (y: number) => backSlotXAtFloor + (y - floorY) * tanTilt;

            // The front wall is parallel to the back wall, separated by `slotWidth` / cos(theta) along horizontal
            const horizontalGap = slotWidth / cosTilt;
            const frontSlotXAtFloor = backSlotXAtFloor - horizontalGap;

            const getFrontWallX = (y: number) => frontSlotXAtFloor + (y - floorY) * tanTilt;

            // Create the side profile shape
            const shape = new THREE.Shape();

            // 1. Bottom-Front Corner
            shape.moveTo(0, 0);

            // 2. Bottom-Back Corner
            shape.lineTo(totalDepth, 0);

            // 3. Top-Back Corner
            shape.lineTo(totalDepth, backSupportHeight);

            // 4. Back Wall Top (Inner edge of the slot, back side)
            // We connect from the outer back block to the slot edge
            const pBackTopX = getBackWallX(backSupportHeight);
            shape.lineTo(pBackTopX + 2, backSupportHeight); // Add a 2mm flat top thickness
            shape.lineTo(pBackTopX, backSupportHeight);

            // 5. Back Wall Bottom (Bottom of slot, back corner)
            shape.lineTo(backSlotXAtFloor, floorY);

            // 6. Front Wall Bottom (Bottom of slot, front corner)
            shape.lineTo(frontSlotXAtFloor, floorY);

            // 7. Front Wall Top (Top of lip)
            const pFrontTopX = getFrontWallX(frontLipHeight);
            shape.lineTo(pFrontTopX, frontLipHeight);

            // 8. Front Face Top (Outer edge of lip)
            // Create a small flat top for the lip
            shape.lineTo(pFrontTopX - 2, frontLipHeight);

            // 9. Slope down to front
            // Connect to a low point at the front to define the nose
            shape.lineTo(0, 2);

            // Close shape
            shape.lineTo(0, 0);

            // Extrude options
            const extrudeSettings = {
                steps: 1,
                depth: standWidth,
                bevelEnabled: true,
                bevelThickness: 1,
                bevelSize: 1,
                bevelSegments: 2
            };

            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

            // Center the geometry
            geometry.center();

            // Rotate to sit flat on the printer bed
            // Current orientation:
            // Shape X = Depth (Front-to-Back)
            // Shape Y = Height (Up-Down)
            // Extrude Z = Width (Left-to-Right)

            // Desired STL orientation (Z-up):
            // We want the floor (Shape Y=0) to be at World Z=0.
            // We want Extrude Z (Width) to be World X?
            // We want Shape X (Depth) to be World Y?

            // Rotate X by 90 degrees?
            // (x, y, z) -> (x, -z, y)
            // Shape X -> World X
            // Shape Y -> World Z (Up)
            // Extrude Z -> World -Y (Width)

            geometry.rotateX(-Math.PI / 2);

            // Rotate Y by 90 to swap Z (Width) and X (Depth) to align with printer bed (X=Width, Y=Depth, Z=Height)
            geometry.rotateY(Math.PI / 2);
            geometry.rotateX(-Math.PI / 2);

            // Compute bounds and set minZ to 0
            geometry.computeBoundingBox();
            if (geometry.boundingBox) {
                const minZ = geometry.boundingBox.min.z;
                geometry.translate(0, 0, -minZ);
            }

            const mesh = new THREE.Mesh(geometry);
            const exporter = new STLExporter();
            const stlResult = exporter.parse(mesh, { binary: true });

            const blob = new Blob([stlResult as BlobPart], { type: 'application/octet-stream' });
            resolve(blob);

        } catch (e) {
            reject(e);
        }
    });
}
