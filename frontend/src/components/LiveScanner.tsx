import React, { useRef, useState, useEffect } from 'react';

const LiveScanner = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLive, setIsLive] = useState(false);
  const [latestHeatmap, setLatestHeatmap] = useState<string | null>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const isProcessingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  
  // NEW: State for the view toggle
  const [viewMode, setViewMode] = useState<'detections' | 'heatmap'>('heatmap');

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsLive(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      alert("Please allow camera permissions to use the Live Scanner.");
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsLive(false);
    setLatestHeatmap(null);
    setDetections([]);
  };

  const captureAndPredict = async () => {
    if (!isLive || isProcessingRef.current || !videoRef.current || !canvasRef.current) return;

    isProcessingRef.current = true;
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isProcessingRef.current = false;
      return;
    }
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        isProcessingRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      try {
        const response = await fetch('http://127.0.0.1:8000/predict', {
          method: 'POST',
          body: formData,
        });
        
        if (response.ok) {
          const data = await response.json();
          setDetections(data.detections);
          setLatestHeatmap(data.heatmap);
        }
      } catch (error) {
        console.error("Inference error:", error);
      } finally {
        isProcessingRef.current = false;
      }
    }, 'image/jpeg', 0.8);
  };

  useEffect(() => {
    let intervalId: any;
    if (isLive) {
      intervalId = setInterval(captureAndPredict, 1000);
    }
    return () => clearInterval(intervalId);
  }, [isLive]);

  useEffect(() => {
    return () => stopWebcam();
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto p-4">
      <button 
        onClick={isLive ? stopWebcam : startWebcam} 
        className={`px-6 py-3 rounded-lg font-bold text-white transition-all shadow-md ${
          isLive ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isLive ? '⏹ Stop Live Scanner' : '▶️ Start Live Scanner'}
      </button>

      <div className="relative w-full bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-gray-400 dark:border-gray-700">
        
        {/* NEW: Toggle UI Overlay */}
        {isLive && (
          <div className="absolute top-4 right-4 z-20 flex bg-gray-900/80 rounded-lg p-1 border border-gray-700 backdrop-blur-sm">
            <button
              onClick={() => setViewMode('detections')}
              className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 ${viewMode === 'detections' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
            >
              ⛶ Detections
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 ${viewMode === 'heatmap' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
            >
              🔥 Heatmap
            </button>
          </div>
        )}

        {!isLive && <p className="text-gray-500 dark:text-gray-400 py-32">Camera is offline</p>}
        
        <canvas ref={canvasRef} className="hidden" />
        
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-auto object-contain ${!isLive ? 'hidden' : ''}`} 
        />
        
        {/* HEATMAP VIEW */}
        {latestHeatmap && isLive && viewMode === 'heatmap' && (
          <img 
            src={latestHeatmap} 
            alt="Heatmap" 
            className="absolute inset-0 w-full h-full object-contain opacity-65 pointer-events-none mix-blend-multiply dark:mix-blend-screen"
          />
        )}

        {/* DETECTIONS VIEW (Bounding Boxes) */}
        {isLive && viewMode === 'detections' && videoRef.current && (
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none z-10" 
            viewBox={`0 0 ${videoRef.current.videoWidth} ${videoRef.current.videoHeight}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {detections.map((d, i) => (
              <rect
                key={i}
                x={d.bbox.x1}
                y={d.bbox.y1}
                width={d.bbox.x2 - d.bbox.x1}
                height={d.bbox.y2 - d.bbox.y1}
                fill="none"
                stroke={d.severity === 'Critical' ? '#ef4444' : d.severity === 'Major' ? '#f97316' : '#22c55e'}
                strokeWidth="4"
                rx="4"
              />
            ))}
          </svg>
        )}
      </div>

      {detections.length > 0 && isLive && (
        <div className="w-full bg-white dark:bg-gray-800 p-4 rounded-xl shadow border dark:border-gray-700">
          <h3 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">
            Live Detections ({detections.length})
          </h3>
          <div className="flex flex-col gap-2">
            {detections.map((d, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded border dark:border-gray-700">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{d.class}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{(d.confidence * 100).toFixed(1)}% Conf</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  d.severity === 'Critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  d.severity === 'Major' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {d.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveScanner;