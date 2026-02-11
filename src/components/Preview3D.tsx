import { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface Preview3DProps {
    geometry: THREE.BufferGeometry;
    imageUrl?: string;
}

function LithophaneMesh({ geometry, isBacklit }: { geometry: THREE.BufferGeometry; imageUrl?: string; isBacklit: boolean }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);

    // Auto-rotate slightly if desired, or just static
    // useFrame((state, delta) => {
    //   if (meshRef.current) meshRef.current.rotation.y += delta * 0.1;
    // });

    return (
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
            {/* 
         Material Strategy:
         - Standard Lithophane: White plastic.
         - When backlit: The thinner parts should be brighter.
         - MeshPhysicalMaterial with transmission can simulate this but is computationally heavy and scale-dependent.
         - Simple Hack: Use the original image as an emissive map when "backlit" is on? 
           - But that defeats the purpose of seeing the *geometry* effect.
           - We want to replicate the physics: Thinner = brighter.
           - If we just use a standard material and put a light BEHIND it, 
             standard material doesn't transmit light.
             
         - Better Approach for "Simulation":
           - Use a custom shader or specialized material settings.
           - Or, actually allow the light to pass through by using `transmission`.
           - Let's try MeshPhysicalMaterial.
       */}
            <meshPhysicalMaterial
                ref={materialRef}
                color={isBacklit ? "#ffeedd" : "#ffffff"}
                roughness={0.4}
                metalness={0.1}
                transmission={isBacklit ? 0.6 : 0.0} // Allow light through
                thickness={2.0} // Physical thickness for transmission calculation
                ior={1.5}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

export function Preview3D({ geometry, imageUrl }: Preview3DProps) {
    const [isBacklit, setIsBacklit] = useState(false);
    const [autoRotate, setAutoRotate] = useState(false);

    // Re-center geometry when it changes
    useEffect(() => {
        geometry.center();
        geometry.computeBoundingBox();
    }, [geometry]);

    return (
        <div className="w-full h-full relative group">
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 p-2 bg-black/60 backdrop-blur rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => setIsBacklit(!isBacklit)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${isBacklit ? 'bg-primary text-background' : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                >
                    {isBacklit ? '💡 Backlight ON' : '🌑 Backlight OFF'}
                </button>
                <button
                    onClick={() => setAutoRotate(!autoRotate)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${autoRotate ? 'bg-primary text-background' : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                >
                    {autoRotate ? '🔄 Rotate ON' : '⏹ Rotate OFF'}
                </button>
            </div>

            <Canvas shadows dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={[0, 0, 150]} fov={50} />
                <OrbitControls autoRotate={autoRotate} makeDefault />

                {/* Environment / Lighting */}

                {isBacklit ? (
                    <>
                        {/* Backlight Mode: Dark ambient, strong light BEHIND the model */}
                        <ambientLight intensity={0.1} />
                        {/* Light positioned behind the mesh (mesh is at 0,0,0) */}
                        <pointLight position={[0, 0, -50]} intensity={1000} color="#ffaa55" distance={200} decay={2} />
                        <pointLight position={[0, 0, -20]} intensity={500} color="#ffffff" distance={100} decay={2} />

                        {/* Subtle front light to see surface texture */}
                        <directionalLight position={[10, 10, 50]} intensity={0.2} />
                    </>
                ) : (
                    <>
                        {/* Standard Mode: Good studio lighting to see the relief */}
                        <ambientLight intensity={0.5} />
                        <spotLight position={[50, 50, 50]} angle={0.15} penumbra={1} intensity={1000} castShadow />
                        <pointLight position={[-10, -10, -10]} intensity={500} />
                        <Environment preset="city" />
                    </>
                )}

                <Center>
                    <LithophaneMesh geometry={geometry} imageUrl={imageUrl} isBacklit={isBacklit} />
                </Center>
            </Canvas>
        </div>
    );
}
