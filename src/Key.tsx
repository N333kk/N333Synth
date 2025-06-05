interface KeyProps {
  keyName: string;
  isBlack?: boolean;
  frequency: number;
  onPress: (freq: number) => void;
  onRelease: () => void;
}

function Key({ keyName, isBlack = false, frequency, onPress, onRelease }: KeyProps) {
  if (isBlack) {
    return (
      <button
        className="absolute bg-gray-900 hover:bg-gray-800 text-white font-medium w-8 h-20 -ml-4 z-10 transition-all duration-75 active:scale-95 shadow-lg rounded-b-md"
        onMouseDown={() => onPress(frequency)}
        onMouseUp={() => onRelease()}
      >
        <span className="absolute bottom-1 text-xs opacity-80">
          {keyName}
        </span>
      </button>
    );
  }

  return (
    <button
      className="bg-white rounded-b-xl hover:bg-gray-100 border border-gray-300 text-black font-medium w-12 h-32 relative transition-all duration-75 active:scale-95 shadow-md"
      onMouseDown={() => onPress(frequency)}
      onMouseUp={() => onRelease()}
    >
      <span className="absolute bottom-2 text-xs text-gray-600">
        {keyName}
      </span>
    </button>
  );
}

export default Key;
