'use client';

import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Settings, Cpu, Cable, Zap, CircuitBoard, Usb, 
  TerminalSquare, Box, Component, MonitorDot, Database, Rocket,
  Brain, Microchip, ShieldAlert, Sparkles, Code2, Layers, CheckCircle2
} from 'lucide-react';

import { PricingSection } from '@/components/PricingSection';

// 3D Particle Wave
function ParticleWave() {
  const count = 3000;
  
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    
    const colorA = new THREE.Color('#eab308'); // Yellow
    const colorB = new THREE.Color('#22c55e'); // Green
    const colorC = new THREE.Color('#f97316'); // Orange

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - (2 * i) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      
      const radius = 6;
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      
      const tempColor = new THREE.Color();
      const t1 = (x + radius) / (radius * 2);
      const t2 = (y + radius) / (radius * 2);
      
      tempColor.lerpColors(colorA, colorB, t1);
      tempColor.lerp(colorC, t2);
      
      cols[i * 3] = tempColor.r;
      cols[i * 3 + 1] = tempColor.g;
      cols[i * 3 + 2] = tempColor.b;
    }
    return { positions: pos, colors: cols };
  }, []);

  const pointsRef = useRef<THREE.Points>(null);
  
  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.03;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.05;
    }
  });

  return (
    <points ref={pointsRef} position={[-4, 0, -2]}>
      <bufferGeometry>
        {/* @ts-ignore */}
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        {/* @ts-ignore */}
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial 
        size={0.06} 
        vertexColors 
        transparent 
        opacity={0.8} 
        sizeAttenuation={true} 
      />
    </points>
  );
}

// Custom typing animation component with adjustable speed
function TypingText({ text, as: Component = "div", className = "", delaySpeed = 0.1, duration = 0.4 }: { text: string, as?: any, className?: string, delaySpeed?: number, duration?: number }) {
  const words = text.split(" ");
  
  return (
    <Component className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: duration, delay: i * delaySpeed }}
          className="inline-block"
        >
          {word}&nbsp;
        </motion.span>
      ))}
      <motion.span 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: words.length * delaySpeed, duration: 0.2 }}
        className="inline-block w-[3px] h-[0.9em] ml-1 rounded-sm bg-gradient-to-b from-yellow-500 via-green-500 to-orange-500 animate-pulse align-middle"
      />
    </Component>
  );
}

// Fade in component for sections
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15%" }}
      transition={{ duration: 0.8, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

import { useAuth } from '@/components/AuthProvider';

export default function LandingPage() {
  const { user } = useAuth();
  
  const [role, setRole] = useState<string>('USER');
  
  useEffect(() => {
    if (user) {
      user.getIdTokenResult(true).then(tokenResult => {
        setRole((tokenResult.claims?.role as string) || 'USER');
      }).catch(console.error);
    }
  }, [user]);

  const workspaceRoute = role === 'SUPPORT' ? '/support' : '/ide';

  const icons = [
    Settings, CircuitBoard, Cpu, Cable, TerminalSquare, Box, 
    Component, Zap, Database, Usb, MonitorDot, Rocket
  ];

  return (
    <div className="w-full min-h-screen bg-white text-[#111] font-sans selection:bg-green-500/20 overflow-x-hidden">
      
      {/* Navbar: Fully Transparent, No Border */}
      <header className="fixed top-0 left-0 right-0 h-20 flex items-center justify-between px-6 md:px-12 z-50 bg-transparent">
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#eab308" />
                <stop offset="50%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            <g stroke="url(#logoGrad)">
              <path d="M12 22V4" />
              <path d="M12 14H9a2 2 0 0 1-2-2V8" />
              <path d="M12 10h3a2 2 0 0 0 2-2V5" />
            </g>
          </svg>
          <span className="font-semibold text-lg tracking-tight">Kaktus</span>
        </div>
        
        <nav className="hidden lg:flex items-center gap-10 text-sm font-medium text-gray-500">
          <Link href="/app-info" className="hover:text-black transition-colors">App Info</Link>
          <Link href="/how-to-use" className="hover:text-black transition-colors">How to Use</Link>
          <a href="#pricing" className="hover:text-black transition-colors">Pricing</a>
          {!user ? (
            <Link href="/login" className="font-semibold text-green-600 hover:text-green-700">Login</Link>
          ) : (
            <Link href={workspaceRoute} className="font-semibold text-green-600 hover:text-green-700">Workspace</Link>
          )}
        </nav>
        
        <div className="w-[100px] hidden md:block"></div>
      </header>

      {/* Hero Section */}
      <main className="relative w-full h-screen flex flex-col justify-center items-center text-center">
        
        {/* 3D Background */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
          <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
            <ambientLight intensity={1} />
            <ParticleWave />
          </Canvas>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center max-w-5xl px-6 mt-10">
          <div className="flex items-center gap-2 mb-6">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <g stroke="url(#logoGrad)">
                <path d="M12 22V4" />
                <path d="M12 14H9a2 2 0 0 1-2-2V8" />
                <path d="M12 10h3a2 2 0 0 0 2-2V5" />
              </g>
            </svg>
            <span className="font-semibold text-xl">Kaktus</span>
          </div>
          
          <TypingText 
            text="Experience liftoff with the next-gen hardware platform"
            as="h1"
            delaySpeed={0.25}
            duration={0.6}
            className="text-5xl md:text-7xl lg:text-[5rem] leading-[1.1] font-bold tracking-tight text-[#111] mb-10 flex flex-wrap justify-center"
          />
        </div>
      </main>

      {/* Intro Arc Section */}
      <section className="w-full min-h-[60vh] bg-white flex flex-col items-center justify-center py-10 px-6 relative z-10">
        <div className="flex justify-center items-end h-40 mb-16 gap-3 md:gap-5">
          {icons.map((Icon, i) => {
            const center = (icons.length - 1) / 2;
            const dist = Math.abs(i - center);
            const translateY = (dist * dist) * 1.5; 
            
            return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: translateY + 30 }}
                whileInView={{ opacity: 1, y: translateY }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="w-10 h-10 md:w-14 md:h-14 rounded-full border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white flex items-center justify-center text-gray-400"
              >
                <Icon size={20} strokeWidth={1.5} />
              </motion.div>
            );
          })}
        </div>

        <div className="text-center px-4">
          <TypingText 
            text="Kaktus is our intelligent hardware engineering platform, allowing anyone to design, wire, and build in the AI-first era." 
            delaySpeed={0.08}
            className="text-4xl md:text-5xl font-medium text-[#111] leading-tight flex flex-wrap gap-x-3 gap-y-2 justify-center max-w-4xl mx-auto"
          />
        </div>
      </section>

      {/* New High-Level Info Sections for Main Page */}
      <section className="w-full py-32 px-6 md:px-12 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <FadeIn>
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-8">
              <Brain className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Omniscient Intelligence.</h2>
            <p className="text-xl text-gray-500 leading-relaxed mb-8">
              We replaced thousands of datasheets and hours of manual routing with a single, omniscient AGI core that understands physics.
            </p>
            <Link href="/app-info" className="inline-flex items-center gap-2 text-orange-600 font-medium hover:text-orange-700">
              Read how the engine works <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </FadeIn>
          <FadeIn delay={0.2} className="bg-gray-50 rounded-3xl p-12 h-96 flex items-center justify-center border border-gray-100 shadow-inner">
            {/* Minimal graphic representing intelligence */}
            <div className="relative w-40 h-40">
              <div className="absolute inset-0 border-2 border-orange-200 rounded-full animate-ping opacity-20"></div>
              <div className="absolute inset-4 border-2 border-orange-300 rounded-full animate-spin" style={{ animationDuration: '4s' }}></div>
              <div className="absolute inset-8 border-2 border-orange-400 rounded-full animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }}></div>
              <div className="absolute inset-0 flex items-center justify-center"><Brain className="w-8 h-8 text-orange-500" /></div>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="w-full py-32 px-6 md:px-12 bg-gray-50/50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <FadeIn className="bg-white rounded-3xl p-12 h-96 flex items-center justify-center border border-gray-100 shadow-sm order-2 md:order-1">
             {/* Minimal graphic representing simulation */}
             <div className="flex flex-col gap-4 w-full max-w-xs">
               <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                 <div className="h-full bg-green-400 w-3/4 animate-pulse"></div>
               </div>
               <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                 <div className="h-full bg-blue-400 w-1/2 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
               </div>
               <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                 <div className="h-full bg-yellow-400 w-5/6 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
               </div>
             </div>
          </FadeIn>
          <FadeIn delay={0.2} className="order-1 md:order-2">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-8">
              <Code2 className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Simulate Reality.</h2>
            <p className="text-xl text-gray-500 leading-relaxed mb-8">
              Test your firmware directly against virtual hardware. The system compiles C++ instantly and simulates serial logic in real-time.
            </p>
            <Link href="/how-to-use" className="inline-flex items-center gap-2 text-green-600 font-medium hover:text-green-700">
              See the step-by-step guide <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </FadeIn>
        </div>
      </section>
      <PricingSection />

      {/* Huge CTA Section at the absolute bottom */}
      <section className="w-full py-40 px-6 flex flex-col items-center justify-center text-center bg-gray-50/50 border-t border-gray-100">
        <FadeIn className="flex flex-col items-center max-w-3xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-8">
            <Rocket className="text-green-600 w-10 h-10" />
          </div>
          <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
            Ready to build?
          </h2>
          <p className="text-xl text-gray-500 mb-12">
            Join the physical-first era. Enter the workspace and let Kaktus turn your ideas into reality.
          </p>
          <Link 
            href={user ? workspaceRoute : '/login?redirect=/ide'}
            className="group relative px-10 py-5 bg-[#111] text-white text-xl font-bold rounded-full hover:bg-black transition-all hover:scale-105 shadow-2xl flex items-center gap-3 overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              Enter Workspace 
              <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 via-green-500 to-orange-500 opacity-0 group-hover:opacity-20 transition-opacity"></div>
          </Link>
        </FadeIn>
      </section>

    </div>
  );
}
