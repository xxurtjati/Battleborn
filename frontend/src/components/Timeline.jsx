import React, { useRef, useEffect } from 'react';
import './Timeline.css';

function Timeline({ duration, currentTime, cutPoints, trimStart, trimEnd, onTimelineClick, onRemoveCutPoint }) {
  const timelineRef = useRef(null);

  const handleClick = (e) => {
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * duration;
    onTimelineClick(time);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="timeline-container">
      <div className="timeline" ref={timelineRef} onClick={handleClick}>
        <div
          className="timeline-progress"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        />

        <div
          className="playhead"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />

        {/* Trim overlays - dimmed regions outside trim range */}
        {trimStart > 0 && (
          <div
            className="trim-overlay"
            style={{
              left: 0,
              width: `${(trimStart / duration) * 100}%`,
            }}
          />
        )}
        {trimEnd < duration && (
          <div
            className="trim-overlay"
            style={{
              left: `${(trimEnd / duration) * 100}%`,
              width: `${((duration - trimEnd) / duration) * 100}%`,
            }}
          />
        )}

        {/* Trim markers */}
        {trimStart > 0 && (
          <div
            className="trim-marker"
            style={{ left: `${(trimStart / duration) * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="trim-marker-line" />
            <div className="trim-marker-handle">TRIM START</div>
          </div>
        )}
        {trimEnd < duration && (
          <div
            className="trim-marker"
            style={{ left: `${(trimEnd / duration) * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="trim-marker-line" />
            <div className="trim-marker-handle">TRIM END</div>
          </div>
        )}

        {cutPoints.map((time, index) => (
          <div
            key={index}
            className="cut-marker"
            style={{ left: `${(time / duration) * 100}%` }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="cut-marker-line" />
            <div className="cut-marker-handle">
              <span className="cut-marker-time">{formatTime(time)}</span>
              <button
                className="cut-marker-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveCutPoint(time);
                }}
                title="Remove cut point"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="timeline-labels">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export default Timeline;
