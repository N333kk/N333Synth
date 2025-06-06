interface KeyProps {
  keyName: string;
  isBlack?: boolean;
  frequency: number;
  onPress: (freq: number) => void;
  onRelease: () => void;
}

function Key({ keyName, isBlack = false, frequency, onPress, onRelease }: KeyProps) {
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevenir scroll y zoom
    onPress(frequency);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevenir scroll y zoom
    onRelease();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onPress(frequency);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    onRelease();
  };

  // Manejar cuando el usuario mueve el dedo fuera de la tecla
  const handleTouchCancel = (e: React.TouchEvent) => {
    e.preventDefault();
    onRelease();
  };

  const handleMouseLeave = () => {
    onRelease();
  };

  if (isBlack) {
    return (
      <button
        className="absolute bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white font-medium w-6 h-16 sm:w-8 sm:h-20 -ml-3 sm:-ml-4 z-10 transition-all duration-75 active:scale-95 shadow-lg rounded-b-md touch-manipulation select-none"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{ touchAction: 'none' }} // Prevenir gestos del navegador
      >
        <span className="absolute bottom-1 text-xs opacity-80 pointer-events-none">
          {keyName}
        </span>
      </button>
    );
  }

  return (
    <button
      className="bg-white rounded-b-xl hover:bg-gray-100 active:bg-gray-200 border border-gray-300 text-black font-medium w-8 h-24 sm:w-12 sm:h-32 relative transition-all duration-75 active:scale-95 shadow-md touch-manipulation select-none"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{ touchAction: 'none' }} // Prevenir gestos del navegador
    >
      <span className="absolute bottom-1 sm:bottom-2 text-xs text-gray-600 pointer-events-none">
        {keyName}
      </span>
    </button>
  );
}

export default Key;
