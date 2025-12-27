import React from 'react';
import './ProgressIndicator.css';

function ProgressIndicator({ progress, message, estimatedTimeRemaining }) {
  const formatTime = (ms) => {
    if (!ms) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="progress-indicator">
      <div className="progress-header">
        <span className="progress-message">{message}</span>
        {estimatedTimeRemaining > 0 && (
          <span className="progress-time">
            ~{formatTime(estimatedTimeRemaining)} remaining
          </span>
        )}
      </div>
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
        >
          <span className="progress-percentage">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
}

export default ProgressIndicator;
