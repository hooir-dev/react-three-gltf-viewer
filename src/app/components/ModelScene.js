"use client";

import {
  OrbitControls,
  useGLTF,
  PerspectiveCamera,
  useAnimations,
} from "@react-three/drei";
import { Suspense, useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { motion } from "framer-motion";

const Model = forwardRef(function Model({
  rotationX,
  rotationY,
  rotationZ,
  scale,
  position,
  config,
  onLoad,
  modelUrl,
  currentAnimation,
  isPlaying,
  onAnimationChange,
  onPlayingChange
}, ref) {
  const modelRef = useRef();
  const gltf = useGLTF(modelUrl);
  const { actions } = useAnimations(gltf.animations, modelRef);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasLoaded = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    hasLoaded.current = false;
    setIsVisible(false);
  }, [modelUrl]);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;

      gltf.scene.traverse((node) => {
        if (node.isMesh && node.material) {
          node.material.needsUpdate = true;
        }
      });

      let sceneSettings = null;

      if (gltf) {
        console.log("GLTF Data:", gltf);

        if (gltf.cameras?.[0]) {
          const camera = gltf.cameras[0];
          console.log("Camera data:", camera);

          camera.updateMatrixWorld();
          const position = new THREE.Vector3();
          const target = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();

          camera.getWorldPosition(position);
          camera.getWorldQuaternion(quaternion);
          const direction = new THREE.Vector3(0, 0, -1);
          direction.applyQuaternion(quaternion);
          target.copy(position).add(direction);

          sceneSettings = {
            camera: {
              position: [position.x, position.y, position.z],
              target: [target.x, target.y, target.z],
              fov: camera.fov,
              near: camera.near,
              far: camera.far,
              zoom: camera.zoom,
            },

            lights: gltf.scene.children
              .filter((child) => child.isLight || child.type.includes("Light"))
              .map((light) => ({
                type: light.type,
                intensity: light.intensity,
                position: [
                  light.position.x,
                  light.position.y,
                  light.position.z,
                ],
                color: light.color,
                distance: light.distance,
                decay: light.decay,
              })),

            scene: {
              background: gltf.scene.background,
              environment: gltf.scene.environment,
              fog: gltf.scene.fog,
            },

            animations: gltf.animations.map(anim => anim.name || '未命名动画')
          };

          console.log("Scene settings:", sceneSettings);
        }
      }

      if (!sceneSettings?.camera) {
        console.log("No camera found in model, using calculated position");
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = 50;
        const cameraDistance = maxDim / (2 * Math.tan((fov * Math.PI) / 360));

        const distance = cameraDistance * 1.2;
        const verticalAngle = Math.PI / 6;
        const horizontalAngle = (Math.PI * 3) / 4;

        const height = distance * Math.sin(verticalAngle);
        const radius = distance * Math.cos(verticalAngle);

        sceneSettings = {
          camera: {
            position: [
              radius * Math.cos(horizontalAngle),
              height,
              radius * Math.sin(horizontalAngle),
            ],
            target: [0, 0, 0],
            fov: fov,
          },
          lights: [],
          scene: {
            background: null,
            environment: null,
            fog: null,
          },
          animations: gltf.animations.map(anim => anim.name || '未命名动画')
        };

        gltf.scene.position.x = -center.x;
        gltf.scene.position.y = -center.y;
        gltf.scene.position.z = -center.z;
        console.log("sceneSettings", sceneSettings);
      }

      requestAnimationFrame(() => {
        onLoad(sceneSettings, () => {
          setIsVisible(true);
        });
      });
    }
  }, [gltf, onLoad, modelUrl]);

  useEffect(() => {
    if (gltf.scene) {
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          child.material.wireframe = config.wireframe;
          if (child.material.size !== undefined) {
            child.material.size = config.pointSize;
          }
        }
      });
    }
  }, [config.wireframe, config.pointSize, gltf.scene]);

  useEffect(() => {
    if (gltf.animations && gltf.animations.length > 0 && actions && !isInitialized) {
      console.log('Available animations:', gltf.animations);
      const firstAnimation = gltf.animations[0].name || '0';
      onAnimationChange(firstAnimation);
      onPlayingChange(true);
      setIsInitialized(true);

      if (actions[firstAnimation]) {
        const action = actions[firstAnimation];
        action.reset().play();
        action.setLoop(THREE.LoopRepeat);
      }
    }
  }, [gltf.animations, actions, isInitialized, onAnimationChange, onPlayingChange]);

  useEffect(() => {
    if (!actions || !isInitialized) return;

    console.log('Animation state change:', { currentAnimation, isPlaying, actions });

    if (currentAnimation && actions[currentAnimation]) {
      const action = actions[currentAnimation];

      if (isPlaying === 'playing') {
        action.paused = false;
        action.play();
      } else if (isPlaying === 'paused') {
        action.paused = true;
      } else if (isPlaying === 'stopped') {
        action.stop();
        action.reset();
      }
    }
  }, [actions, currentAnimation, isPlaying, isInitialized]);

  useEffect(() => {
    return () => {
      if (actions) {
        Object.values(actions).forEach((action) => {
          if (action && action.stop) {
            action.stop();
            action.reset();
            action.paused = true;
          }
        });
      }
    };
  }, [actions]);

  const hasSkeleton = (object) => {
    if (!object) {
      console.warn("No object provided to hasSkeleton check");
      return false;
    }

    let found = false;
    console.log("Checking skeleton for:", object);

    try {
      if (object.animations && object.animations.length > 0) {
        console.log("Found animations:", object.animations);
        found = true;
      }

      object.traverse((child) => {
        console.log("Child type:", child.type);

        if (child.type === "Bone" || child.type === "SkinnedMesh") {
          console.log("Found skeleton component:", child.type);
          found = true;
        }
        if (child.isBone || child.isSkinnedMesh) {
          console.log("Found skeleton component via is check:", child.type);
          found = true;
        }
        if (child.skeleton) {
          console.log("Found skeleton data:", child.skeleton);
          found = true;
        }
      });
    } catch (error) {
      console.error("Error checking for skeleton:", error);
      return false;
    }

    console.log("Has skeleton:", found);
    return found;
  };

  const handleProgress = (progress) => {
    if (currentAnimation && actions[currentAnimation]) {
      const action = actions[currentAnimation];
      const duration = action.getClip().duration;
      action.time = duration * progress;

      if (action.paused) {
        action.play();
        action.paused = true;
      }
    }
  };

  useImperativeHandle(ref, () => ({
    handleProgress,
    getDuration: () => {
      if (currentAnimation && actions[currentAnimation]) {
        return actions[currentAnimation].getClip().duration;
      }
      return 0;
    }
  }));

  if (!isVisible) {
    return null;
  }

  return (
    <group
      ref={modelRef}
      rotation={[
        THREE.MathUtils.degToRad(rotationX),
        THREE.MathUtils.degToRad(rotationY),
        THREE.MathUtils.degToRad(rotationZ),
      ]}
      position={position}
    >
      {config.grid && <gridHelper args={[10, 10, "red", "white"]} />}
      {config.skeleton && gltf.scene && <skeletonHelper args={[gltf.scene]} />}

      <primitive
        ref={modelRef}
        object={gltf.scene}
        scale={scale}
        style={{ cursor: "grab" }}
      />
    </group>
  );
});

const environments = [
  {
    id: "",
    name: "None",
    path: null,
  },
  {
    id: "neutral",
    name: "Neutral",
    path: null,
  },
  {
    id: "venice-sunset",
    name: "Venice Sunset",
    path: "/model/venice_sunset_1k.exr",
    format: ".exr",
  },
  {
    id: "footprint-court",
    name: "Footprint Court (HDR Labs)",
    path: "/model/footprint_court_2k.exr",
    format: ".exr",
  },
];

function Scene({ config }) {
  const { scene, gl } = useThree();

  useEffect(() => {
    if (config.background) {
      scene.background = new THREE.Color(config.bgColor);
    } else {
      scene.background = null;
    }

    const environment = environments.find(
      (env) => env.id === config.environment
    );

    if (environment) {
      if (environment.id === "neutral") {
        const pmremGenerator = new THREE.PMREMGenerator(gl);
        const roomEnvironment = new RoomEnvironment();
        const envMap = pmremGenerator.fromScene(roomEnvironment).texture;

        scene.environment = envMap;

        pmremGenerator.dispose();
        roomEnvironment.dispose();
      } else if (environment.path) {
        new EXRLoader().load(environment.path, (texture) => {
          const pmremGenerator = new THREE.PMREMGenerator(gl);
          const envMap = pmremGenerator.fromEquirectangular(texture).texture;

          scene.environment = envMap;

          texture.dispose();
          pmremGenerator.dispose();
        });
      } else {
        scene.environment = null;
      }
    }
  }, [config.background, config.bgColor, config.environment, scene, gl]);

  return null;
}

function PerformanceStatsUpdater({ stats }) {
  useFrame(() => {
    if (stats) {
      stats.update();
    }
  });

  return null;
}

function PerformanceStatsDisplay({ stats, setStats, showStats }) {
  const statsRef = useRef(null);

  useEffect(() => {
    if (showStats && !stats) {
      if (statsRef.current) {
        while (statsRef.current.firstChild) {
          statsRef.current.removeChild(statsRef.current.firstChild);
        }
      }

      const newStats = new Stats();

      newStats.dom.style.cssText = "position:relative;display:flex;flex-wrap:wrap;";
      newStats.dom.height = "48px";
      [].forEach.call(newStats.dom.children, (child) => {
        child.style.display = "";
      });

      if (statsRef.current) {
        statsRef.current.appendChild(newStats.dom);
        setStats(newStats);
      }
    } else if (!showStats && stats) {
      if (statsRef.current && stats.dom.parentNode === statsRef.current) {
        statsRef.current.removeChild(stats.dom);
      }
      setStats(null);
    }
  }, [showStats, stats, setStats]);

  return <div ref={statsRef} className="mt-2" />;
}

function NumericInput({ label, value, onChange, step = 1, unit = '', className = '' }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [inputText, setInputText] = useState(value.toString());
  const [isFocused, setIsFocused] = useState(false);

  const dragStateRef = useRef({
    startX: 0,
    startValue: 0,
    isDragging: false,
    lastX: 0,
    currentValue: value
  });
  const inputRef = useRef(null);
  useEffect(() => {
    if (!isFocused) {
      setInputText(value.toFixed(2));
    }
    dragStateRef.current.currentValue = value;
  }, [value, isFocused]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    dragStateRef.current = {
      startX: e.clientX,
      lastX: e.clientX,
      isDragging: true,
      currentValue: value
    };
    setIsDragging(true);
    setIsActive(true);
    document.body.style.cursor = 'ew-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  function handleMouseMove(e) {
    if (dragStateRef.current.isDragging) {
      const deltaX = dragStateRef.current.lastX - e.clientX;
      dragStateRef.current.lastX = e.clientX;
      const newValue = dragStateRef.current.currentValue - (deltaX * step * 0.1);
      dragStateRef.current.currentValue = newValue;
      onChange(newValue);
    }
  }

  function handleMouseUp() {
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setIsActive(false);
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  const handleInputBlur = () => {
    setIsActive(false);
    setIsFocused(false);

    const numValue = parseFloat(inputText) || 0;
    onChange(numValue);
  };

  const handleInputFocus = () => {
    setIsActive(true);
    setIsFocused(true);
  };

  return (
    <div className={`flex flex-1 overflow-hidden items-center px-2 py-1 ${className} bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.5)] text-[11px] ${isActive
      ? 'shadow-[inset_0_0_0_1px_rgb(43,153,255)]'
      : 'shadow-none'
      }`}
    >
      <div
        className="cursor-ew-resize pointer-events-auto text-nowrap px-0 leading-4 pr-[2px] text-center text-[rgb(43,153,255)] select-none opacity-60 capitalize"
        onMouseDown={handleMouseDown}
      >{label}</div>

      <input
        ref={inputRef}
        type="text"
        value={isFocused ? inputText : Number(value).toFixed(2)}
        onChange={(e) => {
          setInputText(e.target.value);
        }}
        onBlur={handleInputBlur}
        onFocus={handleInputFocus}
        className={`w-full bg-transparent focus:outline-none`}
        step={step}
      />

      {/* <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
        {unit}
      </span> */}
    </div>
  );
}

export default function ModelScene() {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [sceneSettings, setSceneSettings] = useState({
    camera: {
      position: [-3.5, 3, 3.5],
      rotation: [0, 0, 0],
      zoom: 1,
      target: [0, 0, 0],
      fov: 50,
      near: 0.1,
      far: 1000,
    },
  });

  const cameraRef = useRef();
  const controlsRef = useRef();
  const step = 0.1;
  const posStep = 0.1;
  const zoomStep = 0.1;
  const [isShow, setIsShow] = useState(true);
  const [scale, setScale] = useState(1);
  const scaleStep = 0.1;
  const [modelUrl, setModelUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Update configuration state, modify default background color
  const [config, setConfig] = useState({
    // Display settings
    background: true, // Default display background
    autoRotate: false,
    wireframe: false,
    skeleton: false,
    grid: false,
    screenSpacePanning: true,
    pointSize: 1,
    bgColor: "#2f2f2f", // Change default background color to #2f2f2f

    // Lighting settings
    environment: "Neutral",
    toneMapping: "Linear",
    exposure: 0,
    punctualLights: true,
    ambientIntensity: 0.3,
    ambientColor: "#ffffff",
    directIntensity: 2.5,
    directColor: "#ffffff",

    // Performance settings
    shadows: false,
    kiosk: false,
    showStats: true,
    showDebug: false,
  });

  // Update configuration handler function
  const handleConfigChange = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Animation related states
  const [animations, setAnimations] = useState([]);
  const [currentAnimation, setCurrentAnimation] = useState(null);
  const [isPlaying, setIsPlaying] = useState('playing'); // 'playing' | 'paused' | 'stopped'

  // Add controller enable state
  const [orbitControlsEnabled, setOrbitControlsEnabled] = useState(true);

  // Modify model loading handler function
  const handleModelLoad = (settings, onComplete) => {
    console.log(settings, 'settings')
    if (settings?.camera) {
      setSceneSettings({
        ...sceneSettings,
        camera: {
          ...sceneSettings.camera,
          ...settings.camera,
        },
      });

      requestAnimationFrame(() => {
        if (controlsRef.current) {
          const camera = controlsRef.current.object;
          camera.position.set(...settings.camera.position);
          camera.updateProjectionMatrix();

          controlsRef.current.target.set(
            ...(settings.camera.target || [0, 0, 0])
          );
          controlsRef.current.update();

          // Call callback after camera update is complete
          if (onComplete) {
            onComplete();
          }
        }
      });
    }

    // Check and set animation list
    if (settings?.animations) {
      console.log('Setting animations:', settings.animations);
      setAnimations(settings.animations);
    }
  };

  // Camera control function
  const updateCamera = (updates) => {
    setSceneSettings(prev => {
      // Handle numerical precision issues
      const processedUpdates = { ...updates };

      // Round rotation angles
      if (processedUpdates.rotation) {
        processedUpdates.rotation = processedUpdates.rotation.map(val =>
          Math.round(val * 100) / 100
        );
      }

      // Round position values
      if (processedUpdates.position) {
        processedUpdates.position = processedUpdates.position.map(val =>
          Math.round(val * 100) / 100
        );
      }

      return {
        ...prev,
        camera: {
          ...prev.camera,
          ...processedUpdates
        }
      };
    });
  };

  // Add drag and drop handler functions
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.glb')) {
        const objectUrl = URL.createObjectURL(file);
        setModelUrl(objectUrl);
      }
    }
  };

  // File upload handler function
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Create a temporary URL
      const objectUrl = URL.createObjectURL(file);
      setModelUrl(objectUrl);

      // Clean up previous URL
      return () => URL.revokeObjectURL(objectUrl);
    }
  };

  const [stats, setStats] = useState(null);
  const controlPanelRef = useRef(null);
  const [controlPanelHeight, setControlPanelHeight] = useState(0);
  const modelRef = useRef();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (controlPanelRef.current) {
      setControlPanelHeight(controlPanelRef.current.scrollHeight);
    }
  }, []);

  // Handle progress bar changes
  const handleProgressChange = (value) => {
    setProgress(value);
    if (modelRef.current) {
      modelRef.current.handleProgress(value);
    }
  };

  // Handle mouse wheel events
  const handleWheel = (e) => {
    if (currentAnimation) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.01 : 0.01;
      const newProgress = Math.max(0, Math.min(1, progress + delta));
      handleProgressChange(newProgress);
    }
  };

  // Simplified camera rotation handler function - only controls rotation, no other automatic adjustments
  const handleCameraRotation = (rotationValues) => {
    // Disable OrbitControls to prevent interference
    setOrbitControlsEnabled(false);

    // Important: Update state to ensure UI syncs with actual camera state
    updateCamera({ rotation: rotationValues });

    if (cameraRef.current) {
      // Save current camera position
      const currentPosition = cameraRef.current.position.clone();
      console.log('Current', cameraRef.current.rotation)
      console.log("New", THREE.MathUtils.degToRad(rotationValues[0]), THREE.MathUtils.degToRad(rotationValues[1]), THREE.MathUtils.degToRad(rotationValues[2]))

      // Set precise rotation angles
      cameraRef.current.rotation.set(
        THREE.MathUtils.degToRad(rotationValues[0]),
        THREE.MathUtils.degToRad(rotationValues[1]),
        THREE.MathUtils.degToRad(rotationValues[2])
      );

      // Important: Ensure position remains unchanged (rotation usually affects position calculation)
      cameraRef.current.position.copy(currentPosition);

      // Important: Update projection matrix, apply changes
      cameraRef.current.updateProjectionMatrix();
      // if (controlsRef.current) {
      //   controlsRef.current.update();
      // }

      console.log('camera rotation updated to:', rotationValues, 'actual rotation:', [
        THREE.MathUtils.radToDeg(cameraRef.current.rotation.x),
        THREE.MathUtils.radToDeg(cameraRef.current.rotation.y),
        THREE.MathUtils.radToDeg(cameraRef.current.rotation.z)
      ]);
    }
  };

  // Modify handleTargetChange function to only change target point without affecting camera rotation
  const handleTargetChange = (targetValues) => {
    // Disable OrbitControls to prevent interference
    setOrbitControlsEnabled(false);

    // Only update target point state, do not calculate camera rotation
    updateCamera({ target: targetValues });

    if (controlsRef.current) {
      controlsRef.current.target.set(targetValues[0], targetValues[1], targetValues[2]);
      controlsRef.current.update();
    }
  };
  const handlePositionChange = (positionValues) => {
    setOrbitControlsEnabled(false);
    updateCamera({ position: positionValues });

    if (cameraRef.current) {
      cameraRef.current.position.set(positionValues[0], positionValues[1], positionValues[2]);
      cameraRef.current.updateProjectionMatrix();
    }
  };

  // Add a button handler function for manually toggling OrbitControls
  const toggleOrbitControls = () => {
    setOrbitControlsEnabled(prev => !prev);
  };

  // Fix event listening logic in useEffect
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Set the enabled state of the controller
    controls.enabled = orbitControlsEnabled;

    // If controls are disabled, we should prevent it from affecting the camera
    if (!orbitControlsEnabled) {
      // Disable all controller features
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.enableRotate = false;
      controls.enabled = false;
      controls.update();
      return;
    } else {
      // Re-enable controller features
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.enableRotate = true && !config.kiosk;
      controls.enabled = true;
      controls.update();
    }
    const handleChange = () => {
      if (!cameraRef.current || !orbitControlsEnabled) return;

      const camera = cameraRef.current;
      const position = camera.position.clone();
      const rotation = camera.rotation.clone();
      const target = controls.target.clone();
      // const lookDirection = new THREE.Vector3();
      // lookDirection.subVectors(target, position).normalize();

      // const euler = new THREE.Euler(0, 0, 0, 'XYZ');
      // euler.y = Math.atan2(lookDirection.x, lookDirection.z);
      // euler.x = Math.atan2(
      //   -lookDirection.y,
      //   Math.sqrt(lookDirection.x * lookDirection.x + lookDirection.z * lookDirection.z)
      // );

      const rotationDeg = [
        THREE.MathUtils.radToDeg(rotation.x),
        THREE.MathUtils.radToDeg(rotation.y),
        THREE.MathUtils.radToDeg(rotation.z)
      ];
      setSceneSettings(prev => ({
        ...prev,
        camera: {
          ...prev.camera,
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z],
          rotation: rotationDeg
        }
      }));
    };

    controls.addEventListener('change', handleChange);
    return () => {
      controls.removeEventListener('change', handleChange);
    };
  }, [controlsRef.current, orbitControlsEnabled, config.kiosk]);
  useEffect(() => {
    console.log("检查相机状态", {
      cameraRef: !!cameraRef.current,
      controlsRef: !!controlsRef.current
    });
    if (!cameraRef.current || !controlsRef.current) {
      return;
    }

    console.log("开始初始化相机状态");

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const position = camera.position.clone();
    const rotation = camera.rotation.clone();
    const target = controls.target.clone();
    // const lookDirection = new THREE.Vector3();
    // lookDirection.subVectors(target, position).normalize();
    // const euler = new THREE.Euler(0, 0, 0, 'XYZ');
    // euler.y = Math.atan2(lookDirection.x, lookDirection.z);
    // euler.x = Math.atan2(
    //   -lookDirection.y,
    //   Math.sqrt(lookDirection.x * lookDirection.x + lookDirection.z * lookDirection.z)
    // );


    const rotationDeg = [
      THREE.MathUtils.radToDeg(rotation.x),
      THREE.MathUtils.radToDeg(rotation.y),
      THREE.MathUtils.radToDeg(rotation.z)
    ];

    setSceneSettings(prev => ({
      ...prev,
      camera: {
        ...prev.camera,
        position: [position.x, position.y, position.z],
        target: [target.x, target.y, target.z],
        rotation: rotationDeg
      }
    }));

    console.log('camera init', {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      rotation: rotationDeg
    });
  }, [cameraRef.current, controlsRef.current]); // 依赖于相机和控制器引用

  // 添加一个"重新定位相机"按钮的功能
  const resetCameraToViewTarget = () => {
    if (!cameraRef.current || !controlsRef.current) return;

    // Get current target point
    const target = controlsRef.current.target.clone();

    // Keep current distance or set a reasonable distance
    const currentDistance = cameraRef.current.position.distanceTo(target);
    const distance = currentDistance > 0 ? currentDistance : 10;

    // Set a default perspective
    const defaultRotation = [0, 0, 0]; // Can be adjusted as needed

    // Calculate new position
    const position = [
      Math.round((target.x + 0) * 100) / 100,
      Math.round((target.y + distance * 0.5) * 100) / 100,
      Math.round((target.z + distance) * 100) / 100
    ];

    // Update camera
    updateCamera({
      position,
      rotation: defaultRotation
    });

    // Set camera
    cameraRef.current.position.set(position[0], position[1], position[2]);
    cameraRef.current.lookAt(target);
    cameraRef.current.updateProjectionMatrix();
    const rotation = cameraRef.current.rotation.clone();

    // Convert to degrees
    const rotationDeg = [
      THREE.MathUtils.radToDeg(rotation.x),
      THREE.MathUtils.radToDeg(rotation.y),
      THREE.MathUtils.radToDeg(rotation.z)
    ];

    updateCamera({
      rotation: rotationDeg
    });

    // Re-enable controller
    setOrbitControlsEnabled(true);

    console.log("Camera has been reset to observe target");
  };

  const [showCameraInfo, setShowCameraInfo] = useState(false);
  const [cameraInfo, setCameraInfo] = useState({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    actualRotation: [0, 0, 0]
  });

  const getCameraData = () => {
    if (!cameraRef.current || !controlsRef.current) return;

    const position = cameraRef.current.position;
    const rotation = cameraRef.current.rotation;
    setCameraInfo({
      position: [position.x, position.y, position.z],
      rotation: sceneSettings.camera.rotation || [0, 0, 0],
      actualRotation: [
        THREE.MathUtils.radToDeg(rotation.x),
        THREE.MathUtils.radToDeg(rotation.y),
        THREE.MathUtils.radToDeg(rotation.z)
      ]
    });

    setShowCameraInfo(true);
  };

  return (
    <div className="relative w-full h-full flex justify-center items-start bg-[#232323]">
      <div className="w-full h-full">
        {!modelUrl ? (
          // Display upload area when no model is loaded
          <div
            className={`w-full h-full flex flex-col justify-center items-center ${isDragging ? 'bg-[#1a1a1a]' : 'bg-[#121316]'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={`p-8 rounded-xl border-2 border-dashed ${isDragging ? 'border-[rgb(43,153,255)] bg-[rgba(43,153,255,0.05)]' : 'border-white/20'} flex flex-col items-center transition-all duration-200`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-white/60 text-lg mb-2">Drag GLB file here</p>
              <p className="text-white/40 text-sm mb-4">or</p>
              <label className="px-4 py-2 bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.7)] text-sm cursor-pointer hover:bg-[rgba(255,255,255,0.1)] transition-all duration-200">
                Choose File
                <input
                  type="file"
                  accept=".glb"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        ) : (
          // 当有模型时显示 Canvas
          <Canvas
            shadows={config.shadows}
            gl={{
              preserveDrawingBuffer: true,
              toneMapping: THREE[`${config.toneMapping}ToneMapping`],
              outputColorSpace: THREE.SRGBColorSpace,
              antialias: true,
              alpha: true,
            }}
            className="bg-[#121316]"
            onCreated={({ gl, scene }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.physicallyCorrectLights = config.punctualLights;
              gl.toneMappingExposure = Math.pow(2, config.exposure);

              // 设置场景背景为默认颜色
              scene.background = new THREE.Color(0x2f2f2f);

              // 创建 PMREMGenerator
              const pmremGenerator = new THREE.PMREMGenerator(gl);

              // 使用 THREE.RoomEnvironment 作为中性环境
              const roomEnvironment = new RoomEnvironment();
              const envMap = pmremGenerator.fromScene(roomEnvironment).texture;
              scene.environment = envMap;

              pmremGenerator.dispose();
              roomEnvironment.dispose();
            }}
          >
            <Suspense fallback={null}>
              <Scene config={config} />
              <PerformanceStatsUpdater stats={stats} />
              <PerspectiveCamera
                ref={cameraRef}
                makeDefault
                position={sceneSettings.camera.position}
                rotation={
                  sceneSettings.camera.rotation?.map((r) =>
                    THREE.MathUtils.degToRad(r)
                  ) || [0, 0, 0]
                }
                fov={sceneSettings.camera.fov}
                near={sceneSettings.camera.near}
                far={sceneSettings.camera.far}
                zoom={sceneSettings.camera.zoom}
              />

              <ambientLight
                intensity={config.ambientIntensity}
                color={config.ambientColor}
              />
              <directionalLight
                position={[1, 2, -1]}
                intensity={config.directIntensity}
                color={config.directColor}
                castShadow={config.shadows}
              />

              <Model
                ref={modelRef}
                rotationX={rotation.x}
                rotationY={rotation.y}
                rotationZ={rotation.z}
                scale={scale}
                position={[position.x, position.y, position.z]}
                config={config}
                onLoad={handleModelLoad}
                modelUrl={modelUrl}
                currentAnimation={currentAnimation}
                isPlaying={isPlaying}
                onAnimationChange={setCurrentAnimation}
                onPlayingChange={setIsPlaying}
              />

              <OrbitControls
                ref={controlsRef}
                camera={cameraRef.current}
                enablePan={orbitControlsEnabled}
                enableZoom={orbitControlsEnabled}
                enableRotate={orbitControlsEnabled && !config.kiosk}
                autoRotate={config.autoRotate && orbitControlsEnabled}
                screenSpacePanning={config.screenSpacePanning}
                minDistance={5}
                maxDistance={10}
                dampingFactor={0.05}
                rotateSpeed={0.5}
                up={[0, 1, 0]}
                enableDamping={orbitControlsEnabled}
                target={new THREE.Vector3(...sceneSettings.camera.target)}
              />
            </Suspense>
          </Canvas>
        )}
      </div>

      <motion.div
        initial={false}
        animate={{
          x: isShow ? 0 : "100%",
          opacity: isShow ? 1 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
        className="fixed top-4 bottom-4 right-4 z-[8] flex flex-col bg-[#121316]/95 backdrop-blur-[32px] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)] select-none overflow-hidden"
        style={{ width: '280px' }}
      >
        <div ref={controlPanelRef} className="w-full h-full flex flex-col">
          {/* Top fixed area */}
          <div className="w-full p-4 border-b border-white/5">
            <div className="space-y-2 mt-2">
              <label className="flex flex-col items-center px-4 py-2 bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.5)] text-[11px] text-white cursor-pointer hover:bg-[rgba(255,255,255,0.03)]">
                <span>Choose File</span>
                <input
                  type="file"
                  accept=".glb"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {modelUrl && (
                <button
                  onClick={() => setModelUrl(null)}
                  className="w-full mt-2 px-4 py-2 bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.5)] text-[11px] hover:bg-[rgba(255,0,0,0.2)]"
                >
                  Remove Model
                </button>
              )}
            </div>
          </div>

          {/* Scrollable area */}
          <div className="w-full flex-1 overflow-y-auto overflow-x-hidden">
            {/* Add a button to toggle OrbitControls enabled state */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={orbitControlsEnabled}
                  onChange={toggleOrbitControls}
                  className="mr-2"
                />
                Enable Mouse Control
              </label>
            </div>

            {/* Model control */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <h3 className="mb-3 font-semibold leading-4 tracking-[.01em] text-[rgba(255,255,255,0.9)] text-[11px]">Model</h3>
              <div className="w-full flex gap-1">
                <NumericInput
                  label="S"
                  value={scale}
                  onChange={(value) => setScale(Math.max(0.1, value))}
                  step={0.1}
                  unit="x"
                />
                <NumericInput
                  label="X"
                  value={rotation.x}
                  onChange={(value) => setRotation(prev => ({ ...prev, x: value }))}
                  step={1}
                  unit="°"
                />
                <NumericInput
                  label="Y"
                  value={rotation.y}
                  onChange={(value) => setRotation(prev => ({ ...prev, y: value }))}
                  step={1}
                  unit="°"
                />
                <NumericInput
                  label="Z"
                  value={rotation.z}
                  onChange={(value) => setRotation(prev => ({ ...prev, z: value }))}
                  step={1}
                  unit="°"
                />
              </div>

              {/* Add position control */}
              <div className="w-full flex gap-1 mt-2">
                <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">position</div>
                <NumericInput
                  label="X"
                  value={position.x}
                  onChange={(value) => setPosition(prev => ({ ...prev, x: value }))}
                  step={0.1}
                />
                <NumericInput
                  label="Y"
                  value={position.y}
                  onChange={(value) => setPosition(prev => ({ ...prev, y: value }))}
                  step={0.1}
                />
                <NumericInput
                  label="Z"
                  value={position.z}
                  onChange={(value) => setPosition(prev => ({ ...prev, z: value }))}
                  step={0.1}
                />
              </div>
            </div>

            {/* Camera control */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <h3 className="mb-3 font-semibold leading-4 tracking-[.01em] text-[rgba(255,255,255,0.9)] text-[11px]">Camera</h3>
              <div className="w-full flex flex-col gap-1">
                <div className="w-full flex gap-1">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Position</div>
                  <NumericInput
                    label="X"
                    value={sceneSettings.camera.position[0]}
                    onChange={(value) => {
                      const newPosition = [...sceneSettings.camera.position];
                      newPosition[0] = value;
                      handlePositionChange(newPosition);
                    }}
                    step={posStep}
                  />
                  <NumericInput
                    label="Y"
                    value={sceneSettings.camera.position[1]}
                    onChange={(value) => {
                      const newPosition = [...sceneSettings.camera.position];
                      newPosition[1] = value;
                      handlePositionChange(newPosition);
                    }}
                    step={posStep}
                  />
                  <NumericInput
                    label="Z"
                    value={sceneSettings.camera.position[2]}
                    onChange={(value) => {
                      const newPosition = [...sceneSettings.camera.position];
                      newPosition[2] = value;
                      handlePositionChange(newPosition);
                    }}
                    step={posStep}
                  />
                </div>

                <div className="w-full flex gap-1">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Rotation</div>
                  <NumericInput
                    label="X"
                    value={sceneSettings.camera.rotation?.[0] || 0}
                    onChange={(value) => {
                      const newRotation = [...(sceneSettings.camera.rotation || [0, 0, 0])];
                      newRotation[0] = value;
                      handleCameraRotation(newRotation);
                    }}
                    step={step}
                    unit="°"
                  />
                  <NumericInput
                    label="Y"
                    value={sceneSettings.camera.rotation?.[1] || 0}
                    onChange={(value) => {
                      const newRotation = [...(sceneSettings.camera.rotation || [0, 0, 0])];
                      newRotation[1] = value;
                      handleCameraRotation(newRotation);
                    }}
                    step={step}
                    unit="°"
                  />
                  <NumericInput
                    label="Z"
                    value={sceneSettings.camera.rotation?.[2] || 0}
                    onChange={(value) => {
                      const newRotation = [...(sceneSettings.camera.rotation || [0, 0, 0])];
                      newRotation[2] = value;
                      handleCameraRotation(newRotation);
                    }}
                    step={step}
                    unit="°"
                  />
                </div>

                <div className="w-full flex gap-1">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Target</div>
                  <NumericInput
                    label="X"
                    value={sceneSettings.camera.target?.[0] || 0}
                    onChange={(value) => {
                      const newTarget = [...(sceneSettings.camera.target || [0, 0, 0])];
                      newTarget[0] = value;
                      handleTargetChange(newTarget);
                    }}
                    step={posStep}
                  />
                  <NumericInput
                    label="Y"
                    value={sceneSettings.camera.target?.[1] || 0}
                    onChange={(value) => {
                      const newTarget = [...(sceneSettings.camera.target || [0, 0, 0])];
                      newTarget[1] = value;
                      handleTargetChange(newTarget);
                    }}
                    step={posStep}
                  />
                  <NumericInput
                    label="Z"
                    value={sceneSettings.camera.target?.[2] || 0}
                    onChange={(value) => {
                      const newTarget = [...(sceneSettings.camera.target || [0, 0, 0])];
                      newTarget[2] = value;
                      handleTargetChange(newTarget);
                    }}
                    step={posStep}
                  />
                </div>
              </div>
              {/* Add reset button in camera control panel */}
              <div className="w-full flex gap-1 mt-2">
                <button
                  onClick={resetCameraToViewTarget}
                  className="w-full px-2 py-1 text-[11px] bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.6)] leading-4 hover:bg-[rgb(43,153,255)] hover:text-white"
                >
                  Reset Camera View
                </button>

                <button
                  onClick={getCameraData}
                  className="w-full px-2 py-1 text-[11px] bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.6)] leading-4 hover:bg-[rgb(43,153,255)] hover:text-white"
                >
                  View Camera Parameters
                </button>
              </div>
            </div>

            {/* Debug toggle */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={config.showDebug}
                  onChange={(e) => handleConfigChange("showDebug", e.target.checked)}
                  className="mr-2"
                />
                Show Debug Information
              </label>

              {/* Debug information */}
              {config.showDebug && (
                <div className="p-4 text-[rgba(255,255,255,0.6)] text-[11px]">
                  <div>Camera Position: {sceneSettings.camera.position.map(p => p.toFixed(2)).join(', ')}</div>
                  <div>Camera Rotation: {sceneSettings.camera.rotation.map(r => r.toFixed(2)).join(', ')}°</div>
                  <div>Target Point: {sceneSettings.camera.target.map(t => t.toFixed(2)).join(', ')}</div>
                  <div>Orbit Controls Enabled: {orbitControlsEnabled ? 'Yes' : 'No'}</div>
                </div>
              )}
            </div>

            {/* Lighting settings */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <h3 className="mb-3 font-semibold leading-4 tracking-[.01em] text-[rgba(255,255,255,0.9)] text-[11px]">Lighting</h3>
              <div className="w-full space-y-4">
                <div className="flex">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Environment</div>
                  <select
                    value={config.environment}
                    onChange={(e) => handleConfigChange("environment", e.target.value)}
                    className="flex-1 w-full py-1 px-2 text-[11px] rounded bg-[rgba(255,255,255,0.05)] text-white/60 border border-white/10 focus:outline-none focus:border-[rgb(43,153,255)]"
                  >
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Tone Mapping</div>
                  <select
                    value={config.toneMapping}
                    onChange={(e) => handleConfigChange("toneMapping", e.target.value)}
                    className="flex-1 w-full py-1 px-2 text-[11px] rounded bg-[rgba(255,255,255,0.05)] text-white/60 border border-white/10 focus:outline-none focus:border-[rgb(43,153,255)]"
                  >
                    <option value="Linear">Linear</option>
                    <option value="Reinhard">Reinhard</option>
                    <option value="Cineon">Cineon</option>
                    <option value="ACESFilmic">ACESFilmic</option>
                  </select>
                </div>

                <div className="flex">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Ambient</div>
                  <div className="flex-1 w-full">
                    <NumericInput
                      label="N"
                      value={config.ambientIntensity}
                      onChange={(value) => handleConfigChange("ambientIntensity", value)}
                      step={0.1}
                    />
                  </div>
                </div>

                <div className="flex justify-between">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">ambientColor</div>
                  <input
                    type="color"
                    value={config.ambientColor}
                    onChange={(e) => handleConfigChange("ambientColor", e.target.value)}
                    className="h-8 rounded bg-[rgba(255,255,255,0.05)] border border-white/10"
                  />
                </div>

                <div className="flex">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Direct</div>
                  <div className="flex-1 w-full">
                    <NumericInput
                      label="N"
                      value={config.directIntensity}
                      onChange={(value) => handleConfigChange("directIntensity", value)}
                      step={0.1}
                      min={0}
                      max={5}
                    />
                  </div>

                </div>

                <div className="flex justify-between">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">directColor</div>
                  <input
                    type="color"
                    value={config.directColor}
                    onChange={(e) => handleConfigChange("directColor", e.target.value)}
                    className="h-8 rounded bg-[rgba(255,255,255,0.05)] border border-white/10"
                  />
                </div>

                <div className="flex">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Exposure</div>
                  <div className="flex-1 w-full">
                    <NumericInput
                      label="N"
                      value={config.exposure}
                      onChange={(value) => handleConfigChange("exposure", value)}
                      step={0.1}
                      min={-10}
                      max={10}
                    />
                  </div>
                </div>

                <div className="flex">
                  <div className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">Shadows</div>
                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap max-w-[80px] min-w-[80px]">
                    <input
                      type="checkbox"
                      checked={config.shadows}
                      onChange={(e) => handleConfigChange("shadows", e.target.checked)}
                      className="mr-2 rounded border-white/10 bg-[rgba(255,255,255,0.05)]"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Display settings */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <h3 className="mb-3 font-semibold leading-4 tracking-[.01em] text-[rgba(255,255,255,0.9)] text-[11px]">Display</h3>
              <div className="w-full flex flex-col gap-1">
                <div className="space-y-2">
                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={config.background}
                      onChange={(e) =>
                        handleConfigChange("background", e.target.checked)
                      }
                      className="mr-2"
                    />
                    Background
                  </label>

                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={config.autoRotate}
                      onChange={(e) =>
                        handleConfigChange("autoRotate", e.target.checked)
                      }
                      className="mr-2"
                    />
                    Auto Rotate
                  </label>

                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={config.wireframe}
                      onChange={(e) =>
                        handleConfigChange("wireframe", e.target.checked)
                      }
                      className="mr-2"
                    />
                    Wireframe
                  </label>

                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={config.skeleton}
                      onChange={(e) =>
                        handleConfigChange("skeleton", e.target.checked)
                      }
                      className="mr-2"
                    />
                    Skeleton
                  </label>

                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={config.grid}
                      onChange={(e) =>
                        handleConfigChange("grid", e.target.checked)
                      }
                      className="mr-2"
                    />
                    Grid
                  </label>

                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={config.screenSpacePanning}
                      onChange={(e) =>
                        handleConfigChange(
                          "screenSpacePanning",
                          e.target.checked
                        )
                      }
                      className="mr-2"
                    />
                    Screen Space Panning
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">Point Size: {config.pointSize}</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={config.pointSize}
                    onChange={(e) =>
                      handleConfigChange("pointSize", parseInt(e.target.value))
                    }
                    className="w-full"
                  />
                </div>

                <div className="space-y-2 flex justify-between">
                  <label className="flex items-center text-[11px] text-[rgba(255,255,255,0.6)] overflow-hidden truncate whitespace-nowrap">Background Color:</label>
                  <input
                    type="color"
                    value={config.bgColor}
                    onChange={(e) =>
                      handleConfigChange("bgColor", e.target.value)
                    }
                    className="h-8 rounded bg-[rgba(255,255,255,0.05)] border border-white/10"
                  />
                </div>
              </div>
            </div>

            {/* Performance monitoring */}
            <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
              <h3 className="mb-3 font-semibold leading-4 tracking-[.01em] text-[rgba(255,255,255,0.9)] text-[11px]">Performance</h3>
              <div className="w-full flex gap-1">
                <PerformanceStatsDisplay
                  stats={stats}
                  setStats={setStats}
                  showStats={config.showStats}
                />
              </div>
            </div>

            {/* Animation control */}
            {animations.length > 0 && (
              <div className="p-4 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.05)] last:border-b-0 relative">
                <h3 className="mb-3 font-semibold leading-4 tracking-[.01em] text-[rgba(255,255,255,0.9)] text-[11px]">Animation Control</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <select
                      value={currentAnimation || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCurrentAnimation(value);
                        setIsPlaying(value ? 'playing' : 'stopped');
                        console.log('Animation selection changed:', value);
                      }}
                      className="flex-1 w-full py-1 px-2 text-[11px] rounded bg-[rgba(255,255,255,0.05)] text-white/60 border border-white/10 focus:outline-none focus:border-[rgb(43,153,255)]"
                    >
                      <option value="">No Animation</option>
                      {animations.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>

                    {/* Animation control button group */}
                    {currentAnimation && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setIsPlaying('playing')}
                          className={`flex-1 px-2 py-1 h-6 text-[11px] bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.6)] leading-4 relative flex w-full justify-center items-center ${isPlaying === 'playing'
                            ? 'bg-[rgb(43,153,255)] text-white'
                            : 'hover:bg-[rgb(43,153,255)] hover:text-white'
                            }`}
                        >
                          Play
                        </button>
                        <button
                          onClick={() => setIsPlaying('paused')}
                          className={`flex-1 px-2 py-1 h-6 text-[11px] bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.6)] leading-4 relative flex w-full justify-center items-center ${isPlaying === 'paused'
                            ? 'bg-[rgb(43,153,255)] text-white'
                            : 'hover:bg-[rgb(43,153,255)] hover:text-white'
                            }`}
                        >
                          Pause
                        </button>
                        <button
                          onClick={() => setIsPlaying('stopped')}
                          className={`flex-1 px-2 py-1 h-6 text-[11px] bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.6)] leading-4 relative flex w-full justify-center items-center ${isPlaying === 'stopped'
                            ? 'bg-[rgb(43,153,255)] text-white'
                            : 'hover:bg-[rgb(43,153,255)] hover:text-white'
                            }`}
                        >
                          Stop
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Add progress control */}
                  {currentAnimation && (
                    <div className="flex items-center"
                      onWheel={handleWheel}
                    >
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.001"
                        value={progress}
                        onChange={(e) => handleProgressChange(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="text-sm text-gray-500 text-center min-w-[80px]">
                        {(progress * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 添加固定位置的 GitHub 链接 */}
      <a
        href="https://github.com/hooir-dev/react-three-gltf-viewer"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 left-4 text-[rgba(255,255,255,0.4)] text-sm hover:text-[rgba(255,255,255,0.6)] transition-colors duration-200 flex items-center gap-2 z-10"
      >
        <svg height="20" width="20" viewBox="0 0 16 16" className="fill-current">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        View on GitHub
      </a>

      {/* 相机信息弹窗 */}
      {showCameraInfo && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setShowCameraInfo(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 !-translate-x-1/2 !-translate-y-1/2 z-50 bg-[#121316] p-6 rounded-xl shadow-lg border border-white/5 text-white max-w-lg w-full m-4"
            style={{ maxHeight: '80vh', overflowY: 'auto' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Camera Parameters</h3>
              <button
                onClick={() => setShowCameraInfo(false)}
                className="text-white/50 hover:text-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <h4 className="font-medium text-white/70">Position:</h4>
                <pre className="bg-[rgba(255,255,255,0.05)] p-2 rounded font-mono overflow-x-auto">
                  X: {cameraInfo.position[0].toFixed(4)},
                  Y: {cameraInfo.position[1].toFixed(4)},
                  Z: {cameraInfo.position[2].toFixed(4)}
                </pre>
              </div>

              <div className="space-y-1">
                <h4 className="font-medium text-white/70">UI Rotation (degrees):</h4>
                <pre className="bg-[rgba(255,255,255,0.05)] p-2 rounded font-mono overflow-x-auto">
                  X: {cameraInfo.rotation[0].toFixed(4)}°,
                  Y: {cameraInfo.rotation[1].toFixed(4)}°,
                  Z: {cameraInfo.rotation[2].toFixed(4)}°
                </pre>
              </div>

              <div className="space-y-1">
                <h4 className="font-medium text-white/70">Actual Rotation (degrees):</h4>
                <pre className="bg-[rgba(255,255,255,0.05)] p-2 rounded font-mono overflow-x-auto">
                  X: {cameraInfo.actualRotation[0].toFixed(4)}°,
                  Y: {cameraInfo.actualRotation[1].toFixed(4)}°,
                  Z: {cameraInfo.actualRotation[2].toFixed(4)}°
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowCameraInfo(false)}
                className="px-4 py-2 bg-[rgba(255,255,255,0.05)] rounded-lg text-[rgba(255,255,255,0.6)] text-sm hover:bg-[rgb(43,153,255)] hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
