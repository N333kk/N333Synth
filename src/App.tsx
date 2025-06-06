import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import Key from "./Key";

// Interfaz para una voz individual
interface Voice {
  oscillators: OscillatorNode[];
  gainNode: GainNode;
  frequency: number;
  keyName: string;
  isReleasing: boolean;
  startTime: number;
  cleanupTimeoutId?: number;
}

function App() {
  const [gainValue, setGainValue] = useState(0.05);
  const [octave, setOctave] = useState(0);
  const [frequency, setFrequency] = useState(0); // For Fine Tuning
  const [attack, setAttack] = useState(0.1);
  const [decay, setDecay] = useState(0.3);
  const [sustain, setSustain] = useState(0.7);
  const [release, setRelease] = useState(0.5);  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set()); // Para feedback visual

  // Referencias para mantener los nodos de audio estables
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);  const activeVoicesRef = useRef<Map<string, Voice>>(new Map()); // Map de voces activas
  const isInitializedRef = useRef(false);
  
  // Función para limpiar una voz (usando useCallback para evitar recreación)
  const cleanupVoice = useCallback((voice: Voice) => {
    // Marcar como limpiada para evitar doble cleanup
    if (voice.isReleasing && voice.gainNode.gain.value === 0) {
      return;
    }
    
    voice.oscillators.forEach(osc => {
      try {
        if (osc.context.state !== 'closed') {
          osc.stop();
        }
        osc.disconnect();
      } catch {
        // Ignorar errores si el oscillator ya está parado
      }
    });
    try {
      voice.gainNode.disconnect();
    } catch {
      // Ignorar errores
    }
  }, []);
  
  // Función de emergencia para detener todas las voces
  const stopAllVoices = () => {
    console.log("Emergency stop - cleaning all voices");
    activeVoicesRef.current.forEach((voice) => {
      if (voice.cleanupTimeoutId) {
        clearTimeout(voice.cleanupTimeoutId);
      }
      cleanupVoice(voice);
    });
    activeVoicesRef.current.clear();
    setActiveKeys(new Set());
  };  // Inicializar el contexto de audio una sola vez
  useEffect(() => {
    const initAudio = () => {
      const ctx = new AudioContext();
      const masterGain = ctx.createGain();
      
      // Conectar el gain master al destino
      masterGain.connect(ctx.destination);
      masterGain.gain.value = gainValue;

      // Guardar las referencias
      audioContextRef.current = ctx;
      masterGainNodeRef.current = masterGain;
      isInitializedRef.current = true;
    };

    // Inicializar inmediatamente
    initAudio();

    // Para móviles, también manejar el primer toque del usuario
    const handleFirstInteraction = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };

    document.addEventListener('touchstart', handleFirstInteraction);
    document.addEventListener('click', handleFirstInteraction);    // Cleanup function
    return () => {
      // Necesitamos acceder a la referencia actual para limpiar las voces activas
      const currentActiveVoices = activeVoicesRef.current;
      const currentAudioContext = audioContextRef.current;
      
      // Limpiar todas las voces activas
      currentActiveVoices.forEach((voice) => {
        if (voice.cleanupTimeoutId) {
          clearTimeout(voice.cleanupTimeoutId);
        }
        cleanupVoice(voice);
      });
      currentActiveVoices.clear();
      
      if (currentAudioContext) {
        currentAudioContext.close();
      }
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, [gainValue, cleanupVoice]); // Incluir gainValue y cleanupVoice como dependencias

  // Actualizar el master gain cada vez que gainValue cambie
  useEffect(() => {
    if (masterGainNodeRef.current) {
      masterGainNodeRef.current.gain.value = gainValue;    }
  }, [gainValue]);

  // Función para crear una nueva voz
  const createVoice = (noteFrequency: number, keyName: string): Voice => {
    if (!audioContextRef.current || !masterGainNodeRef.current) {
      throw new Error("Audio context not initialized");
    }

    const ctx = audioContextRef.current;
    
    // Crear dos oscilladores para esta voz (para que suene más rico)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    
    // Crear gain node para esta voz específica
    const voiceGain = ctx.createGain();
    
    // Configurar oscilladores
    osc1.type = "square";
    osc2.type = "square";
    osc1.frequency.value = noteFrequency;
    osc2.frequency.value = noteFrequency;
    
    // Detuning para sonido más rico
    osc1.detune.value = -15;
    osc2.detune.value = 25;
    
    // Conectar oscilladores al gain de la voz
    osc1.connect(voiceGain);
    osc2.connect(voiceGain);
    
    // Conectar el gain de la voz al master gain
    voiceGain.connect(masterGainNodeRef.current);
    
    // Inicializar el gain en 0 para el envelope
    voiceGain.gain.value = 0;
    
    return {
      oscillators: [osc1, osc2],
      gainNode: voiceGain,
      frequency: noteFrequency,
      keyName,
      isReleasing: false,
      startTime: ctx.currentTime
    };
  };
  // Función para aplicar el envelope ADSR a una voz
  const applyADSR = (voice: Voice, isRelease: boolean = false) => {
    if (!audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    const currentTime = ctx.currentTime;
    const gainNode = voice.gainNode;
    
    // Cancelar cualquier automatización programada
    gainNode.gain.cancelScheduledValues(currentTime);
    
    if (isRelease) {
      // Fase de Release
      const currentGain = gainNode.gain.value;
      gainNode.gain.setValueAtTime(currentGain, currentTime);
      gainNode.gain.linearRampToValueAtTime(0, currentTime + release);
        // Programar la limpieza de la voz después del release
      const timeoutId = setTimeout(() => {
        // Verificar que la voz todavía existe antes de limpiarla
        if (activeVoicesRef.current.has(voice.keyName)) {
          cleanupVoice(voice);
          activeVoicesRef.current.delete(voice.keyName);
          setActiveKeys(prev => {
            const newSet = new Set(prev);
            newSet.delete(voice.keyName);
            return newSet;
          });
        }
      }, release * 1000 + 100); // Un poco extra para asegurar que termine
      
      // Guardar el timeout ID en la voz para poder cancelarlo si es necesario
      voice.cleanupTimeoutId = timeoutId;
      
    } else {
      // Fases Attack, Decay, Sustain
      gainNode.gain.setValueAtTime(0, currentTime);
      
      // Attack: 0 -> 1 en tiempo de attack
      gainNode.gain.linearRampToValueAtTime(1, currentTime + attack);
      
      // Decay: 1 -> sustain level en tiempo de decay
      gainNode.gain.linearRampToValueAtTime(sustain, currentTime + attack + decay);
      
      // Sustain: mantener el nivel de sustain (esto se mantiene hasta el release)
    }
  };

  function initializeAudio() {
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }  function playNote(noteFrequency: number, keyName?: string) {
    // Resumir contexto de audio si está suspendido (importante para móviles)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    if (!audioContextRef.current || !isInitializedRef.current) {
      console.warn("Audio context not initialized");
      return;
    }

    // Usar la frecuencia como identificador si no se proporciona keyName
    const voiceKey = keyName || noteFrequency.toString();
    
    // Verificar si ya existe una voz para esta tecla
    const existingVoice = activeVoicesRef.current.get(voiceKey);
    
    if (existingVoice) {      // Cancelar cualquier timeout de cleanup pendiente
      if (existingVoice.cleanupTimeoutId) {
        clearTimeout(existingVoice.cleanupTimeoutId);
      }
      
      // Limpiar la voz existente inmediatamente
      console.log(`Replacing existing voice for: ${voiceKey}`);
      cleanupVoice(existingVoice);
      activeVoicesRef.current.delete(voiceKey);
    }
    
    try {
      // Crear nueva voz
      const voice = createVoice(noteFrequency, voiceKey);
      
      // Iniciar los oscilladores
      voice.oscillators.forEach(osc => {
        osc.start();
      });
      
      // Aplicar envelope ADSR
      applyADSR(voice);
      
      // Guardar la voz activa
      activeVoicesRef.current.set(voiceKey, voice);
      setActiveKeys(prev => new Set(prev).add(voiceKey));
      
      console.log(`Voice started: ${voiceKey} - Freq: ${noteFrequency.toFixed(2)}Hz`);
    } catch (error) {
      console.error("Error creating voice:", error);
    }
  }  function releaseNote(keyName?: string, noteFrequency?: number) {
    const voiceKey = keyName || noteFrequency?.toString() || '';
    const voice = activeVoicesRef.current.get(voiceKey);
    
    if (voice && !voice.isReleasing) {
      voice.isReleasing = true;
      applyADSR(voice, true);
      console.log(`Voice released: ${voiceKey}`);
    } else if (voice && voice.isReleasing) {
      // Si la voz ya está en release, acelerar el proceso
      console.log(`Force stopping voice: ${voiceKey}`);
      if (voice.cleanupTimeoutId) {
        clearTimeout(voice.cleanupTimeoutId);
      }
      cleanupVoice(voice);
      activeVoicesRef.current.delete(voiceKey);
      setActiveKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(voiceKey);
        return newSet;
      });
    }
  }

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-8 rounded-2xl shadow-2xl max-w-6xl mx-auto">        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">N333 Synth</h1>
          <p className="text-zinc-400 text-sm sm:text-base">WebSynth with Polyphony</p>
          <div className="mt-2 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <p className="text-blue-300 text-xs sm:text-sm">
              Now supports multiple notes at once!
            </p>
          </div>
          
          {/* Active voices indicator */}
          <div className="mt-2 p-2 bg-green-900/30 border border-green-500/30 rounded-lg">
            <p className="text-green-300 text-xs">
              Active voices: {activeKeys.size} | Keys: {Array.from(activeKeys).join(', ')}
            </p>
          </div>
        </div>

        {/* Main Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          
          {/* ADSR Section */}
          <div className="bg-zinc-800 border border-zinc-600 p-6 rounded-xl">
            <h3 className="text-white text-lg font-semibold mb-4 flex items-center">
              <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
              Envelope (ADSR)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="attack" className="text-zinc-300 text-sm font-medium block">
                  Attack ({attack.toFixed(2)}s)
                </label>
                <input
                  type="range"
                  name="attack"
                  id="attack"
                  onChange={(e) => setAttack(parseFloat(e.target.value))}
                  min="0"
                  max="2"
                  step="0.01"
                  value={attack}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="decay" className="text-zinc-300 text-sm font-medium block">
                  Decay ({decay.toFixed(2)}s)
                </label>
                <input
                  type="range"
                  name="decay"
                  id="decay"
                  onChange={(e) => setDecay(parseFloat(e.target.value))}
                  min="0"
                  max="2"
                  step="0.01"
                  value={decay}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="sustain" className="text-zinc-300 text-sm font-medium block">
                  Sustain ({sustain.toFixed(2)})
                </label>
                <input
                  type="range"
                  name="sustain"
                  id="sustain"
                  onChange={(e) => setSustain(parseFloat(e.target.value))}
                  min="0"
                  max="1"
                  step="0.01"
                  value={sustain}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="release" className="text-zinc-300 text-sm font-medium block">
                  Release ({release.toFixed(2)}s)
                </label>
                <input
                  type="range"
                  name="release"
                  id="release"
                  onChange={(e) => setRelease(parseFloat(e.target.value))}
                  min="0"
                  max="3"
                  step="0.01"
                  value={release}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
            </div>
          </div>

          {/* Audio Controls Section */}
          <div className="bg-zinc-800 border border-zinc-600 p-6 rounded-xl">
            <h3 className="text-white text-lg font-semibold mb-4 flex items-center">
              <span className="w-3 h-3 bg-green-500 rounded-full mr-3"></span>
              Audio Controls
            </h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="volume" className="text-zinc-300 text-sm font-medium block">
                  Master Gain
                </label>
                <input
                  type="range"
                  name="volume"
                  id="volume"
                  onChange={(e) => setGainValue(parseFloat(e.target.value))}
                  min="0"
                  max="0.3"
                  step="0.01"
                  value={gainValue}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="text-xs text-zinc-400 text-center">{gainValue.toFixed(3)}</div>
              </div>              <button
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
                onClick={initializeAudio}
              >
                🎵 Initialize Audio Context
              </button>
              
              <button
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold py-2 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
                onClick={stopAllVoices}
              >
                🛑 Stop All Voices
              </button>
            </div>
          </div>

          {/* Tuning Section */}
          <div className="bg-zinc-800 border border-zinc-600 p-6 rounded-xl">
            <h3 className="text-white text-lg font-semibold mb-4 flex items-center">
              <span className="w-3 h-3 bg-orange-500 rounded-full mr-3"></span>
              Tuning
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-zinc-300 text-sm font-medium block">
                  Octave
                </label>
                <div className="flex gap-1 bg-zinc-700 border border-zinc-600 rounded-lg p-1">
                  {[0, 1, 2, 3, 4, 5].map((octNum) => (
                    <button
                      key={octNum}
                      onClick={() => setOctave(octNum)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                        octave === octNum
                          ? 'bg-orange-500 text-white shadow-lg transform scale-105'
                          : 'bg-transparent text-zinc-300 hover:bg-zinc-600 hover:text-white'
                      }`}
                    >
                      {octNum}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="frequency" className="text-zinc-300 text-sm font-medium block">
                  Fine Tune (Hz)
                </label>
                <input
                  type="number"
                  name="frequency"
                  id="frequency"
                  onChange={(e) => setFrequency(parseFloat(e.target.value) || 0)}
                  step="1"
                  value={frequency}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Piano Roll */}
      <div className="mt-4 sm:mt-8 bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-2xl shadow-2xl max-w-6xl mx-auto">
        <h3 className="text-white text-lg font-semibold mb-4 sm:mb-6 flex items-center">
          <span className="w-3 h-3 bg-purple-500 rounded-full mr-3"></span>
          Piano Roll - Polyphonic
        </h3>
        <div className="flex justify-center overflow-x-auto">
          <div className="relative min-w-max">
            {/* Teclas blancas */}
            <div className="flex">
              {Array.from({ length: 21 }, (_, i) => {
                const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
                const octaveNum = Math.floor(i / 7) + octave;
                const keyName = whiteKeys[i % 7] + octaveNum;
                const whiteKeyMidiOffsets = [0, 2, 4, 5, 7, 9, 11];
                const midiNumber = (octaveNum + 2) * 12 + whiteKeyMidiOffsets[i % 7];
                const noteFrequency = 440 * Math.pow(2, (midiNumber - 69) / 12) + frequency;
                
                return (
                  <Key
                    key={`white-${keyName}-oct${octave}-freq${frequency}`}
                    keyName={keyName}
                    frequency={noteFrequency}
                    onPress={(freq) => playNote(freq, keyName)}
                    onRelease={() => releaseNote(keyName)}
                  />
                );
              })}
            </div>
            
            {/* Teclas negras */}
            <div className="absolute top-0 flex">
              {Array.from({ length: 21 }, (_, i) => {
                const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
                const keyName = whiteKeys[i % 7];
                const octaveNum = Math.floor(i / 7) + octave;

                if (!['C', 'D', 'F', 'G', 'A'].includes(keyName)) {
                  return <div key={`spacer-${i}-oct${octave}`} className="w-8 sm:w-12"></div>;
                }
                
                const sharpNote = keyName + '#' + octaveNum;
                const blackKeyOffsets = { 'C#': 1, 'D#': 3, 'F#': 6, 'G#': 8, 'A#': 10 };
                const midiNumber = (octaveNum + 2) * 12 + blackKeyOffsets[keyName + '#' as keyof typeof blackKeyOffsets];
                const noteFrequency = 440 * Math.pow(2, (midiNumber - 69) / 12) + frequency;

                return (
                  <div key={`container-${i}-oct${octave}-freq${frequency}`} className="relative w-8 sm:w-12">
                    <Key
                      keyName={sharpNote}
                      isBlack={true}
                      frequency={noteFrequency}
                      onPress={(freq) => playNote(freq, sharpNote)}
                      onRelease={() => releaseNote(sharpNote)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-4 text-center text-zinc-400 text-sm">
          Gotta add MIDI support, right?
        </div>
      </div>
      
      <div>
        <p className="text-center text-zinc-500 text-xs mt-4">
          Made with ❤️ by <a href="https://github.com/N333kk">N333KK</a>
        </p>
      </div>
    </>
  );
}

export default App;
