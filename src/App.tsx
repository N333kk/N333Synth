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
  const [osc1Toggle, setOsc1Toggle] = useState(true);
  const [osc2Toggle, setOsc2Toggle] = useState(false);
  const [gainValue, setGainValue] = useState(0.05);
  const [octave, setOctave] = useState(0);
  const [waveform1, setWaveform1] = useState<OscillatorType>("square");
  const [detune1, setDetune1] = useState(0);
  const [detune2, setDetune2] = useState(0);
  const [waveform2, setWaveform2] = useState<OscillatorType>("square");
  const [frequency] = useState(0); // For Fine Tuning
  const [attack, setAttack] = useState(0.05);
  const [decay, setDecay] = useState(0.250);
  const [sustain, setSustain] = useState(1);
  const [release, setRelease] = useState(0.8);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set()); // Para feedback visual
  const [isMonophonic, setIsMonophonic] = useState(false); // Nuevo estado para modo monofónico

  // Referencias para mantener los nodos de audio estables
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const activeVoicesRef = useRef<Map<string, Voice>>(new Map()); // Map de voces activas
  const activeMidiKeysRef = useRef<Set<number>>(new Set()); // Rastrear teclas MIDI presionadas
  const isInitializedRef = useRef(false);

  const waveformArray: OscillatorType[] = [
    "sine",
    "square",
    "sawtooth",
    "triangle",
  ];

  // Referencias para acceder a los valores actuales desde los event listeners
  const waveform1Ref = useRef(waveform1);
  const waveform2Ref = useRef(waveform2);
  const detune1Ref = useRef(detune1);
  const detune2Ref = useRef(detune2);
  const attackRef = useRef(attack);
  const decayRef = useRef(decay);
  const sustainRef = useRef(sustain);
  const releaseRef = useRef(release);
  const frequencyRef = useRef(frequency);
  const isMonophonicRef = useRef(isMonophonic);

  function oscToggleHandler(oscToggle: boolean, setOscToggle: React.Dispatch<React.SetStateAction<boolean>>) {
    if (oscToggle) {
      setOscToggle(false);
    } else {
      setOscToggle(true);
    }
  }
  // Actualizar las referencias cuando cambien los valores
  useEffect(() => {
    waveform1Ref.current = waveform1;
    waveform2Ref.current = waveform2;
    detune1Ref.current = detune1;
    detune2Ref.current = detune2;
    attackRef.current = attack;
    decayRef.current = decay;
    sustainRef.current = sustain;
    releaseRef.current = release;
    frequencyRef.current = frequency;
    isMonophonicRef.current = isMonophonic;
  }, [
    waveform1,
    waveform2,
    detune1,
    detune2,
    attack,
    decay,
    sustain,
    release,
    frequency,
    isMonophonic,
  ]);

  // Función para limpiar una voz (usando useCallback para evitar recreación)
  const cleanupVoice = useCallback((voice: Voice) => {
    // Marcar como limpiada para evitar doble cleanup
    if (voice.isReleasing && voice.gainNode.gain.value === 0) {
      return;
    }

    voice.oscillators.forEach((osc) => {
      try {
        if (osc.context.state !== "closed") {
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
    activeMidiKeysRef.current.clear(); // Limpiar estado de teclas MIDI
    setActiveKeys(new Set());
  }; 
  
  // Inicializar el contexto de audio una sola vez
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

    const initMidi = () => {
      navigator.requestMIDIAccess().then((midiAccess) => {
        console.log("MIDI Access granted", midiAccess);
        console.log("MIDI Inputs:", midiAccess.inputs);
        console.log("MIDI Outputs:", midiAccess.outputs);
        midiAccess.inputs.forEach((input) => {
          input.onmidimessage = (message) => {
            const data = message.data;

            // Verificar que data no sea null
            if (!data || data.length < 1) {
              return; // Ignorar mensajes vacíos o null
            }

            // Ignorar MIDI Clock y otros mensajes de timing
            if (
              data[0] === 248 || // MIDI Clock (248)
              data[0] === 0xfa || // Start (250)
              data[0] === 0xfb || // Continue (251)
              data[0] === 0xfc || // Stop (252)
              data[0] === 0xfe || // Active Sensing (254)
              data[0] === 0xff
            ) {
              // System Reset (255)
              return; // Ignorar estos mensajes
            }

            // Si es un mensaje de nota encendida
            if (data[0] === 144) {
              const noteNumber = data[1];
              const velocity = data[2];

              // Solo procesar si velocity > 0 (note on real) y la tecla no está ya presionada
              if (velocity > 0 && !activeMidiKeysRef.current.has(noteNumber)) {
                // Marcar la tecla como presionada
                activeMidiKeysRef.current.add(noteNumber);

                // Tocar la nota
                console.log(`Note On: ${noteNumber} (Velocity: ${velocity})`);
                const noteFrequency =
                  midiMapRef.current![noteNumber].frequency +
                  frequencyRef.current; // Aplicar fine tuning
                playNote(
                  noteFrequency,
                  midiMapRef.current![noteNumber].keyName
                );
              } else if (
                velocity === 0 &&
                activeMidiKeysRef.current.has(noteNumber)
              ) {
                // velocity = 0 en note on equivale a note off
                activeMidiKeysRef.current.delete(noteNumber);
                releaseNote(
                  midiMapRef.current![noteNumber].keyName,
                  midiMapRef.current![noteNumber].frequency +
                    frequencyRef.current
                );
              }
            }

            // Note off message (canal 1)
            if (data[0] === 128) {
              const noteNumber = data[1];

              // Solo procesar si la tecla está actualmente presionada
              if (activeMidiKeysRef.current.has(noteNumber)) {
                activeMidiKeysRef.current.delete(noteNumber);
                releaseNote(
                  midiMapRef.current![noteNumber].keyName,
                  midiMapRef.current![noteNumber].frequency +
                    frequencyRef.current
                );
              }
            }
          };
        });
      });
    };

    initMidi();

    // Inicializar inmediatamente
    initAudio();

    // Para móviles, también manejar el primer toque del usuario
    const handleFirstInteraction = () => {
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("click", handleFirstInteraction);
    };

    document.addEventListener("touchstart", handleFirstInteraction);
    document.addEventListener("click", handleFirstInteraction); // Cleanup function
    return () => {
      // Necesitamos acceder a la referencia actual para limpiar las voces activas
      const currentActiveVoices = activeVoicesRef.current;
      const currentActiveMidiKeys = activeMidiKeysRef.current;
      const currentAudioContext = audioContextRef.current;

      // Limpiar todas las voces activas
      currentActiveVoices.forEach((voice) => {
        if (voice.cleanupTimeoutId) {
          clearTimeout(voice.cleanupTimeoutId);
        }
        cleanupVoice(voice);
      });
      currentActiveVoices.clear();
      currentActiveMidiKeys.clear(); // Limpiar estado de teclas MIDI

      if (currentAudioContext) {
        currentAudioContext.close();
      }
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("click", handleFirstInteraction);
    };
  }, [gainValue, cleanupVoice]); // Incluir gainValue y cleanupVoice como dependencias

  // Actualizar el master gain cada vez que gainValue cambie
  useEffect(() => {
    if (masterGainNodeRef.current) {
      masterGainNodeRef.current.gain.value = gainValue;
    }
  }, [gainValue]);

  // Función para convertir número MIDI a nombre de nota
  const midiToNoteName = (midiNumber: number): string => {
    const noteNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const octave = Math.floor(midiNumber / 12) - 1;
    const note = noteNames[midiNumber % 12];
    return `${note}${octave}`;
  };

  // Crear el midiMap estático una sola vez
  const midiMapRef =
    useRef<
      {
        midiNumber: number;
        frequency: number;
        midiKeyName: string;
        keyName: string;
      }[]
    >();

  if (!midiMapRef.current) {
    const midiMap: {
      midiNumber: number;
      frequency: number;
      midiKeyName: string;
      keyName: string;
    }[] = [];
    for (let i = 0; i < 128; i++) {
      const noteFrequency = 440 * Math.pow(2, (i - 69) / 12);
      midiMap.push({
        midiNumber: i,
        frequency: noteFrequency,
        midiKeyName: `MIDI-${i}`,
        keyName: midiToNoteName(i),
      });
    }
    midiMapRef.current = midiMap;
  }

  // Función para crear una nueva voz
  const createVoice = (noteFrequency: number, keyName: string): Voice => {
    if (!audioContextRef.current || !masterGainNodeRef.current) {
      throw new Error("Audio context not initialized");
    }

    const ctx = audioContextRef.current;

    // Creamos osciladores dependiendo de los toggles
    if (!osc1Toggle && !osc2Toggle) {
      return {
        oscillators: [],
        gainNode: ctx.createGain(),
        frequency: noteFrequency,
        keyName,
        isReleasing: false,
        startTime: ctx.currentTime,
      };
    } else if (!osc1Toggle) {
      const osc = ctx.createOscillator();
      osc.type = waveform2Ref.current;
      osc.frequency.value = noteFrequency;
      osc.detune.value = detune2Ref.current;

      const voiceGain = ctx.createGain();
      osc.connect(voiceGain);
      voiceGain.connect(masterGainNodeRef.current);

      voiceGain.gain.value = 0; // Inicializar gain en 0

      return {
        oscillators: [osc],
        gainNode: voiceGain,
        frequency: noteFrequency,
        keyName,
        isReleasing: false,
        startTime: ctx.currentTime,
      };
    } else if (!osc2Toggle) {
      const osc = ctx.createOscillator();
      osc.type = waveform1Ref.current;
      osc.frequency.value = noteFrequency;
      osc.detune.value = detune1Ref.current;

      const voiceGain = ctx.createGain();
      osc.connect(voiceGain);
      voiceGain.connect(masterGainNodeRef.current);

      voiceGain.gain.value = 0; // Inicializar gain en 0

      return {
        oscillators: [osc],
        gainNode: voiceGain,
        frequency: noteFrequency,
        keyName,
        isReleasing: false,
        startTime: ctx.currentTime,
      };
    } else {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();

      // Crear gain node para esta voz específica
      const voiceGain = ctx.createGain();

      // Configurar oscilladores con los valores ACTUALES usando las referencias
      osc1.type = waveform1Ref.current;
      osc2.type = waveform2Ref.current;
      osc1.frequency.value = noteFrequency;
      osc2.frequency.value = noteFrequency;

      // Detuning para sonido más rico con los valores ACTUALES usando las referencias
      osc1.detune.value = detune1Ref.current;
      osc2.detune.value = detune2Ref.current;

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
        startTime: ctx.currentTime,
      };
    }
  };

  // Función para aplicar el envelope ADSR a una voz
  const applyADSR = (voice: Voice, isRelease: boolean = false) => {
    if (!audioContextRef.current) return;

    console.log(`Applying ADSR to voice: ${voice.keyName}`);

    const ctx = audioContextRef.current;
    const currentTime = ctx.currentTime;
    const gainNode = voice.gainNode;

    // Cancelar cualquier automatización programada
    gainNode.gain.cancelScheduledValues(currentTime);

    if (isRelease) {
      // Fase de Release - usar el valor ACTUAL de release usando la referencia
      const currentGain = gainNode.gain.value;
      gainNode.gain.setValueAtTime(currentGain, currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0,
        currentTime + releaseRef.current
      );
      // Programar la limpieza de la voz después del release
      const timeoutId = setTimeout(() => {
        // Verificar que la voz todavía existe antes de limpiarla
        if (activeVoicesRef.current.has(voice.keyName)) {
          cleanupVoice(voice);
          activeVoicesRef.current.delete(voice.keyName);
          setActiveKeys((prev) => {
            const newSet = new Set(prev);
            newSet.delete(voice.keyName);
            return newSet;
          });
        }
      }, releaseRef.current * 1000 + 100); // Un poco extra para asegurar que termine

      // Guardar el timeout ID en la voz para poder cancelarlo si es necesario
      voice.cleanupTimeoutId = timeoutId;
    } else {
      // Fases Attack, Decay, Sustain - usar los valores ACTUALES usando las referencias
      gainNode.gain.setValueAtTime(0, currentTime);

      // Attack: 0 -> 1 en tiempo de attack ACTUAL
      gainNode.gain.linearRampToValueAtTime(1, currentTime + attackRef.current);

      // Decay: 1 -> sustain level ACTUAL en tiempo de decay ACTUAL
      gainNode.gain.linearRampToValueAtTime(
        sustainRef.current,
        currentTime + attackRef.current + decayRef.current
      );

      // Sustain: mantener el nivel de sustain ACTUAL (esto se mantiene hasta el release)
    }
  };

  function playNote(noteFrequency: number, keyName?: string) {
    // Resumir contexto de audio si está suspendido (importante para móviles)
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }

    if (!audioContextRef.current || !isInitializedRef.current) {
      console.warn("Audio context not initialized");
      return;
    }

    // Usar la frecuencia como identificador si no se proporciona keyName
    const voiceKey = keyName || noteFrequency.toString();

    // Si está en modo monofónico, detener todas las voces activas primero
    if (isMonophonicRef.current && activeVoicesRef.current.size > 0) {
      activeVoicesRef.current.forEach((voice) => {
        if (voice.cleanupTimeoutId) {
          clearTimeout(voice.cleanupTimeoutId);
        }
        cleanupVoice(voice);
      });
      activeVoicesRef.current.clear();
      setActiveKeys(new Set());
    }

    // Verificar si ya existe una voz para esta tecla
    const existingVoice = activeVoicesRef.current.get(voiceKey);

    if (existingVoice) {
      // Cancelar cualquier timeout de cleanup pendiente
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
      voice.oscillators.forEach((osc) => {
        osc.start();
      });

      // Aplicar envelope ADSR
      applyADSR(voice);

      // Guardar la voz activa
      activeVoicesRef.current.set(voiceKey, voice);
      setActiveKeys((prev) => new Set(prev).add(voiceKey));

      console.log(
        `Voice started: ${voiceKey} - Freq: ${noteFrequency.toFixed(
          2
        )}Hz - Mode: ${isMonophonicRef.current ? "Mono" : "Poly"}`
      );
    } catch (error) {
      console.error("Error creating voice:", error);
    }
  }

  function releaseNote(keyName?: string, noteFrequency?: number) {
    const voiceKey = keyName || noteFrequency?.toString() || "";
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
      setActiveKeys((prev) => {
        const newSet = new Set(prev);
        newSet.delete(voiceKey);
        return newSet;
      });
    }
  }

  return (
    <div>
      <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-8 rounded-2xl shadow-2xl max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            N333 Synth
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base">
            WebSynth with Polyphony
          </p>
          <div className="mt-2 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <p className="text-blue-300 text-xs sm:text-sm">
              {isMonophonic
                ? "Monophonic mode - One note at a time"
                : "Polyphonic mode - Multiple notes supported!"}
            </p>
          </div>

          {/* Active voices indicator */}
          <div className="mt-2 p-2 bg-green-900/30 border border-green-500/30 rounded-lg">
            <p className="text-green-300 text-xs">
              Active voices: {activeKeys.size} | Keys:{" "}
              {Array.from(activeKeys).join(", ")}
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
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="attack"
                  className="text-zinc-300 text-sm font-medium block"
                >
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
                <label
                  htmlFor="decay"
                  className="text-zinc-300 text-sm font-medium block"
                >
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
                <label
                  htmlFor="sustain"
                  className="text-zinc-300 text-sm font-medium block"
                >
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
                <label
                  htmlFor="release"
                  className="text-zinc-300 text-sm font-medium block"
                >
                  Release ({release.toFixed(2)}s)
                </label>
                <input
                  type="range"
                  name="release"
                  id="release"
                  onChange={(e) => setRelease(parseFloat(e.target.value))}
                  min="0"
                  max="8"
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
                <label
                  htmlFor="volume"
                  className="text-zinc-300 text-sm font-medium block"
                >
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
                <div className="text-xs text-zinc-400 text-center">
                  {gainValue.toFixed(3)}
                </div>
              </div>

              {/* Toggle Monophonic/Polyphonic */}
              <div className="space-y-2">
                <label className="text-zinc-300 text-sm font-medium block">
                  Playback Mode
                </label>
                <button
                  onClick={() => setIsMonophonic(!isMonophonic)}
                  className={`w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg ${
                    isMonophonic
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                      : "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
                  }`}
                >
                  {isMonophonic ? "🎹 Monophonic" : "🎼 Polyphonic"}
                </button>
              </div>

              <button
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold py-2 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
                onClick={stopAllVoices}
              >
                🛑 Stop All Voices
              </button>
              <div className="flex items-center justify-start space-x-4">
                <button 
                  onClick={() => oscToggleHandler(osc1Toggle, setOsc1Toggle)} 
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    osc1Toggle 
                      ? "bg-green-400 shadow-md shadow-green-300/90" 
                      : "bg-gray-400 hover:bg-gray-300"
                  }`}
                ></button>
                <span className="text-white font-medium text-xs">Osc 1</span>

                <button 
                  onClick={() => oscToggleHandler(osc2Toggle, setOsc2Toggle)} 
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    osc2Toggle 
                      ? "bg-green-400 shadow-md shadow-green-300/90" 
                      : "bg-gray-400 hover:bg-gray-300"
                  }`}
                ></button>
                <span className="text-white font-medium text-xs">Osc 2</span>
              </div>
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
                          ? "bg-orange-500 text-white shadow-lg transform scale-105"
                          : "bg-transparent text-zinc-300 hover:bg-zinc-600 hover:text-white"
                      }`}
                    >
                      {octNum}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-zinc-300 text-sm font-medium block">
                  OSC1 Waveform
                </label>
                <div className="flex gap-1 bg-zinc-700 border border-zinc-600 rounded-lg p-1">
                  {waveformArray.map((waveform) => (
                    <button
                      key={waveform}
                      onClick={() => setWaveform1(waveform)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                        waveform1 === waveform
                          ? "bg-orange-500 text-white shadow-lg transform scale-105"
                          : "bg-transparent text-zinc-300 hover:bg-zinc-600 hover:text-white"
                      }`}
                    >
                      {waveform}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-zinc-300 text-sm font-medium block">
                  OSC2 Waveform
                </label>
                <div className="flex gap-1 bg-zinc-700 border border-zinc-600 rounded-lg p-1">
                  {waveformArray.map((waveform) => (
                    <button
                      key={waveform}
                      onClick={() => setWaveform2(waveform)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                        waveform2 === waveform
                          ? "bg-orange-500 text-white shadow-lg transform scale-105"
                          : "bg-transparent text-zinc-300 hover:bg-zinc-600 hover:text-white"
                      }`}
                    >
                      {waveform}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="detune1"
                    className="text-zinc-300 text-sm font-medium block"
                  >
                    Detune OSC1 ({detune1}Hz)
                  </label>
                  <input
                    type="range"
                    name="detune1"
                    id="detune1"
                    onChange={(e) =>
                      setDetune1(parseFloat(e.target.value) || 0)
                    }
                    step="1"
                    max={1000}
                    value={detune1}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="detune2"
                    className="text-zinc-300 text-sm font-medium block"
                  >
                    Detune OSC2 ({detune2}Hz)
                  </label>
                  <input
                    type="range"
                    name="detune2"
                    id="detune2"
                    onChange={(e) =>
                      setDetune2(parseFloat(e.target.value) || 0)
                    }
                    step="1"
                    max={100}
                    value={detune2}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
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
            Piano Roll - {isMonophonic ? "Monophonic" : "Polyphonic"}
          </h3>
          <div className="flex justify-center overflow-x-auto">
            <div className="relative min-w-max">
              {/* Teclas blancas */}
              <div className="flex">
                {Array.from({ length: 21 }, (_, i) => {
                  const whiteKeys = ["C", "D", "E", "F", "G", "A", "B"];
                  const octaveNum = Math.floor(i / 7) + octave;
                  const keyName = whiteKeys[i % 7] + octaveNum;
                  const whiteKeyMidiOffsets = [0, 2, 4, 5, 7, 9, 11];
                  const midiNumber =
                    (octaveNum + 2) * 12 + whiteKeyMidiOffsets[i % 7];
                  const noteFrequency =
                    440 * Math.pow(2, (midiNumber - 69) / 12) + frequency;

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
                  const whiteKeys = ["C", "D", "E", "F", "G", "A", "B"];
                  const keyName = whiteKeys[i % 7];
                  const octaveNum = Math.floor(i / 7) + octave;

                  if (!["C", "D", "F", "G", "A"].includes(keyName)) {
                    return (
                      <div
                        key={`spacer-${i}-oct${octave}`}
                        className="w-8 sm:w-12"
                      ></div>
                    );
                  }

                  const sharpNote = keyName + "#" + octaveNum;
                  const blackKeyOffsets = {
                    "C#": 1,
                    "D#": 3,
                    "F#": 6,
                    "G#": 8,
                    "A#": 10,
                  };
                  const midiNumber =
                    (octaveNum + 2) * 12 +
                    blackKeyOffsets[
                      (keyName + "#") as keyof typeof blackKeyOffsets
                    ];
                  const noteFrequency =
                    440 * Math.pow(2, (midiNumber - 69) / 12) + frequency;

                  return (
                    <div
                      key={`container-${i}-oct${octave}-freq${frequency}`}
                      className="relative w-8 sm:w-12"
                    >
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
            Working on performance improvements and more features!
          </div>
        </div>

        <div>
          <p className="text-center text-zinc-500 text-xs mt-4">
            Made with ❤️ by <a href="https://github.com/N333kk">N333KK</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
