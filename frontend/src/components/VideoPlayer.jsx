import React, { useEffect } from 'react';
import './VideoPlayer.css';

function VideoPlayer({ videoUrl, videoRef, onTimeUpdate }) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoRef, onTimeUpdate]);

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="video-element"
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}

export default VideoPlayer;
