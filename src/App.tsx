import { useState, useEffect, useRef } from "react";
import "./App.css";
import Key from "./Key";

function App() {
  const [gainValue, setGainValue] = useState(0.05);
  const [octave, setOctave] = useState(0);
  const [frequency, setFrequency] = useState(0); // For Fine Tuning
  const [attack, setAttack] = useState(0);
  const [decay, setDecay] = useState(0);
  const [sustain, setSustain] = useState(0);
  const [release, setRelease] = useState(0);

  // Referencias para mantener los nodos de audio estables
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);

  // Inicializar el contexto de audio y los nodos una sola vez
  useEffect(() => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const oscillator2 = ctx.createOscillator();
    const oscillators = [oscillator, oscillator2];
    const gainNode = ctx.createGain();

    oscillator.detune.value = -15;
    oscillator2.detune.value = 25;

    oscillators.forEach((osc) => {
      osc.type = "square"; // Set the oscillator type
      osc.frequency.value = 120; // Default frequency (A4)
      osc.connect(gainNode);
    });

    gainNode.connect(ctx.destination);

    // Guardar las referencias
    audioContextRef.current = ctx;
    gainNodeRef.current = gainNode;
    oscillatorsRef.current = oscillators;

    // Cleanup function
    return () => {
      oscillators.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {
          // Ignorar errores si el oscillator ya está parado
        }
      });
      ctx.close();
    };
  }, []);

  // Actualizar el gain cada vez que gainValue cambie
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = gainValue;
    }
  }, [gainValue]);

  
  function startOscillators() {
    if (oscillatorsRef.current) {
      oscillatorsRef.current.forEach((osc) => {
        try {
          osc.start();
        } catch (e) {
          // Ignorar errores si el oscillator ya está iniciado
        }
      });
    }
  }

  function playNote(noteFrequency: number) {
    if (oscillatorsRef.current) {
      oscillatorsRef.current.forEach((osc) => {
        if (audioContextRef.current) {
          gainNodeRef.current?.gain.cancelScheduledValues(audioContextRef.current.currentTime);
          gainNodeRef.current?.gain.setValueAtTime(0, audioContextRef.current.currentTime);
          osc.frequency.value = noteFrequency;
          gainNodeRef.current?.gain.linearRampToValueAtTime(gainValue, audioContextRef.current.currentTime + attack);
          console.log('Freq:', osc.frequency.value);
        }
      });
    }
  }

  function releaseNote() {
    if (audioContextRef.current && gainNodeRef.current) {
      gainNodeRef.current.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + release);
    }
    }


  return (
    <>
      <div className="bg-zinc-900 border border-zinc-700 p-8 rounded-2xl shadow-2xl max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">N333 Synth</h1>
          <p className="text-zinc-400">Fine Tuning, Sustain and Decay currently not working, lemme rest lol</p>
          <p className="text-zinc-400">Only 2 detuned squares, will be adding other sounds</p>
        </div>

        {/* Main Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ADSR Section */}
          <div className="bg-zinc-800 border border-zinc-600 p-6 rounded-xl">
            <h3 className="text-white text-lg font-semibold mb-4 flex items-center">
              <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
              Envelope (ADSR)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="attack" className="text-zinc-300 text-sm font-medium block">
                  Attack
                </label>
                <input
                  type="number"
                  name="attack"
                  id="attack"
                  onChange={(e) => setAttack(parseFloat(e.target.value))}
                  min="0"
                  step="0.01"
                  value={attack}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="decay" className="text-zinc-300 text-sm font-medium block">
                  Decay
                </label>
                <input
                  type="number"
                  name="decay"
                  id="decay"
                  onChange={(e) => setDecay(parseFloat(e.target.value))}
                  min="0"
                  step="0.01"
                  value={decay}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="sustain" className="text-zinc-300 text-sm font-medium block">
                  Sustain
                </label>
                <input
                  type="number"
                  name="sustain"
                  id="sustain"
                  onChange={(e) => setSustain(parseFloat(e.target.value))}
                  min="0"
                  max="1"
                  step="0.01"
                  value={sustain}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="release" className="text-zinc-300 text-sm font-medium block">
                  Release
                </label>
                <input
                  type="number"
                  name="release"
                  id="release"
                  onChange={(e) => setRelease(parseFloat(e.target.value))}
                  min="0"
                  step="0.01"
                  value={release}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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

            <p className="text-sm text-zinc-400">(use a low gain)</p>
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="volume" className="text-zinc-300 text-sm font-medium block">
                  Gain
                </label>
                <input
                  type="range"
                  name="volume"
                  id="volume"
                  onChange={(e) => setGainValue(parseFloat(e.target.value))}
                  min="0"
                  max="1"
                  step="0.01"
                  value={gainValue}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="text-xs text-zinc-400 text-center">{gainValue.toFixed(2)}</div>
              </div>

              <button
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
                onClick={startOscillators}
              >
                🎵 Start Osc's
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
                <label htmlFor="octave" className="text-zinc-300 text-sm font-medium block">
                  Octave
                </label>
                <input
                  type="number"
                  name="octave"
                  id="octave"
                  onChange={(e) => setOctave(parseInt(e.target.value))}
                  min="0"
                  step="1"
                  value={octave}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="frequency" className="text-zinc-300 text-sm font-medium block">
                  Fine Tune (Hz)
                </label>
                <input
                  type="number"
                  name="frequency"
                  id="frequency"
                  onChange={(e) => setFrequency(parseFloat(e.target.value))}
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
      <div className="mt-8 bg-zinc-900 border border-zinc-700 p-6 rounded-2xl shadow-2xl max-w-6xl mx-auto">
        <h3 className="text-white text-lg font-semibold mb-6 flex items-center">
          <span className="w-3 h-3 bg-purple-500 rounded-full mr-3"></span>
          Piano (3 Octavas)
        </h3>
          <div className="flex justify-center">
          <div className="relative">
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
                    key={`white-${keyName}`}
                    keyName={keyName}
                    frequency={noteFrequency}
                    onPress={playNote}
                    onRelease={releaseNote}
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
                  return <div key={`spacer-${i}`} className="w-12"></div>;
                }
                
                const sharpNote = keyName + '#' + octaveNum;
                const blackKeyOffsets = { 'C#': 1, 'D#': 3, 'F#': 6, 'G#': 8, 'A#': 10 };
                const midiNumber = (octaveNum + 2) * 12 + blackKeyOffsets[keyName + '#' as keyof typeof blackKeyOffsets];
                const noteFrequency = 440 * Math.pow(2, (midiNumber - 69) / 12) + frequency;
                
                return (
                  <div key={`container-${i}`} className="relative w-12">
                    <Key
                      keyName={sharpNote}
                      isBlack={true}
                      frequency={noteFrequency}
                      onPress={playNote}
                      onRelease={releaseNote}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        <div className="mt-4 text-center text-zinc-400 text-sm">
          Midi Not Implemented Yet
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
