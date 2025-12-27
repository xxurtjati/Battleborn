import React from 'react';
import './SegmentList.css';

function SegmentList({ segments, formatTime }) {
  const handleDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="segment-list">
      <h3>Exported Segments</h3>
      <div className="segments-grid">
        {segments.map((segment) => (
          <div key={segment.index} className="segment-card">
            <div className="segment-header">
              <h4>Segment {segment.index}</h4>
              <span className="segment-duration-badge">
                {formatTime(segment.duration)}
              </span>
            </div>

            <div className="segment-info">
              <div className="segment-time-range">
                {formatTime(segment.start)} → {formatTime(segment.end)}
              </div>
            </div>

            <div className="segment-actions">
              <video
                src={segment.url}
                controls
                className="segment-preview"
              />

              <button
                className="download-button"
                onClick={() => handleDownload(segment.url, segment.filename)}
              >
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SegmentList;
